import {productQuery} from './product-search.js';
import {estimateWait} from './economics.js';
import {cartBaseline,itemKey,lowerOffers} from './market-baseline.js';
const API='http://localhost:4318', $=id=>document.getElementById(id),money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
let draft=null,current=null,index=0,hours=1,confirming=false,online=false,reading=false,searching=false,operation=false,revision=0,lastImport=0,quotes={},searchCache={};
let pageMode='checking',historyOpen=false,viewingHistory=false,historyCart=null,historyPage=0,historyCarts=[],activeTabId=null;
let sessionToken='',authUser=null,authMode='login',authBusy=false;
const active=c=>c&&['authorized','authorizing','reversing','needs_review'].includes(c.status);
const signature=items=>JSON.stringify(items.map(x=>[x.name,x.variant,x.url||'',Number(x.quantity),Number(x.price??x.cents/100)]));
const sameCommitment=()=>active(current)&&draft&&signature(current.items)===signature(draft.items);
const duration=()=>hours===.25?'15 minutes':hours===12?'Overnight':'1 hour';
function notify(text=''){ $('message').textContent=text;$('message').hidden=!text;$('message').classList.toggle('is-error',!!text);document.body.classList.toggle('has-message',!!text); }
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
function saveUI(){return chrome.storage.session.set({laterUI:{draft,hours,quotes,searchCache,lastImport}}).catch(()=>{});}
const queryFor=productQuery;
async function request(path,body,{auth=true}={}){
 const headers={};if(body)headers['Content-Type']='application/json';if(auth&&sessionToken)headers.Authorization='Bearer '+sessionToken;
 const slow=path==='/api/compare'||path==='/api/commit-card'||path==='/api/card-flow'||path.startsWith('/api/auth/');
 const response=await fetch(API+path,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(slow?30000:7000),headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(response.status===401){const err=new Error(data.error||'Sign in to continue.');err.code='auth';if(auth&&path!=='/api/auth/me'){await clearSession();showAuth();}throw err;}
 if(!response.ok)throw new Error(data.error||'Please try again.');return data;
}
async function saveSession(token,user){sessionToken=token||'';authUser=user||null;await chrome.storage.local.set({laterAuth:{token:sessionToken,user:authUser}}).catch(()=>{});}
async function clearSession(){sessionToken='';authUser=null;await chrome.storage.local.remove('laterAuth').catch(()=>{});}
function showAuth(message=''){
 document.body.classList.add('auth-only');authUser=null;
 $('auth').hidden=false;$('home').hidden=true;$('history').hidden=true;$('empty').hidden=true;$('cartView').hidden=true;$('footer').hidden=true;
 $('historyBack').hidden=true;$('read').hidden=true;$('logout').hidden=true;$('app').setAttribute('aria-busy','false');
 setAuthMode(authMode);notify(message);
}
function setAuthMode(mode){
 authMode=mode==='signup'?'signup':'login';
 $('authTitle').textContent='Welcome to mercatus.';
 $('authHint').textContent='Name your price. Let the market come to you.';
 $('authSubmit').textContent=authMode==='signup'?'Sign up':'Log in';
 $('authToggle').textContent=authMode==='signup'?'Already have an account? Log in':'Need an account? Sign up';
 $('authPassword').autocomplete=authMode==='signup'?'new-password':'current-password';
}
function friendlyAuthError(message=''){
 const raw=String(message||'');
 if(!raw||raw==='Failed to fetch'||/timed out|AbortError|NetworkError/i.test(raw))return 'Cannot reach Mercatus. Keep npm start running, then try again.';
 if(/already exists/i.test(raw))return 'An account with that email already exists. Try logging in.';
 if(/Incorrect email or password/i.test(raw))return 'Wrong email or password. Try again.';
 if(/valid email/i.test(raw))return 'Enter a valid email address.';
 if(/Password must/i.test(raw))return 'Password must be at least 8 characters.';
 if(/MongoDB Atlas|Network Access|MONGODB_URI|Sign-in is unavailable/i.test(raw))return raw;
 return raw||'Could not sign in. Try again.';
}
function showAppShell(){
 document.body.classList.remove('auth-only');$('auth').hidden=true;$('logout').hidden=false;$('logout').title=authUser?.email||'Log out';
}
function baseline(){const fresh={};for(const item of draft.items){const cache=searchCache[queryFor(item).toLowerCase()];if(cache&&Date.now()-cache.at<3600000){const offers=lowerOffers(cache.offers,Math.round(Number(item.price)*100));if(offers.length)fresh[itemKey(item)]=Math.min(...offers.map(x=>x.price));}}return cartBaseline(draft.items,fresh);}
function renderHistory(){
 $('historyCount').textContent=historyCarts.length?String(historyCarts.length):'';$('historyList').replaceChildren();$('historyEmpty').hidden=historyCarts.length>0;
 historyPage=Math.max(0,Math.min(historyPage,Math.ceil(historyCarts.length/4)-1));
 for(const cart of historyCarts.slice(historyPage*4,historyPage*4+4)){const button=document.createElement('button');button.className='history-item';const title=document.createElement('strong');title.textContent=cart.items[0]?.name?.split('|')[0]||'Shopping cart';const detail=document.createElement('span');detail.textContent=historyStatus(cart)+' · '+money(cart.amount);button.append(title,detail);button.onclick=()=>{historyCart=cart;draft=normalize({items:cart.items.map(x=>({...x,image:draft?.items.find(i=>i.url===x.url)?.image||''}))});viewingHistory=true;confirming=false;notify();render();};$('historyList').append(button);}
 $('historyPagination').hidden=historyCarts.length<=4;$('historyPageCount').textContent=(historyPage+1)+' of '+Math.max(1,Math.ceil(historyCarts.length/4));$('historyPrevious').disabled=historyPage===0;$('historyNext').disabled=(historyPage+1)*4>=historyCarts.length;
}
function historyStatus(cart){return cart.selectedOfferId?'Offer selected':({authorized:'Waiting for offers',released:'Hold released',declined:'Hold declined',needs_review:'Hold needs review',authorizing:'Authorization pending',reversing:'Releasing hold'})[cart.status]||'Wait ended';}
function render(){
 if(!authUser){showAuth();return;}
 showAppShell();
 const neutral=pageMode!=='shopping'&&!viewingHistory;
 $('home').hidden=!neutral||historyOpen||pageMode==='checking';$('history').hidden=!neutral||!historyOpen;$('historyBack').hidden=!historyOpen&&!viewingHistory;$('read').hidden=neutral||viewingHistory;
 if(neutral){$('empty').hidden=pageMode!=='checking';$('retry').hidden=true;$('cartView').hidden=true;$('footer').hidden=true;$('app').setAttribute('aria-busy',String(pageMode==='checking'));document.body.classList.remove('has-deal','multiple');if(historyOpen)renderHistory();return;}
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
 if(viewingHistory){$('choices').hidden=true;$('confirmation').hidden=true;$('commitment').hidden=false;$('commitTitle').textContent=historyStatus(historyCart);$('commitDetail').textContent=money(historyCart.amount)+' · '+new Date(historyCart.createdAt||historyCart.expiresAt).toLocaleDateString();$('offerCount').textContent='';$('offer').hidden=true;$('release').hidden=true;$('footer').hidden=true;return;}
 const waiting=sameCommitment();$('choices').hidden=waiting||confirming;$('commitment').hidden=!waiting||confirming;$('confirmation').hidden=!confirming;
 $('total').textContent=money(total);const amount=baseline();const estimate=estimateWait({price:amount,margin:30,retainedMargin:8,cac:Math.min(20,amount/100*.15),offersPerHour:.5,hours,waitCostPerHour:0});
 $('estimate').textContent=money(estimate.expectedPrice);$('saving').textContent='Save ~'+money(total-estimate.expectedPrice);$('estimateLabel').textContent=amount<total?'Estimate from lower listing':'Estimated price';
 document.querySelectorAll('[data-hours]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.hours)===hours)));
 const cached=searchCache[queryFor(item).toLowerCase()],eligible=cached&&Date.now()-cached.at<3600000?lowerOffers(cached.offers,Math.round(Number(item.price)*100)):[],best=eligible[0];
 $('betterDeal').hidden=!best||waiting||confirming;document.body.classList.toggle('has-deal',!!best&&!waiting&&!confirming);
 if(best){$('dealStore').textContent=best.merchant;$('dealPrice').textContent=money(best.price)+(item.quantity>1?' each':'');$('betterDeal').href=best.url;}
 $('compare').disabled=searching;$('compare').textContent=searching?'Checking stores…':'Find a lower price ↗';
 $('confirmDuration').textContent=duration();$('confirmTotal').textContent=money(total);
 if(waiting){
  const offers=(current.offers||[]).filter(o=>Date.parse(o.expiresAt)>Date.now()).sort((a,b)=>a.amount-b.amount),bestOffer=offers[0],selected=!!current.selectedOfferId;
  $('commitTitle').textContent=selected?'Offer selected':current.status==='authorized'?'Waiting for offers':current.status==='needs_review'?'Check your hold':'Updating your hold';
  $('commitDetail').textContent=current.status==='authorized'?money(current.amount)+' held · until '+new Date(current.expiresAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Check the Visa sandbox portal.';
  $('offerCount').textContent=offers.length;$('offer').hidden=!bestOffer||selected;
  if(bestOffer){$('offerMerchant').textContent=bestOffer.merchant;$('offerTerms').textContent='By '+bestOffer.deliveryDate+' · '+bestOffer.returns;$('offerTerms').title=bestOffer.returns;$('selectOffer').textContent='Choose '+money(bestOffer.amount);$('selectOffer').onclick=()=>chooseOffer(bestOffer.id);}
  $('release').hidden=current.status!=='authorized';$('release').disabled=operation;
 }
 $('primary').disabled=operation||!online||(confirming&&!$('consent').checked)||(waiting&&current.status!=='authorized');
 $('primary').textContent=operation?'Updating…':confirming?'Continue to card →':waiting?(current.selectedOfferId?'Offer selected':'Check offers'):active(current)?'View waiting cart →':'Wait & save →';
 if(waiting&&current.selectedOfferId)$('primary').disabled=true;
 $('paymentHint').textContent=confirming?'Secure card entry':'Sandbox';
}
async function acceptImport(cart,{fromPage=false}={}){
 if(!cart||cart.at<=lastImport)return;
 try{
  const next=normalize(cart.payload);if(fromPage){pageMode='shopping';historyOpen=false;viewingHistory=false;}
  const changed=!draft||signature(next.items)!==signature(draft.items);draft=next;lastImport=cart.at;index=0;confirming=false;$('consent').checked=false;if(changed){quotes={};revision++;}notify();render();await saveUI();
 }catch(e){if(fromPage){pageMode='home';render();}notify(e.message);}
}
async function readPage({refreshState=true}={}){
 if(reading)return;reading=true;$('read').disabled=true;$('retry').disabled=true;notify();
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const url=new URL(tab?.url||'');activeTabId=tab?.id;
  if(url.protocol!=='https:')throw new Error('Open a product or shopping cart, then try again.');
  if(url.hostname==='www.amazon.com'&&url.pathname.startsWith('/cart/smart-wagon')){await chrome.tabs.update(tab.id,{url:'https://www.amazon.com/gp/cart/view.html'});throw new Error('Open the full cart, then refresh here.');}
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js']});
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>collectShoppingPage()});const payload=result[0]?.result;
  if(!payload||payload.error)throw new Error(payload?.error||'Could not read this page. Try its full cart.');
  const cart={payload,tabId:tab.id,at:Math.max(Date.now(),lastImport+1)};await acceptImport(cart,{fromPage:true});await chrome.storage.session.set({laterCart:cart});if(refreshState)await syncState();
 }catch(e){pageMode='home';historyOpen=false;viewingHistory=false;notify();render();}
 finally{reading=false;$('read').disabled=false;$('retry').disabled=false;}
}
async function syncState(){
 try{const data=await request('/api/state');online=!!data.configured;if($('message').textContent.startsWith('Mercatus is offline.'))notify();if(!online)notify('Connect Visa in the local app before starting a wait.');
  historyCarts=data.carts||[];const pending=historyCarts.find(active);current=pending||null;
  if(pending&&(!draft||sameCommitment())){const old=draft?.items||[];draft=normalize({source:'Shopping cart',items:pending.items.map(x=>({...x,image:old.find(o=>o.url===x.url)?.image||''}))});confirming=false;}
  await chrome.storage.session.set({laterState:pending||null,laterHistory:historyCarts});render();return true;
 }catch(e){if(!authUser){notify(e.message||'Sign in to continue.');render();return false;}online=false;notify('Mercatus is offline. Start the local app, then retry.');render();return false;}
}
async function compare(){
 if(searching||!draft)return;const item=draft.items[index],query=queryFor(item),key=query.toLowerCase(),requestRevision=revision;searching=true;notify();render();
 try{
  let cached=searchCache[key];if(!cached||Date.now()-cached.at>=3600000){const data=await request('/api/compare',{query});cached={at:Date.now(),offers:data.offers||[]};searchCache[key]=cached;}
  if(requestRevision!==revision)return;const eligible=lowerOffers(cached.offers,Math.round(Number(item.price)*100));if(eligible.length)quotes[itemKey(item)]=Math.min(...eligible.map(o=>o.price));else delete quotes[itemKey(item)];
  await saveUI();
 }catch{notify('Price search is unavailable. Try again shortly.');}finally{searching=false;render();}
}
async function primary(){
 if(!draft||operation)return;
 if(active(current)&&!sameCommitment()){draft=normalize({source:'Shopping cart',items:current.items});index=0;confirming=false;notify();render();saveUI();return;}
 if(active(current)){operation=true;notify();render();await syncState();operation=false;render();return;}
 if(!confirming){confirming=true;notify();render();return;}
 if(!$('consent').checked)return;
 const delivery=new Date();delivery.setDate(delivery.getDate()+7);
 const body={items:draft.items.map(({image,...x})=>x),hours,sellers:'Authorized retailers only',deliveryDate:delivery.toISOString().slice(0,10),consent:true,publish:true};
 operation=true;notify();render();try{await saveUI();const result=await request('/api/card-flow',body);cardFlow=result.flow;billingDetails=null;$('nativeBilling').hidden=false;$('nativePayment').hidden=true;$('cardMessage').textContent='';$('cardAmount').textContent=money(draft.items.reduce((sum,x)=>sum+Math.round(Number(x.price)*100)*x.quantity,0));$('cardEntry').hidden=false;}catch(e){notify(e.name==='TimeoutError'?'Hold status is pending. Refresh before trying again.':e.message);await syncState();}finally{operation=false;render();}
}
async function releaseHold(){if(!current||operation)return;operation=true;notify();render();try{await request('/api/release',{id:current.id});current=null;await chrome.storage.session.set({laterState:null});await syncState();}catch{notify('Could not confirm release. Refresh before retrying.');}finally{operation=false;render();}}
async function chooseOffer(offerId){if(!current||operation)return;operation=true;render();try{const result=await request('/api/select',{intentId:current.id,offerId,approved:true});current=result.cart;await chrome.storage.session.set({laterState:current});}catch{notify('This offer is unavailable. Refresh to check again.');}finally{operation=false;render();}}
let cardFlow=null,billingDetails=null;
function closeCard(){cardFlow=null;billingDetails=null;$('cardEntry').hidden=true;$('nativeBilling').reset();$('nativePayment').reset();$('cardMessage').textContent='';}
$('closeCard').onclick=()=>{if(operation)return;closeCard();syncState();};
$('nativeBilling').onsubmit=event=>{event.preventDefault();billingDetails=Object.fromEntries(new FormData(event.currentTarget));billingDetails.country=billingDetails.country.toUpperCase();$('nativeBilling').hidden=true;$('nativePayment').hidden=false;};
$('editNativeBilling').onclick=()=>{if(operation)return;$('nativeBilling').hidden=false;$('nativePayment').hidden=true;};
$('nativePayment').onsubmit=async event=>{
 event.preventDefault();if(operation||!cardFlow||!billingDetails)return;
 operation=true;$('authorizeCard').disabled=true;$('closeCard').disabled=true;$('cardMessage').textContent='Authorizing…';
 try{
  const card={number:$('enteredCardNumber').value.replace(/\s/g,''),expirationMonth:$('enteredCardMonth').value.padStart(2,'0'),expirationYear:$('enteredCardYear').value,securityCode:$('enteredCardCvv').value};
  const result=await request('/api/commit-card',{card,billTo:billingDetails,flow:cardFlow,tokenizeCard:$('tokenizeCard').checked===true});current=result.cart;confirming=false;closeCard();await syncState();
  if(!result.cart.verification?.active)notify('Check your hold before trying again.');
 }catch(e){$('cardMessage').textContent=e.name==='TimeoutError'?'Hold status is pending. Go back and refresh before trying again.':e.message;await syncState();}
 finally{operation=false;$('authorizeCard').disabled=false;$('closeCard').disabled=false;render();}
};
$('productImage').onload=()=>{$('productImage').hidden=false;$('imageFallback').hidden=true;};$('productImage').onerror=()=>{$('productImage').hidden=true;$('imageFallback').hidden=false;};
$('reviewHistory').onclick=()=>{historyOpen=true;historyPage=0;notify();render();syncState();};$('historyBack').onclick=()=>{if(viewingHistory){viewingHistory=false;historyOpen=true;pageMode='home';}else historyOpen=false;notify();render();};$('historyPrevious').onclick=()=>{historyPage--;renderHistory();};$('historyNext').onclick=()=>{historyPage++;renderHistory();};
$('read').onclick=readPage;$('retry').onclick=readPage;$('compare').onclick=compare;$('primary').onclick=primary;$('release').onclick=releaseHold;$('back').onclick=()=>{confirming=false;render();};$('consent').onchange=render;
$('previous').onclick=()=>{index--;notify();render();};$('next').onclick=()=>{index++;notify();render();};
document.querySelectorAll('[data-hours]').forEach(button=>button.onclick=()=>{hours=Number(button.dataset.hours);render();saveUI();});
$('authToggle').onclick=()=>{setAuthMode(authMode==='signup'?'login':'signup');notify();};
$('authForm').onsubmit=async event=>{
 event.preventDefault();if(authBusy)return;authBusy=true;document.body.classList.add('auth-busy');$('authSubmit').disabled=true;notify();
 try{
  const body={email:$('authEmail').value,password:$('authPassword').value};
  const result=await request(authMode==='signup'?'/api/auth/signup':'/api/auth/login',body,{auth:false});
  await saveSession(result.token,result.user);$('authPassword').value='';await startApp();
 }catch(e){notify(friendlyAuthError(e.message));}finally{authBusy=false;document.body.classList.remove('auth-busy');$('authSubmit').disabled=false;}
};
$('logout').onclick=async()=>{
 try{if(sessionToken)await request('/api/auth/logout',{});}catch{}
 await clearSession();draft=null;current=null;historyCarts=[];pageMode='checking';historyOpen=false;viewingHistory=false;confirming=false;showAuth();notify('Signed out.');
};
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.laterCart?.newValue?.tabId===activeTabId)acceptImport(changes.laterCart.newValue,{fromPage:true});});
async function startApp(){
 showAppShell();
 try{const saved=await chrome.storage.session.get(['laterUI','laterCart','laterState','laterHistory']);const ui=saved.laterUI;historyCarts=saved.laterHistory||[];
  if(ui?.draft&&!draft){draft=normalize(ui.draft);hours=[.25,1,12].includes(ui.hours)?ui.hours:1;lastImport=ui.lastImport||0;searchCache=ui.searchCache||{};quotes={};for(const item of draft.items){const cache=searchCache[queryFor(item).toLowerCase()];if(cache&&Date.now()-cache.at<3600000){const lower=lowerOffers(cache.offers,Math.round(Number(item.price)*100));if(lower.length)quotes[itemKey(item)]=Math.min(...lower.map(x=>x.price));}}}
  if(active(saved.laterState)){current=saved.laterState;if(!draft)draft=normalize({items:current.items});}
  render();const check=syncState();await readPage({refreshState:false});const connected=await check;if(!connected)notify('Mercatus is offline. Start the local app, then retry.');else if(!online)notify('Connect Visa in the local app before starting a wait.');
 }catch{pageMode='home';render();notify('Could not load your activity. Try again.');$('app').setAttribute('aria-busy','false');$('emptyMessage').textContent='Open your shopping cart to get started.';}
}
async function boot(){
 showAuth();
 try{
  const stored=await chrome.storage.local.get('laterAuth');const savedAuth=stored.laterAuth;
  let status=null;try{status=await request('/api/auth/status',null,{auth:false});}catch{status=null;}
  if(status&&!status.configured){showAuth('Add MONGODB_URI to outputs/committed-cart/.env, then restart npm start.');return;}
  if(!status){showAuth('Mercatus is offline. Start the local app (npm start), then reopen this popup.');return;}
  if(savedAuth?.token){sessionToken=savedAuth.token;
   try{const me=await request('/api/auth/me');authUser=me.user;await saveSession(sessionToken,authUser);await startApp();return;}
   catch(e){await clearSession();showAuth(e.code==='auth'?'Sign in to continue.':(e.message||'Could not verify your session. Sign in again.'));return;}}
  showAuth();
 }catch{showAuth('Could not load sign-in. Try again.');}
}
boot();setInterval(()=>{if(!document.hidden&&authUser&&!operation&&!confirming)syncState();},10000);
