import {productQuery} from './product-search.js';
import {estimateWait} from './economics.js';
import {cartBaseline,itemKey,lowerOffers} from './market-baseline.js';
import {ensureShopperOnboarding,replayShopperOnboarding} from './onboarding.js';
const API='http://localhost:4318', $=id=>document.getElementById(id),money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
const DEMO_CARD=Object.freeze({number:'4111111111111111',expirationMonth:'12',expirationYear:'2031',securityCode:'123'});
let draft=null,current=null,index=0,hours=1,confirming=false,online=false,reading=false,searching=false,operation=false,revision=0,lastImport=0,quotes={},searchCache={};
let pageMode='checking',historyOpen=false,viewingHistory=false,historyCart=null,historyPage=0,historyCarts=[],activeTabId=null;
let sessionToken='',authUser=null,authMode='login',authBusy=false,authEpoch=0,sandboxSignIn=false;
let shoppingTerms=null,editingHours=1;
const cacheKey=(name,owner=authUser?.id)=>name+':'+owner;
const accountCacheName=key=>key==='laterCart'||key==='laterCacheOwner'||['laterUI','laterState','laterHistory'].some(name=>key===name||key.startsWith(name+':'));
const active=c=>c&&['authorized','authorizing','reversing','needs_review'].includes(c.status);
const signature=items=>JSON.stringify(items.map(x=>[x.name,x.variant,x.url||'',Number(x.quantity),Number(x.price??x.cents/100)]));
const sameCommitment=()=>active(current)&&draft&&signature(current.items)===signature(draft.items);
const waitLabel=value=>value===.25?'15 minutes':value===12?'12 hours':value===24?'24 hours':'1 hour';
const duration=()=>waitLabel(hours);
const cartTotal=()=>draft?.items.reduce((sum,item)=>sum+Math.round(Number(item.price)*100)*item.quantity,0)||0;
const localDay=offset=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
function defaultTerms(){return{maxTotalCents:cartTotal(),minimumSavingsCents:0,waitHours:1,deliveryBy:localDay(7),condition:'new'};}
function validTerms(value){
 const total=cartTotal();if(!value||!Number.isSafeInteger(value.maxTotalCents)||value.maxTotalCents<1||value.maxTotalCents>total||!Number.isSafeInteger(value.minimumSavingsCents)||value.minimumSavingsCents<0||value.minimumSavingsCents>=total||![.25,1,12,24].includes(value.waitHours)||value.condition!=='new'||typeof value.deliveryBy!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.deliveryBy)||Number.isNaN(Date.parse(value.deliveryBy+'T12:00:00Z'))||new Date(value.deliveryBy+'T12:00:00Z').toISOString().slice(0,10)!==value.deliveryBy||value.deliveryBy<localDay(0)||value.deliveryBy>localDay(365))return null;
 return{maxTotalCents:value.maxTotalCents,minimumSavingsCents:value.minimumSavingsCents,waitHours:value.waitHours,deliveryBy:value.deliveryBy,condition:'new'};
}
const effectiveMaximum=terms=>Math.min(terms.maxTotalCents,cartTotal()-terms.minimumSavingsCents);
const dateLabel=value=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
function resetTermsUI({resetTerms=true}={}){if(resetTerms)shoppingTerms=draft?defaultTerms():null;$('termsEditor').hidden=true;}
function renderTermsSummary(){
 if(!shoppingTerms)shoppingTerms=defaultTerms();
 $('termBudget').textContent='Up to '+money(effectiveMaximum(shoppingTerms));$('termWait').textContent=waitLabel(shoppingTerms.waitHours);$('editTerms').disabled=operation;
}
function notify(text=''){ $('message').textContent=text;$('message').hidden=!text;document.body.classList.toggle('has-message',!!text); }
function normalize(payload){
 if(!payload||!Array.isArray(payload.items)||!payload.items.length||payload.items.length>8)throw new Error('Choose a cart with 1–8 items.');
 return{source:String(payload.source||'Shopping cart').slice(0,100),items:payload.items.map(x=>{
  const name=String(x.name||'').trim().slice(0,180),variant=String(x.variant||'Exact item').trim().slice(0,180),quantity=Number(x.quantity),price=Number(x.price??x.cents/100);
  if(!name||!Number.isInteger(quantity)||quantity<1||quantity>10||!Number.isFinite(price)||price<=0)throw new Error('This page is missing an item price. Try the full cart.');
  return{name,variant,quantity,price:price.toFixed(2),url:safeLink(x.url),image:safeImage(x.image)};
 })};
}
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return'';}}
function safeImage(value){return safeLink(value);}
function saveUI(){if(!authUser)return Promise.resolve();return chrome.storage.session.set({[cacheKey('laterUI')]:{draft,hours,quotes,searchCache,lastImport,shoppingTerms}}).catch(()=>{});}
let productHistoryWrite=Promise.resolve();
function rememberProducts(items){
 const owner=authUser?.id;if(!owner)return;
 const entries=items.map(item=>({name:item.name,variant:item.variant||'',url:safeLink(item.url),image:safeImage(item.image),priceCents:Math.round(Number(item.price)*100),seenAt:Date.now(),kind:'Viewed'}));
 productHistoryWrite=productHistoryWrite.catch(()=>{}).then(async()=>{
  const key='mercatusProductHistory:'+owner,stored=await chrome.storage.local.get(key),rows=Array.isArray(stored[key])?stored[key]:[];
  for(const entry of entries){const id=entry.url||entry.name+'|'+entry.variant;const at=rows.findIndex(row=>(row.url||row.name+'|'+row.variant)===id);if(at>=0)rows.splice(at,1);rows.unshift(entry);}
  await chrome.storage.local.set({[key]:rows.slice(0,100)});
 }).catch(()=>{});
}
const queryFor=productQuery;
async function request(path,body,{auth=true}={}){
 const epoch=authEpoch;
 const headers={};if(body)headers['Content-Type']='application/json';if(auth&&sessionToken)headers.Authorization='Bearer '+sessionToken;
 const response=await fetch(API+path,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(path==='/api/cards'&&body?65000:path==='/api/assistant/chat'?45000:['/api/compare','/api/commit-saved-card','/api/card-flow'].includes(path)?30000:7000),headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(epoch!==authEpoch){const error=new Error('Session changed.');error.code='session_changed';throw error;}
 if(response.status===401){const err=new Error(data.error||'Sign in to continue.');err.code='auth';if(auth&&path!=='/api/auth/me'){await clearSession();showAuth();}throw err;}
 if(!response.ok){const error=new Error(data.error||'Please try again.');error.code=data.code;throw error;}return data;
}
function resetAccountState(){
 draft=null;current=null;historyCarts=[];historyCart=null;index=0;hours=1;confirming=false;online=false;reading=false;searching=false;operation=false;lastImport=0;quotes={};searchCache={};revision++;activeTabId=null;historyOpen=false;viewingHistory=false;historyPage=0;pageMode='checking';
 resetTermsUI();closeCard();for(const id of ['primary','read','retry','useSavedCard','removeSavedCard','useAnotherCard','savedCardChoice','closeCard','addCard'])$(id).disabled=false;$('nativePayment').hidden=true;$('savedCardDetails').hidden=true;$('savedCardChoice').replaceChildren();$('savedCardNumber').textContent='';$('savedCardExpiry').textContent='';$('historyList').replaceChildren();
 for(const id of ['productName','storeName','variant','itemPrice','quantity','total','commitDetail','offerMerchant','offerTerms','estimate','saving','dealStore','dealPrice','confirmTotal','confirmDuration','itemCount','historyCount','offerCount'])$(id).textContent='';
 for(const id of ['productName','variant','offerTerms','logout'])$(id).removeAttribute('title');$('useSavedCard').textContent='Use this card →';$('productImage').removeAttribute('src');$('productImage').alt='';$('productImage').hidden=true;$('betterDeal').removeAttribute('href');$('betterDeal').hidden=true;$('consent').checked=false;$('authPassword').value='';document.body.classList.remove('has-deal','multiple','has-message');
}
async function clearAccountCache(epoch=authEpoch){
 resetAccountState();const cached=await chrome.storage.session.get(null).catch(()=>({}));if(epoch!==authEpoch)return;const keys=Object.keys(cached).filter(accountCacheName);if(keys.length)await chrome.storage.session.remove(keys).catch(()=>{});
}
async function saveSession(token,user){
 if(authUser?.id&&authUser.id!==user?.id){const epoch=++authEpoch;await clearAccountCache(epoch);if(epoch!==authEpoch)return;}
 authEpoch++;sessionToken=token||'';authUser=user||null;await chrome.storage.local.set({laterAuth:{token:sessionToken,user:authUser}}).catch(()=>{});
}
async function clearSession(){
 const oldToken=sessionToken,epoch=++authEpoch;sessionToken='';authUser=null;
 const removal=(async()=>{const stored=await chrome.storage.local.get('laterAuth').catch(()=>({}));if(epoch===authEpoch&&stored.laterAuth?.token===oldToken)await chrome.storage.local.remove('laterAuth').catch(()=>{});})();
 await clearAccountCache(epoch);await removal;if(epoch===authEpoch)$('authEmail').value='';
}
function showAuth(message=''){
 document.body.classList.add('auth-only');document.body.classList.remove('onboarding-only');authUser=null;$('cardEntry').hidden=true;
 if($('onboarding'))$('onboarding').hidden=true;
 $('auth').hidden=false;$('home').hidden=true;$('history').hidden=true;$('empty').hidden=true;$('cartView').hidden=true;$('footer').hidden=true;
 $('historyBack').hidden=true;$('read').hidden=true;$('logout').hidden=true;$('app').setAttribute('aria-busy','false');
 setAuthMode(authMode);notify(message);
}
function setAuthMode(mode){
 authMode=mode==='signup'?'signup':'login';
 $('authTitle').textContent=authMode==='signup'?'Join Mercatus.':'Welcome to Mercatus.';
 $('authHint').textContent='Name your price. Let the market come to you.';
 $('authSubmit').textContent=authMode==='signup'?'Sign up':'Log in';
 $('authToggle').textContent=authMode==='signup'?'Already have an account? Log in':'Need an account? Sign up';
 $('authPassword').autocomplete=authMode==='signup'?'new-password':'current-password';
}
function showAppShell(){
 document.body.classList.remove('auth-only');$('auth').hidden=true;$('logout').hidden=false;$('logout').title=authUser?.email||'Log out';

}
function baseline(){const fresh={};for(const item of draft.items){const cache=searchCache[queryFor(item).toLowerCase()];if(cache&&Date.now()-cache.at<3600000){const offers=lowerOffers(cache.offers,Math.round(Number(item.price)*100));if(offers.length)fresh[itemKey(item)]=Math.min(...offers.map(x=>x.price));}}return cartBaseline(draft.items,fresh);}
function renderHistory(){
 $('historyCount').textContent=historyCarts.length?String(historyCarts.length):'';$('historyList').replaceChildren();$('historyEmpty').hidden=historyCarts.length>0;
 historyPage=Math.max(0,Math.min(historyPage,Math.ceil(historyCarts.length/4)-1));
 for(const cart of historyCarts.slice(historyPage*4,historyPage*4+4)){const button=document.createElement('button');button.className='history-item';const title=document.createElement('strong');title.textContent=cart.items[0]?.name?.split('|')[0]||'Shopping cart';const detail=document.createElement('span');detail.textContent=historyStatus(cart)+' · '+money(cart.amount);button.append(title,detail);button.onclick=()=>{historyCart=cart;draft=normalize({items:cart.items.map(x=>({...x,image:draft?.items.find(i=>i.url===x.url)?.image||''}))});viewingHistory=true;confirming=false;resetTermsUI();notify();render();};$('historyList').append(button);}
 $('historyPagination').hidden=historyCarts.length<=4;$('historyPageCount').textContent=(historyPage+1)+' of '+Math.max(1,Math.ceil(historyCarts.length/4));$('historyPrevious').disabled=historyPage===0;$('historyNext').disabled=(historyPage+1)*4>=historyCarts.length;
}
function historyStatus(cart){return cart.selectedOfferId?'Offer selected':({authorized:'Waiting for offers',released:'Hold released',declined:'Hold declined',needs_review:'Hold needs review',authorizing:'Authorization pending',reversing:'Releasing hold'})[cart.status]||'Wait ended';}
function render(){
 if(!authUser){showAuth();return;}
 showAppShell();
 const neutral=pageMode!=='shopping'&&!viewingHistory;
 $('home').hidden=!neutral||historyOpen||pageMode==='checking';$('history').hidden=!neutral||!historyOpen;$('historyBack').hidden=!historyOpen&&!viewingHistory;$('read').hidden=neutral||viewingHistory;
 if(neutral){$('termsEditor').hidden=true;$('empty').hidden=pageMode!=='checking';$('retry').hidden=true;$('cartView').hidden=true;$('footer').hidden=true;$('app').setAttribute('aria-busy',String(pageMode==='checking'));document.body.classList.remove('has-deal','multiple');if(historyOpen)renderHistory();return;}
 $('retry').hidden=false;
 const hasCart=!!draft?.items.length;$('empty').hidden=hasCart;$('cartView').hidden=!hasCart;$('footer').hidden=!hasCart;$('app').setAttribute('aria-busy','false');
 if(!hasCart)return;
 const items=draft.items;document.body.classList.toggle('multiple',items.length>1);index=Math.min(index,items.length-1);const item=items[index],total=items.reduce((n,x)=>n+Math.round(Number(x.price)*100)*x.quantity,0);
 $('heading').textContent=viewingHistory?'Order details':sameCommitment()?'Your waiting cart':'Your cart';$('itemCount').textContent=items.length===1?'1 item':items.length+' items';
 $('storeName').textContent=(()=>{try{return new URL(item.url).hostname.replace(/^www\./,'');}catch{return draft.source;}})();
 $('productName').textContent=item.name.split('|')[0].trim();$('productName').title=item.name;$('variant').textContent=item.variant.replace(/ASIN\s+[A-Z0-9]{10}\s*[·-]?/,'').replace(/confirm (selected )?variant/gi,'');$('variant').title=item.variant;
 $('itemPrice').textContent=money(Math.round(Number(item.price)*100));$('quantity').textContent='Qty '+item.quantity;
 const image=$('productImage');image.alt=item.name.split('|')[0].trim();if(image.getAttribute('src')!==item.image){image.hidden=true;$('imageFallback').hidden=false;if(item.image)image.src=item.image;else image.removeAttribute('src');}else if(image.complete&&image.naturalWidth){image.hidden=false;$('imageFallback').hidden=true;}
 $('pagination').hidden=items.length===1;$('pageCount').textContent=(index+1)+' of '+items.length;$('previous').disabled=index===0;$('next').disabled=index===items.length-1;
 if(viewingHistory){$('statusBag').src='assets/bags/'+(historyCart.selectedOfferId?'purple-bow.svg':['released','declined','needs_review'].includes(historyCart.status)?'pink-sad.svg':'blue-sunglasses.svg');$('choices').hidden=true;$('confirmation').hidden=true;$('commitment').hidden=false;$('commitTitle').textContent=historyStatus(historyCart);$('commitDetail').textContent=money(historyCart.amount)+' · '+new Date(historyCart.createdAt||historyCart.expiresAt).toLocaleDateString();$('offerCount').textContent='';$('offer').hidden=true;$('release').hidden=true;$('footer').hidden=true;return;}
 const waiting=sameCommitment();document.body.classList.toggle('is-confirming',confirming);document.body.classList.toggle('is-waiting',waiting);$('choices').hidden=waiting||confirming;$('commitment').hidden=!waiting||confirming;$('confirmation').hidden=!confirming;
 $('total').textContent=money(total);const amount=baseline();const estimate=estimateWait({price:amount,margin:30,retainedMargin:8,cac:Math.min(20,amount/100*.15),offersPerHour:.5,hours,waitCostPerHour:0});
 $('estimate').textContent=money(estimate.expectedPrice);$('saving').textContent='Save ~'+money(total-estimate.expectedPrice);$('estimateLabel').textContent=amount<total?'Estimate from lower listing':'Estimated with a wait';
 document.querySelectorAll('[data-hours]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.hours)===($('termsEditor').hidden?hours:editingHours))));
 const cached=searchCache[queryFor(item).toLowerCase()],eligible=cached&&Date.now()-cached.at<3600000?lowerOffers(cached.offers,Math.round(Number(item.price)*100)):[],best=eligible[0];
 $('betterDeal').hidden=!best||waiting||confirming;document.body.classList.toggle('has-deal',!!best&&!waiting&&!confirming);
 if(best){$('dealStore').textContent=best.merchant;$('dealPrice').textContent=money(best.price)+(item.quantity>1?' each':'');$('betterDeal').href=best.url;}
 $('compare').disabled=searching;$('compare').textContent=searching?'Checking stores…':'Find a lower price ↗';
 if(!shoppingTerms)shoppingTerms=defaultTerms();hours=shoppingTerms.waitHours;
 $('confirmDuration').textContent=duration();$('confirmTotal').textContent=money(total);$('confirmBudget').textContent=money(effectiveMaximum(shoppingTerms));$('confirmSavings').textContent=money(shoppingTerms.minimumSavingsCents);$('confirmDelivery').textContent=dateLabel(shoppingTerms.deliveryBy);
 if(waiting){
  const offers=(current.offers||[]).filter(o=>Date.parse(o.expiresAt)>Date.now()).sort((a,b)=>a.amount-b.amount),bestOffer=offers[0],selected=!!current.selectedOfferId;
  $('commitTitle').textContent=selected?'Offer selected':current.status==='authorized'?'Waiting for offers':current.status==='needs_review'?'Check your hold':'Updating your hold';
  $('commitDetail').textContent=current.status==='authorized'?money(current.amount)+' held · until '+new Date(current.expiresAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Check the Visa sandbox portal.';
  $('statusBag').src='assets/bags/'+(selected?'purple-bow.svg':current.status==='needs_review'?'pink-sad.svg':'yellow-wink.svg');$('offerCount').textContent=offers.length?(offers.length===1?'1 offer':offers.length+' offers'):'';$('offer').hidden=!bestOffer||selected;
  if(bestOffer){$('offerMerchant').textContent=bestOffer.merchant;$('offerTerms').textContent='By '+bestOffer.deliveryDate+' · '+bestOffer.returns;$('offerTerms').title=bestOffer.returns;$('selectOffer').textContent='Choose '+money(bestOffer.amount);$('selectOffer').onclick=()=>chooseOffer(bestOffer.id);}
  $('release').hidden=current.status!=='authorized';$('release').disabled=operation;
 }
 $('primary').disabled=operation||!online||(confirming&&!$('consent').checked)||(waiting&&current.status!=='authorized');
 $('primary').textContent=operation?'Updating…':confirming?'Continue to card →':waiting?(current.selectedOfferId?'Offer selected':'Check offers'):active(current)?'View waiting cart →':'Review & wait →';
 if(waiting&&current.selectedOfferId)$('primary').disabled=true;
 $('paymentHint').textContent='Test mode';renderTermsSummary();
}
async function acceptImport(cart,{fromPage=false}={}){
 if(!cart||cart.at<=lastImport)return;
 try{
  const next=normalize(cart.payload);if(fromPage){pageMode='shopping';historyOpen=false;viewingHistory=false;}
  const changed=!draft||signature(next.items)!==signature(draft.items);draft=next;rememberProducts(next.items);lastImport=cart.at;index=0;confirming=false;$('consent').checked=false;if(changed){quotes={};revision++;resetTermsUI();}notify();render();await saveUI();
 }catch(e){if(fromPage){pageMode='home';render();}notify(e.message);}
}
async function readPage({refreshState=true}={}){
 if(!authUser||reading)return;const epoch=authEpoch;reading=true;$('read').disabled=true;$('retry').disabled=true;notify();
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(epoch!==authEpoch)return;const url=new URL(tab?.url||'');activeTabId=tab?.id;
  if(url.protocol!=='https:')throw new Error('Open a product or shopping cart, then try again.');
  if(url.hostname==='www.amazon.com'&&url.pathname.startsWith('/cart/smart-wagon')){await chrome.tabs.update(tab.id,{url:'https://www.amazon.com/gp/cart/view.html'});throw new Error('Open the full cart, then refresh here.');}
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js']});
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>collectShoppingPage()});const payload=result[0]?.result;if(epoch!==authEpoch)return;
  if(!payload||payload.error)throw new Error(payload?.error||'Could not read this page. Try its full cart.');
  const cart={payload,tabId:tab.id,at:Math.max(Date.now(),lastImport+1)};await acceptImport(cart,{fromPage:true});await chrome.storage.session.set({laterCart:cart});if(refreshState)await syncState();
 }catch(e){if(epoch!==authEpoch)return;pageMode='home';historyOpen=false;viewingHistory=false;resetTermsUI();await saveUI();notify();render();}
 finally{reading=false;$('read').disabled=false;$('retry').disabled=false;}
}
async function syncState(){
 if(!authUser)return false;
 try{const data=await request('/api/state');online=!!data.configured;if($('message').textContent.startsWith('Mercatus is offline.'))notify();if(!online)notify('Payments are not connected yet.');
  historyCarts=data.carts||[];const pending=historyCarts.find(active);current=pending||null;
  if(pending&&(!draft||sameCommitment())){const old=draft?.items||[];draft=normalize({source:'Shopping cart',items:pending.items.map(x=>({...x,image:old.find(o=>o.url===x.url)?.image||''}))});confirming=false;if(pending.shoppingTerms){const restored=validTerms(pending.shoppingTerms);if(restored){shoppingTerms=restored;hours=restored.waitHours;}}}
  await chrome.storage.session.set({[cacheKey('laterState')]:pending||null,[cacheKey('laterHistory')]:historyCarts});render();return true;
 }catch(e){if(e.code==='session_changed')return false;if(!authUser){notify(e.message||'Sign in to continue.');render();return false;}online=false;notify('Mercatus is offline. Start the local app, then retry.');render();return false;}
}
async function compare(){
 if(!authUser||searching||!draft)return;const epoch=authEpoch,item=draft.items[index],query=queryFor(item),key=query.toLowerCase(),requestRevision=revision;searching=true;notify();render();
 try{
  let cached=searchCache[key];if(!cached||Date.now()-cached.at>=3600000){const data=await request('/api/compare',{query});cached={at:Date.now(),offers:data.offers||[]};searchCache[key]=cached;}
  if(requestRevision!==revision)return;const eligible=lowerOffers(cached.offers,Math.round(Number(item.price)*100));if(eligible.length)quotes[itemKey(item)]=Math.min(...eligible.map(o=>o.price));else delete quotes[itemKey(item)];
  await saveUI();
 }catch(e){if(e.code==='session_changed')return;notify('Price search is unavailable. Try again shortly.');}finally{if(epoch!==authEpoch)return;searching=false;render();}
}
async function primary(){
 if(!authUser||!draft||operation)return;const epoch=authEpoch;
 if(active(current)&&!sameCommitment()){draft=normalize({source:'Shopping cart',items:current.items});index=0;confirming=false;revision++;resetTermsUI();shoppingTerms=validTerms(current.shoppingTerms)||defaultTerms();hours=shoppingTerms.waitHours;notify();render();saveUI();return;}
 if(active(current)){operation=true;notify();render();await syncState();operation=false;render();return;}
 if(!confirming){confirming=true;notify();render();return;}
 if(!$('consent').checked)return;
 const terms=validTerms(shoppingTerms);if(!terms){notify('Review your shopping terms before continuing.');return;}
 const body={items:draft.items.map(({image,...x})=>x),productImages:draft.items.map(item=>safeImage(item.image)),hours:terms.waitHours,sellers:'Authorized retailers only',deliveryDate:terms.deliveryBy,shoppingTerms:terms,consent:true,publish:true};
 operation=true;notify();render();try{await saveUI();if(epoch!==authEpoch)return;const result=await request('/api/card-flow',body);cardFlow=result.flow;savedCards=[];cardView='loading';$('nativePayment').hidden=true;$('savedCardView').hidden=false;$('savedCardDetails').hidden=true;$('cardsLoading').hidden=false;$('cardMessage').textContent='';const amount=money(draft.items.reduce((sum,x)=>sum+Math.round(Number(x.price)*100)*x.quantity,0));$('useSavedCard').textContent='Authorize '+amount+' hold →';$('cardEntry').hidden=false;loadSavedCards(cardFlow);}catch(e){if(e.code==='session_changed')return;notify(e.name==='TimeoutError'?'Hold status is pending. Refresh before trying again.':e.message);await syncState();}finally{if(epoch!==authEpoch)return;operation=false;render();}
}
async function releaseHold(){if(!authUser||!current||operation)return;const epoch=authEpoch;operation=true;notify();render();try{await request('/api/release',{id:current.id});current=null;await chrome.storage.session.set({[cacheKey('laterState')]:null});await syncState();}catch(e){if(e.code==='session_changed')return;notify('Could not confirm release. Refresh before retrying.');}finally{if(epoch!==authEpoch)return;operation=false;render();}}
async function chooseOffer(offerId){if(!authUser||!current||operation)return;const epoch=authEpoch;operation=true;render();try{const result=await request('/api/select',{intentId:current.id,offerId,approved:true});current=result.cart;await chrome.storage.session.set({[cacheKey('laterState')]:current});}catch(e){if(e.code==='session_changed')return;notify('This offer is unavailable. Refresh to check again.');}finally{if(epoch!==authEpoch)return;operation=false;render();}}
let cardFlow=null,savedCards=[],cardView='new';
function closeCard(){cardFlow=null;savedCards=[];cardView='new';$('cardEntry').hidden=true;$('nativePayment').reset();for(const id of ['enteredCardNumber','enteredCardMonth','enteredCardYear','enteredCardCvv'])$(id).value='';$('savedCardView').hidden=true;$('cardMessage').textContent='';}
function showNewCard(){cardView='new';$('savedCardView').hidden=true;$('nativePayment').hidden=false;$('enteredCardNumber').value='4111 1111 1111 1111';$('enteredCardMonth').value=DEMO_CARD.expirationMonth;$('enteredCardYear').value=DEMO_CARD.expirationYear;$('enteredCardCvv').value=DEMO_CARD.securityCode;$('cardMessage').textContent='';}
function renderSavedCards(preferredId){
 const selectedId=preferredId||$('savedCardChoice').value,choice=$('savedCardChoice');choice.replaceChildren();
 for(const card of savedCards){const option=document.createElement('option');option.value=card.id;option.textContent='Visa •••• '+card.last4+' · '+String(card.expirationMonth).padStart(2,'0')+'/'+String(card.expirationYear).slice(-2);choice.append(option);}
 const selected=savedCards.find(card=>card.id===selectedId)||savedCards[0];if(!selected){showNewCard();return;}choice.value=selected.id;choice.hidden=savedCards.length<2;
 $('savedCardNumber').textContent='•••• '+selected.last4;$('savedCardExpiry').textContent='Expires '+String(selected.expirationMonth).padStart(2,'0')+'/'+String(selected.expirationYear).slice(-2);$('savedCardDetails').hidden=false;$('cardsLoading').hidden=true;
}
async function loadSavedCards(flow){
 try{const data=await request('/api/cards');if(cardFlow!==flow||cardView!=='loading')return;savedCards=Array.isArray(data.cards)?data.cards.filter(card=>typeof card.id==='string'&&/^\d{4}$/.test(String(card.last4))):[];
  if(savedCards.length){cardView='saved';renderSavedCards();}else showNewCard();
 }catch{if(cardFlow===flow&&cardView==='loading')showNewCard();}
}
$('savedCardChoice').onchange=()=>renderSavedCards($('savedCardChoice').value);
$('useAnotherCard').onclick=()=>{if(!operation)showNewCard();};
$('removeSavedCard').onclick=async()=>{
 if(operation||!cardFlow)return;const epoch=authEpoch,id=$('savedCardChoice').value;operation=true;$('removeSavedCard').disabled=true;$('useSavedCard').disabled=true;$('useAnotherCard').disabled=true;$('closeCard').disabled=true;$('cardMessage').textContent='';
 try{const data=await request('/api/cards/delete',{id});savedCards=Array.isArray(data.cards)?data.cards:[];}
 catch(e){if(e.code==='session_changed')return;$('cardMessage').textContent=e.message;}
 finally{if(epoch!==authEpoch)return;operation=false;$('removeSavedCard').disabled=false;$('useSavedCard').disabled=false;$('useAnotherCard').disabled=false;$('closeCard').disabled=false;if(authUser&&cardFlow)renderSavedCards();}
};
$('useSavedCard').onclick=async()=>{
 if(operation||!cardFlow||!savedCards.some(card=>card.id===$('savedCardChoice').value))return;const epoch=authEpoch;
 operation=true;$('useSavedCard').disabled=true;$('removeSavedCard').disabled=true;$('useAnotherCard').disabled=true;$('savedCardChoice').disabled=true;$('closeCard').disabled=true;$('cardMessage').textContent='Authorizing…';
 try{const result=await request('/api/commit-saved-card',{flow:cardFlow,cardId:$('savedCardChoice').value});current=result.cart;confirming=false;closeCard();await syncState();if(!result.cart.verification?.active)notify('Check your hold before trying again.');}
 catch(e){if(e.code==='session_changed')return;$('cardMessage').textContent=e.name==='TimeoutError'?'Hold status is pending. Go back and refresh before trying again.':e.message;await syncState();}
 finally{if(epoch!==authEpoch)return;operation=false;$('useSavedCard').disabled=false;$('removeSavedCard').disabled=false;$('useAnotherCard').disabled=false;$('savedCardChoice').disabled=false;$('closeCard').disabled=false;render();}
};
$('closeCard').onclick=()=>{if(operation)return;closeCard();syncState();};
$('nativePayment').onsubmit=async event=>{
 event.preventDefault();if(operation||!cardFlow)return;const epoch=authEpoch;
 operation=true;$('addCard').disabled=true;$('closeCard').disabled=true;$('cardMessage').textContent='Adding card…';
 try{
  const card={number:$('enteredCardNumber').value.replace(/\s/g,''),expirationMonth:$('enteredCardMonth').value.padStart(2,'0'),expirationYear:$('enteredCardYear').value,securityCode:$('enteredCardCvv').value};
  if(Object.keys(DEMO_CARD).some(key=>card[key]!==DEMO_CARD[key]))throw new Error('Use the Visa test card shown here.');
  const result=await request('/api/cards',{testCard:'visa-1111',consent:true});
  savedCards=Array.isArray(result.cards)?result.cards:result.card?[result.card]:[];
  if(!savedCards.length)throw new Error('Could not load this card. Try again.');
  $('nativePayment').reset();for(const id of ['enteredCardNumber','enteredCardMonth','enteredCardYear','enteredCardCvv'])$(id).value='';
  cardView='saved';$('nativePayment').hidden=true;$('savedCardView').hidden=false;$('cardMessage').textContent='';renderSavedCards(result.card?.id);
 }catch(e){if(e.code==='session_changed')return;$('cardMessage').textContent=e.name==='TimeoutError'?'Could not confirm the card was added. Try again.':e.message;}
 finally{if(epoch!==authEpoch)return;operation=false;$('addCard').disabled=false;$('closeCard').disabled=false;render();}
};
$('productImage').onload=()=>{$('productImage').hidden=false;$('imageFallback').hidden=true;};$('productImage').onerror=()=>{$('productImage').hidden=true;$('imageFallback').hidden=false;};
$('reviewHistory').onclick=()=>{historyOpen=true;historyPage=0;notify();render();syncState();};$('historyBack').onclick=()=>{if(viewingHistory){viewingHistory=false;historyOpen=true;pageMode='home';}else historyOpen=false;notify();render();};$('historyPrevious').onclick=()=>{historyPage--;renderHistory();};$('historyNext').onclick=()=>{historyPage++;renderHistory();};
$('read').onclick=readPage;$('retry').onclick=readPage;$('compare').onclick=compare;$('primary').onclick=primary;$('release').onclick=releaseHold;$('back').onclick=()=>{confirming=false;render();};$('consent').onchange=render;
$('previous').onclick=()=>{index--;notify();render();};$('next').onclick=()=>{index++;notify();render();};
document.querySelectorAll('[data-hours]').forEach(button=>button.onclick=()=>{if(operation)return;const selected=Number(button.dataset.hours);if(button.closest('.cart-durations')){shoppingTerms={...(shoppingTerms||defaultTerms()),waitHours:selected};hours=selected;render();saveUI();return;}editingHours=selected;document.querySelectorAll('#durations [data-hours]').forEach(choice=>choice.setAttribute('aria-pressed',String(Number(choice.dataset.hours)===editingHours)));});
$('editTerms').onclick=()=>{if(!draft||operation)return;const terms=shoppingTerms||defaultTerms();editingHours=terms.waitHours;$('maximumPrice').value=(terms.maxTotalCents/100).toFixed(2);$('minimumSavings').value=(terms.minimumSavingsCents/100).toFixed(2);$('deliveryDeadline').value=terms.deliveryBy;$('deliveryDeadline').min=localDay(0);$('maximumPrice').max=(cartTotal()/100).toFixed(2);$('minimumSavings').max=((cartTotal()-1)/100).toFixed(2);$('termsError').hidden=true;document.querySelectorAll('[data-hours]').forEach(choice=>choice.setAttribute('aria-pressed',String(Number(choice.dataset.hours)===editingHours)));$('termsEditor').hidden=false;$('maximumPrice').focus();};
$('closeTerms').onclick=()=>{$('termsEditor').hidden=true;$('editTerms').focus();};
$('termsForm').onsubmit=event=>{event.preventDefault();const terms=validTerms({maxTotalCents:Math.round(Number($('maximumPrice').value)*100),minimumSavingsCents:Math.round(Number($('minimumSavings').value)*100),waitHours:editingHours,deliveryBy:$('deliveryDeadline').value,condition:'new'});if(!terms){$('termsError').textContent='Choose a valid budget, savings and delivery date.';$('termsError').hidden=false;return;}shoppingTerms=terms;hours=terms.waitHours;confirming=false;$('consent').checked=false;$('termsEditor').hidden=true;render();saveUI();};
$('authToggle').onclick=()=>{setAuthMode(authMode==='signup'?'login':'signup');notify();};
$('authForm').onsubmit=async event=>{
 event.preventDefault();if(authBusy)return;authBusy=true;$('authSubmit').disabled=true;notify();
 try{
  const body={email:$('authEmail').value,password:$('authPassword').value};
  const result=await request(authMode==='signup'?'/api/auth/signup':'/api/auth/login',body,{auth:false});
  await saveSession(result.token,result.user);$('authPassword').value='';await startApp();
 }catch(e){notify(e.message==='Failed to fetch'?'Mercatus is offline. Reconnect and try again.':(e.message||'Could not sign in.'));}finally{authBusy=false;$('authSubmit').disabled=false;}
};
$('logout').onclick=async()=>{
 const logout=sessionToken?request('/api/auth/logout',{}).catch(()=>{}):Promise.resolve();
 await clearSession();showAuth();notify('Signed out.');await logout;
};
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.laterAuth){if((changes.laterAuth.newValue?.token||'')!==sessionToken){authEpoch++;sessionToken='';authUser=null;resetAccountState();showAuth('Account changed. Reopen Mercatus.');}return;}if(authUser&&area==='session'&&changes.laterCart?.newValue?.tabId===activeTabId)acceptImport(changes.laterCart.newValue,{fromPage:true});});
async function startApp(){
 if(!authUser)return;const epoch=authEpoch,owner=authUser.id;
 try{
  const cached=await chrome.storage.session.get(null);if(epoch!==authEpoch)return;
  if(cached.laterCacheOwner!==owner){await clearAccountCache();if(epoch!==authEpoch)return;}
  else{const legacy=Object.keys(cached).filter(key=>['laterUI','laterState','laterHistory'].includes(key));if(legacy.length)await chrome.storage.session.remove(legacy);}
  await chrome.storage.session.set({laterCacheOwner:owner});if(epoch!==authEpoch)return;
  showAppShell();const saved=await chrome.storage.session.get([cacheKey('laterUI',owner),cacheKey('laterState',owner),cacheKey('laterHistory',owner)]);if(epoch!==authEpoch)return;
  const ui=saved[cacheKey('laterUI',owner)],state=saved[cacheKey('laterState',owner)];historyCarts=saved[cacheKey('laterHistory',owner)]||[];
  if(ui?.draft&&!draft){draft=normalize(ui.draft);hours=[.25,1,12,24].includes(ui.hours)?ui.hours:1;lastImport=ui.lastImport||0;searchCache=ui.searchCache||{};quotes={};for(const item of draft.items){const cache=searchCache[queryFor(item).toLowerCase()];if(cache&&Date.now()-cache.at<3600000){const lower=lowerOffers(cache.offers,Math.round(Number(item.price)*100));if(lower.length)quotes[itemKey(item)]=Math.min(...lower.map(x=>x.price));}}}
  if(draft){shoppingTerms=validTerms(ui?.shoppingTerms)||defaultTerms();hours=shoppingTerms.waitHours;}
  if(active(state)){current=state;if(!draft)draft=normalize({items:current.items});}
  render();const check=syncState();await readPage({refreshState:false});const connected=await check;if(epoch!==authEpoch)return;if(!connected)notify('Mercatus is offline. Start the local app, then retry.');else if(!online)notify('Payments are not connected yet.');
 }catch{if(epoch!==authEpoch)return;pageMode='home';render();notify('Could not load your activity. Try again.');$('app').setAttribute('aria-busy','false');$('emptyMessage').textContent='Open your shopping cart to get started.';}
}
$('authHowItWorks').onclick=()=>{
 replayShopperOnboarding({onDone:({signup})=>{showAuth();if(signup)setAuthMode('signup');}});
};

async function boot(){
 try{
  const stored=await chrome.storage.local.get('laterAuth');const savedAuth=stored.laterAuth;
  if(!savedAuth?.token){
   const shown=await ensureShopperOnboarding({onDone:({signup})=>{showAuth();if(signup)setAuthMode('signup');}});
   if(!shown)showAuth();
  }else showAuth();
  let status=null;try{status=await request('/api/auth/status',null,{auth:false});}catch{status=null;}
  sandboxSignIn=status?.mode==='local-sandbox';
  if(status&&!status.configured){showAuth('Sign-in is not connected yet.');return;}
  if(!status){showAuth('Mercatus is offline. Reconnect and try again.');return;}
  if(savedAuth?.token){sessionToken=savedAuth.token;
   try{const me=await request('/api/auth/me');authUser=me.user;await saveSession(sessionToken,authUser);await startApp();return;}
   catch(e){await clearSession();showAuth(e.code==='auth'?'Sign in to continue.':(e.message||'Could not verify your session. Sign in again.'));return;}}
  await clearSession();showAuth();
 }catch{showAuth('Could not load sign-in. Try again.');}
}
boot();setInterval(()=>{if(!document.hidden&&authUser&&!operation&&!confirming)syncState();},10000);
