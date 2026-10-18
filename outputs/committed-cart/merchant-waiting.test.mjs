import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {parseHTML} from 'linkedom';

const html=await readFile(new URL('./merchant.html',import.meta.url),'utf8');
const source=(await readFile(new URL('./merchant-manager.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
const cart=(patch={})=>({id:'waiting-cart',items:[{name:'Smiski Sunday series',variant:'Blind box · New',quantity:2,cents:1800,url:'https://shop.example/smiski'}],amount:3600,shoppingTerms:{maxTotalCents:3200,minimumSavingsCents:600,waitHours:12},sellers:'Authorized retailers only',deliveryDate:new Date(Date.now()+5*86400000).toISOString().slice(0,10),expiresAt:new Date(Date.now()+12*3600000).toISOString(),waitHours:12,offerCount:2,...patch});
async function workspace(initialIntents=[]){
 const {document,window}=parseHTML(html),requests=[],timers=[];
 let currentIntents=initialIntents;
 const campaign={id:'saved',name:'Existing headphone campaign',merchant:'Example merchant',status:'paused',products:[]};
 const state={campaigns:[campaign],decisions:[],summary:{activeCampaigns:0,offers:0,selections:0,reservedCents:0},updatedAt:new Date().toISOString()};
 for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'value',{get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value);}});
 for(const form of document.querySelectorAll('form')){
  const originals=new Map([...form.querySelectorAll('input,select')].map(input=>[input,{value:input.value,checked:input.hasAttribute('checked')}]));
  Object.defineProperty(form,'elements',{get(){return {namedItem:name=>form.querySelector('[name="'+name+'"]')};}});
  form.reset=()=>{for(const [input,original]of originals){input.value=original.value;input.checked=original.checked;}};
  form.reportValidity=()=>true;
 }
 for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>dialog.setAttribute('open','');dialog.close=()=>dialog.removeAttribute('open');}
 const context=vm.createContext({document,window,console,crypto:{randomUUID},AbortSignal,Date,Intl,URL,navigator:{clipboard:{writeText:async()=>{}}},setInterval(fn,delay){timers.push({fn,delay});return timers.length;},fetch:async(path,options={})=>{requests.push({path,options});let data;if(path==='/api/merchant/state')data=state;else if(path==='/api/merchant/intents')data={intents:currentIntents};else if(path==='/api/merchant/execution')data={available:false};else throw Error('Unexpected request '+path);return {ok:true,json:async()=>structuredClone(data)};}});
 vm.runInContext(source,context);
 await window.refreshMerchantManager();
 return {document,window,requests,timers,setIntents(value){currentIntents=value;}};
}

test('merchant workspace opens on live waiting carts with shopper limits, not saved campaigns',async()=>{
 const w=await workspace([cart()]);
 assert.equal(w.document.querySelector('[data-m-view="waiting"]').getAttribute('aria-selected'),'true');
 const table=w.document.getElementById('merchantTable');
 assert.match(table.textContent,/Smiski Sunday series/);
 assert.match(table.textContent,/Blind box · New · Qty 2/);
 assert.match(table.textContent,/\$30\.00/,'Savings requirement reduces the $32 ceiling to $30');
 assert.match(table.textContent,/12 hr wait/);
 assert.match(table.textContent,/Until/);
 assert.equal(table.querySelector('tbody tr').children[4].textContent,'2');
 assert.deepEqual([...table.querySelectorAll('td[data-label]')].map(cell=>cell.dataset.label),['Cart budget','Delivery by','Wait remaining','Offers received']);
 assert.equal(table.querySelector('.waiting-action button').textContent,'Create offer campaign');
 assert.doesNotMatch(table.textContent,/headphone|Example merchant/i);
 assert.equal(w.document.getElementById('waitingCount').textContent,'1');
 assert.match(w.document.getElementById('merchantMetrics').textContent,/Waiting carts1/);
 assert.equal(w.document.getElementById('campaignFilter').hidden,true);
 assert.ok(w.requests.some(r=>r.path==='/api/merchant/intents'));
 assert.ok(w.timers.some(t=>t.delay===4000));
});

test('refresh replaces requests and counts, and expires carts without synthetic fallback rows',async()=>{
 const w=await workspace([cart()]);
 w.setIntents([cart({id:'expired',expiresAt:new Date(Date.now()-1000).toISOString()})]);
 await w.window.refreshMerchantManager();
 assert.equal(w.document.querySelectorAll('[data-waiting-cart]').length,0);
 assert.equal(w.document.getElementById('waitingCount').textContent,'0');
 assert.match(w.document.getElementById('merchantTable').textContent,/No customers waiting yet/);
 assert.match(w.document.getElementById('merchantTable').textContent,/approves the Visa sandbox hold/);
 assert.doesNotMatch(w.document.getElementById('merchantTable').textContent,/headphone|Smiski/i);
 w.setIntents([cart({id:'new-request',offerCount:0})]);
 await w.window.refreshMerchantManager();
 assert.equal(w.document.querySelector('[data-waiting-cart]').dataset.waitingCart,'new-request');
 assert.equal(w.document.getElementById('waitingCount').textContent,'1');
});

test('create offer campaign uses the selected real product and leaves merchant cost, stock and consent unconfirmed',async()=>{
 const w=await workspace([cart()]);
 await w.document.querySelector('[data-offer-cart]').onclick();
 assert.equal(w.document.getElementById('campaignDialog').hasAttribute('open'),true);
 const row=w.document.querySelector('#catalogRows tr');
 assert.equal(row.querySelector('[data-p="name"]').value,'Smiski Sunday series');
 assert.equal(row.querySelector('[data-p="variant"]').value,'Blind box · New');
 assert.equal(row.querySelector('[data-p="unitPrice"]').value,'18.00');
 assert.equal(row.dataset.url,'https://shop.example/smiski');
 assert.equal(row.querySelector('[data-p="cost"]').value,'');
 assert.equal(row.querySelector('[data-p="stock"]').value,'0');
 assert.equal(w.document.querySelector('[name="merchant"]').value,'');
 assert.equal(w.document.querySelector('[name="inventoryAttested"]').checked,false);
 assert.equal(w.document.querySelector('[name="sellerRule"]').value,'Authorized retailers only');
 assert.ok(w.requests.every(r=>!r.options.method||r.options.method==='GET'),'Opening a campaign must not submit an offer or payment');
});

test('a request that disappears before campaign creation is not used as a stale template',async()=>{
 const w=await workspace([cart()]);
 w.setIntents([]);
 await w.document.querySelector('[data-offer-cart]').onclick();
 assert.match(w.document.getElementById('campaignError').textContent,/no longer waiting/);
 assert.equal(w.document.querySelector('#catalogRows [data-p="name"]').value,'');
 assert.equal(w.document.getElementById('waitingCount').textContent,'0');
});


test('waiting carts use the product photo, suppress referrers, and fall back to a bag if it fails',async()=>{
 const request=cart();request.items[0].image='https://shop.example/images/smiski.jpg';
 const w=await workspace([request]);
 const photo=w.document.querySelector('[data-product-photo]');
 assert.equal(photo.src,'https://shop.example/images/smiski.jpg');
 assert.equal(photo.alt,'Smiski Sunday series');
 assert.equal(photo.getAttribute('width'),'64');
 assert.equal(photo.getAttribute('height'),'64');
 assert.equal(photo.getAttribute('referrerpolicy'),'no-referrer');
 photo.onerror();
 assert.equal(photo.src,'/assets/bags/yellow-wink.svg');
 assert.equal(photo.alt,'');
 assert.equal(photo.getAttribute('aria-hidden'),'true');
 assert.equal(photo.classList.contains('is-placeholder'),true);
});

test('missing or unsafe product photos show the brand placeholder, never an invented product image',async()=>{
 const request=cart();request.items.push({...request.items[0],name:'Second item',image:'javascript:alert(1)'});
 const w=await workspace([request]);
 assert.equal(w.document.querySelectorAll('[data-product-photo]').length,0);
 const images=[...w.document.querySelectorAll('.waiting-product-image')];
 assert.equal(images.length,2);
 assert.ok(images.every(image=>image.src==='/assets/bags/yellow-wink.svg'&&image.alt===''));
});
