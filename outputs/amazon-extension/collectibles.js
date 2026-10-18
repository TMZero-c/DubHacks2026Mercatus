const API='http://localhost:4318';
const $=id=>document.getElementById(id);
const money=cents=>(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
const panel=document.createElement('section');
panel.id='collectiblesPanel';panel.className='collectibles-panel';panel.hidden=true;panel.dataset.theme='light';
panel.innerHTML=`
  <div class="collectibles-top">
    <button id="collectiblesClose" class="deal-back" aria-label="Back to shopping">←</button>
    <h1 id="dealPanelTitle">Your deals</h1><span class="badge rounded-pill deal-badge-neutral">Demo</span>
  </div>
  <div class="collectibles-scroll">
    <div id="collectiblesStatus" class="collectibles-status" role="status"></div>
    <nav id="dealFilters" class="deal-filters" aria-label="Deal categories"></nav><div id="collectiblesList" class="list"></div><div id="productHistoryList" hidden></div>
    <form id="collectiblesClaim" class="collectibles-claim">
      <label for="collectiblesCode">Have a deal link?</label>
      <div class="deal-input-row"><input id="collectiblesCode" class="input input-sm" placeholder="Paste a shared deal link" autocomplete="off" required><button id="collectiblesClaimButton" class="btn btn-primary btn-sm">Add deal</button></div>
    </form>
    <details id="collectiblesIssue" class="deal-create" hidden>
      <summary>Create a creator deal <span aria-hidden="true">＋</span></summary>
      <div class="deal-create-content"><p>Share three $0.85 passes. Earn $0.05 per eligible purchase after settlement.</p><button id="collectiblesMint" class="btn btn-outline btn-sm">Create 3 test passes</button></div>
    </details>
    <div id="collectiblesCreator"></div>
    <details class="deal-demo"><summary>About test mode</summary><p>Test merchant and Visa test card. No real charges or shipment. Passes run on Solana Testnet; Mercatus holds them and covers network fees. Referral credit is pending, not paid.</p></details>
  </div>`;
document.body.append(panel);
let category='available',historyMode=false,historyVersion=0;
let state=null,working=false,seenJob='',lastOwner=null,polling=false,confirmation=null;
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const badge=(text,tone='neutral')=>el('span',text,'badge rounded-pill deal-badge-'+tone);
const button=(text,style='outline-primary')=>{const node=el('button',text,'btn btn-sm '+(style==='outline-primary'?'btn-outline':style==='link'?'btn-ghost':'btn-'+style));node.type='button';return node;};
const shortDate=value=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'});
function proofLink(proof,label){const link=el('a',label);link.href=proof.explorer;link.target='_blank';link.rel='noopener noreferrer';return link;}
async function request(path,body,endpoint=null){
  const {laterAuth}=await chrome.storage.local.get('laterAuth');
  if(!laterAuth?.token)throw Error('Sign in to Mercatus first.');
  const response=await fetch(API+(endpoint||'/api/collectibles'+path),{headers:{Authorization:'Bearer '+laterAuth.token,...(body?{'Content-Type':'application/json'}:{})},credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000),...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  const data=await response.json(),current=await chrome.storage.local.get('laterAuth');
  if(current.laterAuth?.token!==laterAuth.token)throw Error('Account changed. Reopen your deals.');
  if(!response.ok)throw Error(data.error||'Could not update this deal.');
  return data;
}
function message(text,error=false){$('collectiblesStatus').textContent=text;$('collectiblesStatus').classList.toggle('collectibles-error',error);}
async function action(path,body){
  if(working)return;working=true;message('Working…');
  try{await request(path,body);confirmation=null;category=path==='/share'?'shared':path==='/redeem'?'purchased':'available';await refresh();if(state)render();}catch(error){message(error.message,true);}finally{working=false;}
}
function receiptDetails(pass){
  const details=el('section',undefined,'deal-receipt');details.dataset.pass=pass.id;details.setAttribute('aria-label',pass.checkout?.capture?'Purchase receipt':'Deal information');
  const content=el('div',undefined,'deal-details-content'),terms=el('dl',undefined,'deal-terms');
  const row=(label,value)=>terms.append(el('dt',label),el('dd',value));
  if(pass.checkout?.capture){
    const heading=el('div',undefined,'receipt-heading');heading.append(el('h3','Purchase receipt'),badge(pass.checkout.capture.status==='PENDING'?'Payment pending':pass.checkout.capture.status.toLowerCase(),'neutral'));content.append(heading);
    row('Total',money(pass.priceCents)+' USD');row('Paid with','Visa · test card');row('Merchant',pass.merchant);
  }else{row('Merchant',pass.merchant);row('Valid until',shortDate(pass.expiresAt));}
  content.append(terms);
  if(pass.snapshot){
    const link=proofLink({explorer:pass.snapshot.explorer},'View on Solana ↗');link.className='solana-proof-link';
    const logo=document.createElementNS('http://www.w3.org/2000/svg','svg');logo.setAttribute('viewBox','0 0 32 28');logo.setAttribute('aria-hidden','true');logo.setAttribute('focusable','false');
    logo.innerHTML='<path fill="#14CFA0" d="M7 2h24l-6 6H1z"/><path fill="#6F88DA" d="M1 11h24l6 6H7z"/><path fill="#9945FF" d="M7 20h24l-6 6H1z"/>';
    link.prepend(logo);content.append(link);
  }
  if(pass.checkout?.capture){
    const copy=button('Copy receipt ID','ghost');copy.classList.add('receipt-copy');copy.onclick=async()=>{try{await navigator.clipboard.writeText(String(pass.checkout.capture.id));copy.textContent='Receipt ID copied';}catch{message('Receipt ID: '+pass.checkout.capture.id);}};content.append(copy);
    if(pass.checkout.capture.status==='PENDING')content.append(el('p','Payment submitted. Settlement is pending.','receipt-note'));
  }
  details.append(content);return details;
}
function checkout(pass){
  const box=el('div',undefined,'deal-checkout');box.append(el('h3','Confirm '+money(pass.priceCents)+' purchase'));
  const label=el('label'),check=el('input');check.type='checkbox';check.className='form-check-input';
  label.append(check,el('span','Use the public Visa test card. No real charge or shipment.'));
  const confirm=button('Confirm test purchase','primary');confirm.disabled=true;
  check.onchange=()=>{confirm.disabled=!check.checked||state.busy;};
  confirm.onclick=()=>action('/redeem',{id:pass.id,approved:true,testCard:'visa-1111'});
  const cancel=button('Cancel','link');cancel.onclick=()=>{confirmation=null;render();};
  const actions=el('div',undefined,'deal-checkout-actions');actions.append(confirm,cancel);box.append(label,actions);return box;
}
function render(){
  const openCards=new Set([...panel.querySelectorAll('.deal-card[open]')].map(node=>node.dataset.id));
  const expanded=new Set([...panel.querySelectorAll('.deal-details[open]')].map(node=>node.dataset.pass));
  const summary=$('collectiblesCreator');summary.replaceChildren();
  for(const drop of state.drops||[]){
    const activity=el('details',undefined,'deal-activity');activity.append(el('summary','Creator activity'));
    const rows=el('dl',undefined,'deal-terms');
    for(const [label,value]of[['Passes issued',drop.issued],['Claimed',drop.claimed],['Redeemed',drop.redeemed]])rows.append(el('dt',label),el('dd',String(value)));
    if(drop.pendingReferralCents)rows.append(el('dt','Credit pending settlement'),el('dd',money(drop.pendingReferralCents)));
    activity.append(rows);summary.append(activity);
  }
  if(state.canResumeIssue){const resume=button('Resume setup');resume.disabled=state.busy;resume.onclick=()=>action('/resumeIssue',{});summary.append(resume);}
  const list=$('collectiblesList');list.replaceChildren();
  $('collectiblesIssue').hidden=!state.canIssue;$('collectiblesMint').disabled=state.busy;$('collectiblesClaimButton').disabled=state.busy;
  const filters=$('dealFilters');filters.replaceChildren();
  for(const [key,label,icon] of [['available','Available','◇'],['shared','Shared','↗'],['purchased','Purchased','✓']]){
    const filter=button(icon+' '+label,'ghost');filter.setAttribute('aria-pressed',String(category===key));filter.onclick=()=>{category=key;confirmation=null;render();};filters.append(filter);
  }
  const passes=state.passes;
  if(!passes.length){const empty=el('div',undefined,'deal-empty');empty.append(el('h2',category==='available'?'Your next deal starts here':category==='shared'?'No shared deals yet':'No purchases yet'),el('p',category==='available'?'Add a deal link below.':category==='shared'?'Open an available deal to create a link.':'Your redeemed deals will appear here.'));list.append(empty);}
  for(const pass of passes){
    const card=el('details',undefined,'deal-card list-row'),body=el('div',undefined,'deal-card-body');card.dataset.id=pass.id;card.open=openCards.has(pass.id)||confirmation===pass.id;
    card.classList.toggle('deal-confirming',confirmation===pass.id);
    const product=el('summary',undefined,'deal-product'),image=el('img',undefined,'deal-thumbnail');image.src='mercatus-first-drop.png';image.alt='Mercatus marketplace';image.width=72;image.height=72;
    const info=el('div',undefined,'deal-info'),name=pass.product.replace(/^First wait · /,'');const titleRow=el('div',undefined,'deal-title-row');titleRow.append(el('h2',name.charAt(0).toUpperCase()+name.slice(1),'card-title'),el('strong',money(pass.priceCents),'deal-price'));info.append(titleRow);
    const badges=el('div',undefined,'deal-badges');
    const [label,tone]=({active:['Expires '+shortDate(pass.expiresAt),'neutral'],shared:['Shared','primary'],reserved:['Processing','warning'],redeemed:['Redeemed','neutral'],issuing:['Preparing','neutral']})[pass.status]||[pass.status,'neutral'];
    badges.append(pass.status==='active'?el('span',label,'deal-expiry'):badge(label,tone));
    if(pass.checkout?.capture?.status==='PENDING')badges.append(badge('Visa pending','warning'));

    info.prepend(badges);product.append(image,info);card.append(product);
    if(pass.status==='active'){
      const actions=el('div',undefined,'deal-actions'),share=button('Create link'),use=button('Buy for '+money(pass.priceCents),'primary');share.title='Create a link to share this price';share.disabled=use.disabled=state.busy;
      if(pass.campaignCode){share.textContent='Copy campaign link';share.title='Share this campaign with another customer';share.onclick=async()=>{try{await navigator.clipboard.writeText(API+'/extension/popup.html?claim='+encodeURIComponent(pass.campaignCode));share.textContent='Copied';}catch{message('Could not copy the campaign link.');}};}else share.onclick=()=>action('/share',{id:pass.id});use.onclick=()=>{confirmation=confirmation===pass.id?null:pass.id;render();};actions.append(use,share);body.append(actions);
    }
    if(confirmation===pass.id)body.append(checkout(pass));
    const shared=state.jobs.findLast(job=>job.passId===pass.id&&job.type==='share'&&job.status==='complete');
    if(pass.status==='shared'&&(pass.shareCode||shared?.claimCode)){
      const url=API+'/extension/popup.html?claim='+encodeURIComponent(pass.shareCode||shared.claimCode),link=el('div',undefined,'deal-share'),input=el('input',undefined,'input input-sm');input.value=url;input.readOnly=true;input.setAttribute('aria-label','Deal link');
      const copy=button('Copy link');copy.onclick=async()=>{try{await navigator.clipboard.writeText(url);copy.textContent='Copied';}catch{input.focus();input.select();message('Copy the selected link.');}};
      link.append(input,copy);body.append(link);
    }
    const details=receiptDetails(pass);details.open=expanded.has(pass.id);body.append(details);card.append(body);list.append(card);
  }
  const job=state.jobs.at(-1),jobVersion=job?job.id+':'+job.status+':'+job.message:'';
  if(job&&jobVersion!==seenJob){
    const progress={issue:'Creating passes…',issue_resume:'Finishing setup…',share:'Preparing your link…',claim:'Claiming your deal…',redeem:'Confirming purchase…'};
    message(job.status==='complete'?'':job.status==='needs_review'?'This action needs review. No payment will be retried automatically.':progress[job.type]||'Working…',job.status==='needs_review');seenJob=jobVersion;
  }
}
async function refresh(){
  if(polling||panel.hidden||historyMode)return;polling=true;
  try{const next=await request(''),changed=JSON.stringify(next)!==JSON.stringify(state);state=next;if(!confirmation&&changed)render();}catch(error){message(error.message,true);}finally{polling=false;}
}
function close(){historyVersion++;historyMode=false;$('productHistoryOpen').setAttribute('aria-pressed','false');$('collectiblesOpen').setAttribute('aria-pressed','false');panel.hidden=true;confirmation=null;$('app').inert=false;$('footer').inert=false;}
async function open(){setHistoryMode(false);$('collectiblesOpen').setAttribute('aria-pressed','true');panel.hidden=false;confirmation=null;if(state)render();$('app').inert=true;$('footer').inert=true;await refresh();}
$('collectiblesOpen').onclick=open;$('collectiblesClose').onclick=close;$('collectiblesMint').onclick=()=>action('/issue',{approved:true});
$('collectiblesClaim').onsubmit=async event=>{event.preventDefault();let code=$('collectiblesCode').value.trim();try{code=new URL(code).searchParams.get('claim')||code;}catch{}await action('/claim',{code});};
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.laterAuth){close();state=null;$('collectiblesList').replaceChildren();$('collectiblesCreator').replaceChildren();$('collectiblesCode').value='';message('');seenJob='';}});
const claim=new URL(location.href).searchParams.get('claim');if(claim)$('collectiblesCode').value=claim;
setInterval(async()=>{const {laterAuth}=await chrome.storage.local.get('laterAuth');if(claim&&laterAuth?.user?.id&&lastOwner!==laterAuth.user.id){lastOwner=laterAuth.user.id;$('collectiblesCode').value=claim;await open();}if(!document.hidden)refresh();},2000);

function setHistoryMode(value){
 historyMode=value;historyVersion++;$('dealPanelTitle').textContent=value?'Product history':'Your deals';
 $('productHistoryOpen').setAttribute('aria-pressed',String(value));$('collectiblesOpen').setAttribute('aria-pressed',String(!value));
 $('productHistoryList').hidden=!value;$('collectiblesList').hidden=value;$('collectiblesClaim').hidden=value;
 message('');
}
async function openProductHistory(){
 setHistoryMode(true);const version=historyVersion;panel.hidden=false;confirmation=null;$('app').inert=true;$('footer').inert=true;
 const list=$('productHistoryList');list.replaceChildren();
 const {laterAuth}=await chrome.storage.local.get('laterAuth'),owner=laterAuth?.user?.id;if(!owner){message('Sign in to see your product history.');return;}
 const key='mercatusProductHistory:'+owner,stored=await chrome.storage.local.get(key),session=await chrome.storage.session.get(['laterUI:'+owner,'laterHistory:'+owner]);
 const rows=[...(Array.isArray(stored[key])?stored[key]:[])];
 const seen=new Set(rows.map(row=>row.url||row.name+'|'+(row.variant||'')));
 for(const item of session['laterUI:'+owner]?.draft?.items||[]){const id=item.url||item.name+'|'+(item.variant||'');if(!seen.has(id)){seen.add(id);rows.push({name:item.name,variant:item.variant||'',url:item.url,image:item.image,priceCents:Math.round(Number(item.price)*100),kind:'Viewed',seenAt:session['laterUI:'+owner]?.lastImport||Date.now()});}}
 const current=await chrome.storage.local.get('laterAuth');if(current.laterAuth?.user?.id!==owner||version!==historyVersion)return;
 await chrome.storage.local.set({[key]:rows.slice(0,100)});
 if(version!==historyVersion)return;
 const records=[...rows];
 let carts=session['laterHistory:'+owner]||[];
 try{const shopping=await request('',undefined,'/api/state');if(version!==historyVersion)return;carts=shopping.carts||carts;}catch{}
 for(const cart of carts)for(const item of cart.items||[])records.push({name:item.name,image:item.image,url:item.url,priceCents:item.cents??Math.round(Number(item.price)*100),seenAt:Date.parse(cart.createdAt)||0,kind:cart.selectedOfferId?'Offer selected':'Wait started'});
 if(version!==historyVersion)return;
 const storedHistory=new Map();for(const row of records){const id=row.url||row.name+'|'+(row.variant||'');const old=storedHistory.get(id);if(!old||row.seenAt>=old.seenAt)storedHistory.set(id,row);}
 await chrome.storage.local.set({[key]:[...storedHistory.values()].sort((a,b)=>b.seenAt-a.seenAt).slice(0,100)});
 try{const data=await request('');if(version!==historyVersion)return;for(const pass of data.passes||[])records.push({name:pass.product.replace(/^First wait · /,''),image:'mercatus-first-drop.png',priceCents:pass.priceCents,kind:pass.status==='redeemed'?'Purchased':pass.status==='shared'?'Shared deal':'Deal saved',seenAt:0});}catch{}
 if(version!==historyVersion)return;
 records.sort((a,b)=>b.seenAt-a.seenAt);
 if(!records.length){const empty=el('div',undefined,'deal-empty');empty.append(el('h2','No products yet'),el('p','Products you bring into Mercatus will be saved here.'));list.append(empty);return;}
 for(const record of records.slice(0,100)){
  const row=el('article',undefined,'product-history-row'),content=el('div',undefined,'product-history-copy');
  if(record.image&&(/^(https:\/\/)/.test(record.image)||record.image==='mercatus-first-drop.png')){const img=el('img');img.src=record.image;img.alt='';img.onerror=()=>img.hidden=true;row.append(img);}
  content.append(el('strong',record.name),el('span',record.kind+(record.seenAt?' · '+shortDate(record.seenAt):'')));row.append(content);
  if(Number.isFinite(record.priceCents))row.append(el('strong',money(record.priceCents),'history-price'));
  list.append(row);
 }
}
$('productHistoryOpen').onclick=openProductHistory;
