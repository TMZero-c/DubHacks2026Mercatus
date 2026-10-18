import {merchantDealRequest} from '../deal-collectibles/merchant-api.mjs';
import {createIntentSync} from '../agent-payments/intent-sync.mjs';
import {createCardVault,CardVaultError} from './card-vault.mjs';
import {resolveDemoCard} from '../visa-sandbox/demo-card.mjs';
import {createAgentPayments} from '../agent-payments/x402.mjs';
import {openMarket} from '../solana-market/client.mjs';
import {runSolanaCampaigns} from '../solana-market/runner.mjs';
import {publicVisaReceipt} from './receipt-view.mjs';
import {identifySandboxCard,demandKey,duplicateDemand} from './card-identity.mjs';
import {reconcileVisaReceipt,receiptDue} from './visa-receipt.mjs';
import {newMerchantState,createCampaign,updateCampaign,previewCampaign,runAgent,merchantSnapshot,reconcile} from './merchant-engine.mjs';
import {createShoppingSearch} from './shopping.mjs';
import {createGeminiSearch} from './gemini-search.mjs';
import {createShoppingAssistant} from './shopping-assistant.mjs';
import {prepareAssistantContext,createAssistantListingCache,projectAssistantListings} from './assistant-context.mjs';
import {productQuery} from '../amazon-extension/product-search.js';
import {createMicroformSession,validateTransientToken} from './microform.mjs';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {buildRequest,validateBilling,validateSandboxCard} from '../visa-sandbox/visa.mjs';
import {validateCart,verify,authorize,release,validateOffer,selectOffer} from './engine.mjs';
import {createUserAuth} from './user-auth.mjs';
const root=new URL('./',import.meta.url),stateDir=process.env.LATER_STATE_DIR?new URL('file://'+process.env.LATER_STATE_DIR.replace(/\/$/,'')+'/'):new URL('.local/',root),stateFile=new URL('state.json',stateDir);
const env=new URL('../visa-sandbox/.env',root);if(existsSync(env))process.loadEnvFile(env);
const shoppingEnv=new URL('.env',root);if(existsSync(shoppingEnv))process.loadEnvFile(shoppingEnv);
const shoppingSearch=createShoppingSearch({apiKey:process.env.SERPAPI_API_KEY,cacheFile:new URL('.local/shopping-cache.json',root)});
const userAuth=process.env.MONGODB_URI?createUserAuth():process.env.LATER_SANDBOX_LOGIN==='1'?(await import('../deal-collectibles/sandbox-auth.mjs')).createSandboxAuth(fileURLToPath(new URL('sandbox-auth.sqlite',stateDir))):createUserAuth();
const geminiSearch=createGeminiSearch({apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL,cacheFile:new URL('.local/gemini-cache.json',root)});
const shoppingAssistant=createShoppingAssistant({apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_ASSISTANT_MODEL||process.env.GEMINI_MODEL});
const assistantListings=createAssistantListingCache();
const config={merchant:process.env.VISA_MERCHANT_ID,key:process.env.VISA_KEY_ID,secret:process.env.VISA_SHARED_SECRET};
const shopperAuthPaths=new Set(['/api/state','/api/assistant/chat','/api/compare','/api/gemini-compare','/api/commit','/api/commit-card','/api/card-flow','/api/card-session','/api/cards','/api/cards/delete','/api/commit-saved-card','/api/select','/api/release','/api/receipt']);
await mkdir(stateDir,{recursive:true,mode:0o700});let carts={},merchantState=newMerchantState(),agentPayments={};try{const stored=JSON.parse(await readFile(stateFile,'utf8'));if(stored.format===2){carts=stored.carts;merchantState=stored.merchant;agentPayments=stored.agentPayments||{};}else carts=stored;}catch(e){if(e.code!=='ENOENT')throw e;}
for(const cart of Object.values(carts))if(['authorizing','reversing'].includes(cart.status)){cart.status='needs_review';cart.message='Server restarted during a payment request. Check the sandbox portal.';}
let saveQueue=Promise.resolve();function save(){const data=JSON.stringify({format:2,carts,merchant:merchantState,agentPayments},null,2);saveQueue=saveQueue.then(async()=>{await writeFile(new URL('state.tmp',stateDir),data,{mode:0o600});await rename(new URL('state.tmp',stateDir),stateFile)});return saveQueue;}await save();
let cardVault;
function getCardVault(){return cardVault??=createCardVault({directory:fileURLToPath(new URL('card-vault/',stateDir)),config});}
let collectibleManager,CollectibleErrorType;
async function getCollectibles(){
 const {createCollectibles,CollectibleError}=await import('../deal-collectibles/manager.mjs');CollectibleErrorType=CollectibleError;
 return collectibleManager??=createCollectibles({
  directory:new URL('collectibles/',stateDir),keyFile:new URL('collectibles/protocol.json',stateDir),
  saveCard:async owner=>{const vault=getCardVault(),cards=await vault.list(owner);let card=cards[0];if(!card){const demo=resolveDemoCard({testCard:'visa-1111'});card=await vault.register(owner,demo.card,demo.billTo,{consent:true});}return vault.payment(owner,card.id);},
  pay:async(action,cents,id,reference,handle)=>{const result=await pay(action,(cents/100).toFixed(2),id,handle,null,reference),amounts=result.orderInformation?.amountDetails,raw=action==='authorize'?amounts?.authorizedAmount:amounts?.totalAmount;return{id:result.id,status:result.status,amountCents:typeof raw==='string'&&/^\d+(\.\d{1,2})?$/.test(raw)?Math.round(Number(raw)*100):null,source:'Visa Acceptance sandbox',at:new Date().toISOString()};}
 }).catch(e=>{collectibleManager=null;throw e;});
}
const syncIntents=createIntentSync({carts,save});const syncTimer=setInterval(()=>syncIntents().catch(()=>console.error('Hosted intent sync pending.')),5000);syncTimer.unref();
let mcpKey;const mcpKeyFile=new URL('mcp-key',stateDir);try{mcpKey=(await readFile(mcpKeyFile,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;mcpKey=randomBytes(32).toString('hex');await writeFile(mcpKeyFile,mcpKey,{mode:0o600,flag:'wx'});}
let marketClient=null;async function getMarket(){if(!marketClient){try{marketClient=await openMarket({directory:new URL('../../.local/solana-market/',root)});}catch{throw new Error('Solana devnet is unavailable. Deploy the program and check its connection before using this engine.');}}return marketClient;}
let agentRunning=false;async function processCampaigns(){if(agentRunning)return;agentRunning=true;try{const result=runAgent(merchantState,carts);if(merchantState.campaigns.some(c=>c.executionMode==='solana')||Object.values(carts).some(c=>c.offers?.some(o=>o.solana&&!o.solana.releasedAt)||c.pendingSolanaReleases?.length||(c.solanaIntentAttemptedAt&&!c.solanaIntentCancelledAt))){try{const chain=await runSolanaCampaigns(merchantState,carts,await getMarket());result.changed||=chain.changed;result.submitted+=chain.submitted;}catch{}}if(result.changed)await save();return result;}finally{agentRunning=false;}}const agentTimer=process.env.LATER_AGENT_AUTORUN==='0'?null:setInterval(()=>processCampaigns().catch(()=>console.error('Merchant offer processing failed.')),2000);agentTimer?.unref();
async function pay(action,amount,id,cardToken=null,billTo=null,reference=null){const {url,options}=buildRequest(action,amount,id,config,undefined,cardToken,billTo,reference);const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw new Error('Sandbox request rejected');return result;}
const cardSessions=new Map(),cardFlows=new Map();
let receiptRunning=false;
async function processReceipts(){if(receiptRunning||!Object.values(config).every(Boolean))return;receiptRunning=true;try{const cart=Object.values(carts).find(c=>receiptDue(c)&&!locks.has(c.owner));if(cart){locks.add(cart.owner);try{if(await reconcileVisaReceipt(cart,config))await save();}finally{locks.delete(cart.owner);}}}finally{receiptRunning=false;}}
const receiptTimer=setInterval(()=>processReceipts().catch(()=>console.error('Visa receipt reconciliation failed.')),15_000);receiptTimer.unref();

const demandLocks=new Set();
const locks=new Set();async function expire(){for(const cart of Object.values(carts)){if(cart.status==='authorized'&&Date.parse(cart.expiresAt)<=Date.now()&&!locks.has(cart.owner)){locks.add(cart.owner);try{cart.status='reversing';await save();cart.status='authorized';await release(cart,pay);await save();}finally{locks.delete(cart.owner);}}}}const timer=setInterval(()=>expire().catch(()=>console.error('Expiry processing failed. Inspect local state and sandbox portal.')),15000);timer.unref();
const extensionOrigin='chrome-extension://kahjaomahjnhcppboeagnjclfbnjgjje';
const isExtensionOrigin=origin=>origin===extensionOrigin;
const port=Number(process.env.LATER_PORT||4318);const agentPaymentAPI=createAgentPayments({origin:'http://localhost:'+port,db:{read:async()=>({data:{carts,agentPayments}}),transaction:async operation=>{const result=operation({carts,agentPayments});await save();return result;}}});http.createServer(async(req,res)=>{const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};const send=(code,data)=>{res.writeHead(code,headers);res.end(JSON.stringify(data))};try{if(!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host))return send(403,{error:'Localhost only'});const url=new URL(req.url,'http://'+req.headers.host);const requestOrigin=req.headers.origin||'';const isExtension=isExtensionOrigin(requestOrigin);if(isExtension&&url.pathname.startsWith('/api/')){headers['Access-Control-Allow-Origin']=requestOrigin;headers['Access-Control-Allow-Credentials']='true';headers['Vary']='Origin';if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Later-Card-Flow'});res.end();return;}}const agentAuthorized=req.headers.authorization==='Bearer '+mcpKey&&url.pathname.startsWith('/api/merchant/');if(req.method==='POST'&&!agentAuthorized&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(requestOrigin)&&!isExtension)return send(403,{error:'Same-origin browser request required'});
 if(req.method==='GET'&&url.pathname.startsWith('/extension/')){
  const name=url.pathname.slice('/extension/'.length),allowed=new Set(['popup.html','popup.css','popup.js','collector.js','economics.js','market-baseline.js','product-search.js','collectibles.js','collectibles.css','collectibles-bootstrap.css','extension-preview.js','mercatus-first-drop.png']);
  if(!allowed.has(name)&&name!=='styles/tokens.css'&&!/^assets\/(bags\/[a-z0-9-]+\.svg|fonts\/nunito-[a-z0-9-]+\.woff2)$/.test(name))return send(404,{error:'Not found'});
  const type=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.woff2')?'font/woff2':'text/javascript';
  res.writeHead(200,{...headers,'Content-Type':type+'; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self' http://localhost:4318; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(await readFile(new URL('../amazon-extension/'+name,root)));return;
 }
 if(url.pathname==='/api/collectibles'||url.pathname.startsWith('/api/collectibles/')){
  if(!userAuth.configured())return send(503,{error:'Sign in is unavailable.'});
  const user=await userAuth.userFromBearer(req.headers.authorization);if(!user)return send(401,{error:'Sign in to continue.'});
  try{const manager=await getCollectibles();
   if(req.method==='GET'&&url.pathname==='/api/collectibles')return send(200,await manager.snapshot(user.id));
   if(req.method!=='POST')return send(404,{error:'Not found'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4000)return send(413,{error:'Request too large'});}
   let body;try{body=JSON.parse(raw||'{}');}catch{return send(400,{error:'Invalid request'});}if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:'Invalid request'});
   const action=url.pathname.slice('/api/collectibles/'.length);
   if(action==='verify')return send(200,await manager.verifyPass(user.id,body.id));
   if(!['issue','resumeIssue','share','claim','redeem'].includes(action))return send(404,{error:'Not found'});
   return send(202,await manager[action](user.id,body));
  }catch(error){if(CollectibleErrorType&&error instanceof CollectibleErrorType)return send(error.status,{error:error.message});console.error('Collectible request failed:',error.message);return send(500,{error:'Collectible service could not complete this request.'});}
 }
 if(url.pathname.startsWith('/api/auth/')){
  if(url.pathname==='/api/auth/status'&&req.method==='GET')return send(200,{configured:userAuth.configured(),mode:userAuth.mode});
  if(!userAuth.configured())return send(503,{error:'Sign-in is unavailable. Add MONGODB_URI to outputs/committed-cart/.env, then restart npm start.'});
  if(url.pathname==='/api/auth/me'&&req.method==='GET'){const user=await userAuth.userFromBearer(req.headers.authorization);if(!user)return send(401,{error:'Sign in to continue.'});return send(200,{user,authConfigured:true});}
  if(req.method!=='POST')return send(404,{error:'Not found'});
  let authRaw='';for await(const chunk of req){authRaw+=chunk;if(authRaw.length>16000)return send(413,{error:'Request too large'});}const authBody=JSON.parse(authRaw||'{}');
  if(url.pathname==='/api/auth/signup')return send(201,await userAuth.signup(authBody));
  if(url.pathname==='/api/auth/login')return send(200,await userAuth.login(authBody));
  if(url.pathname==='/api/auth/logout'){await userAuth.logout(req.headers.authorization);return send(200,{ok:true});}
  return send(404,{error:'Not found'});
 }
 let token=(req.headers.cookie||'').match(/(?:^|; )cart_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token){token=randomBytes(32).toString('hex');headers['Set-Cookie']=`cart_session=${token}; HttpOnly; SameSite=Strict; Path=/`;}
 let owner=createHash('sha256').update(token).digest('hex');const flowId=req.headers['x-later-card-flow'];let flow=null;if(flowId){flow=cardFlows.get(flowId);if(req.headers.origin!=='http://localhost:'+port||!['/api/card-session','/api/card-flow-info','/api/commit','/api/commit-card'].includes(url.pathname)||!flow||flow.expiresAt<=Date.now())return send(403,{error:'Card session expired. Open card entry again.'});owner=flow.owner;}
 if(!flow&&shopperAuthPaths.has(url.pathname)){
  if(userAuth.configured()){
   const authUser=await userAuth.userFromBearer(req.headers.authorization);
   if(!authUser)return send(401,{error:'Sign in to continue.'});
   owner=authUser.id;
  }else if(isExtension){
   return send(503,{error:'Sign-in is unavailable. Add MONGODB_URI to outputs/committed-cart/.env, then restart npm start.'});
  }
 }
 const owned=()=>Object.values(carts).filter(c=>c.owner===owner).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const publicCart=c=>{const {owner,exchange,privateDemandKey,visaReceipt,pendingSolanaReleases,solanaIntentAttemptedAt,solanaIntentCancelledAt,solanaCancelRetryAt,hostedIntentSyncedAt,...rest}=c;return{...rest,offers:(c.offers||[]).filter(o=>o.source!=='openrtb-demo').map(({submittedBy,...o})=>o),verification:verify(c)}};

 if(url.pathname==='/api/assistant/chat'){
  if(req.method!=='POST')return send(405,{error:'Send a shopping message.'});
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>20000)return send(413,{error:'Shopping message is too long.'});}
  let body;try{body=JSON.parse(raw||'{}');}catch{return send(400,{error:'Send a valid shopping message.'});}
  try{
   const prepared=prepareAssistantContext({body,owner,carts});
   const remembered=assistantListings.read(owner,prepared.context.cart.items);
   const cached=prepared.context.cart.items.flatMap(item=>[shoppingSearch.peek({query:productQuery(item)}),geminiSearch.peek?.({query:productQuery(item)})].flatMap(result=>result?.offers||[]));
   const seen=new Set();
   prepared.context.listings=projectAssistantListings([...remembered,...cached].filter(listing=>{const key=JSON.stringify([listing.merchant,listing.title,listing.price]);if(seen.has(key))return false;seen.add(key);return true;}));
   const result=await shoppingAssistant.chat({owner,...prepared});
   if(body.intentId){
    const latest=prepareAssistantContext({body,owner,carts}).context;
    if(JSON.stringify([prepared.context.cart,prepared.context.terms,prepared.context.offers])!==JSON.stringify([latest.cart,latest.terms,latest.offers]))return send(409,{error:'Your offers changed. Check them again.',code:'assistant_context_changed'});
   }
   return send(200,result);
  }catch(error){
   const status=[400,404,409,413,429,502,503,504].includes(error.status)?error.status:400;
   const safe=error.code?.startsWith('assistant_');
   return send(status,{error:safe?error.message:'Could not analyze this cart. Check your shopping terms.',code:safe?error.code:'assistant_context'});
  }
 }

 if(req.method==='GET'&&(url.pathname==='/manifest.webmanifest'||url.pathname==='/robots.txt'||url.pathname==='/favicon.ico'||/^\/assets\/(favicon\.(svg|ico|png)|favicon-(32|512)\.png|icon-(32|180|192|512)\.png|social-preview\.png|bags\/[a-z0-9-]+\.svg|fonts\/nunito-[a-z0-9-]+\.woff2)$/.test(url.pathname))){if(url.pathname==='/robots.txt'){res.writeHead(200,{...headers,'Content-Type':'text/plain'});res.end('User-agent: *\nDisallow: /\n');return;}const path=url.pathname==='/favicon.ico'?'assets/favicon.ico':url.pathname.slice(1);const type=path.endsWith('.svg')?'image/svg+xml':path.endsWith('.webmanifest')?'application/manifest+json':path.endsWith('.ico')?'image/x-icon':path.endsWith('.woff2')?'font/woff2':'image/png';res.writeHead(200,{...headers,'Content-Type':type,...(path.endsWith('.woff2')?{'Access-Control-Allow-Origin':'http://localhost:'+port}:{})});res.end(await readFile(new URL(path,root)));return;}
 if(req.method==='GET'&&url.pathname==='/secure-card'){res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://testflex.cybersource.com; style-src 'self' 'unsafe-inline'; frame-src 'self' https://testflex.cybersource.com; connect-src 'self' https://testflex.cybersource.com; frame-ancestors 'self' chrome-extension://kahjaomahjnhcppboeagnjclfbnjgjje; base-uri 'none'; form-action 'self'"});res.end(await readFile(new URL('secure-card.html',root)));return;}
 if(req.method==='GET'&&['/','/merchant','/merchant/'].includes(url.pathname)){res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://testflex.cybersource.com; style-src 'self' 'unsafe-inline'; frame-src 'self' https://testflex.cybersource.com; connect-src 'self' https://testflex.cybersource.com; img-src 'self' data:; frame-ancestors 'self' chrome-extension://kahjaomahjnhcppboeagnjclfbnjgjje; base-uri 'none'; form-action 'self'"});res.end(await readFile(new URL(url.pathname==='/'?'index.html':'merchant.html',root)));return;}
 if(req.method==='GET'&&['/economics.js','/price-preview.js','/compare-prices.js','/market-baseline.js','/merchant-manager.js','/merchant-auth.js','/catalog-csv.js'].includes(url.pathname)){res.writeHead(200,{...headers,'Content-Type':'text/javascript'});res.end(await readFile(new URL(url.pathname.slice(1),root)));return;}
 if(req.method==='GET'&&['/brand.css','/bootstrap.min.css','/secure-card.css','/merchant-manager.css'].includes(url.pathname)){res.writeHead(200,{...headers,'Content-Type':'text/css'});res.end(await readFile(new URL(url.pathname.slice(1),root)));return;}
 if(req.method==='GET'&&url.pathname==='/card-entry.js'){res.writeHead(200,{...headers,'Content-Type':'text/javascript'});res.end(await readFile(new URL('card-entry.js',root)));return;}
 if(url.pathname==='/api/agent'||url.pathname.startsWith('/api/agent/')){if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000)return send(413,{error:'Request too large'});}req.body=JSON.parse(raw||'{}');}const result=await agentPaymentAPI.handle(req);res.writeHead(result.status,{...headers,...result.headers});res.end(JSON.stringify(result.body));return;}
 if(req.method==='GET'&&url.pathname==='/api/merchant/payments')return send(200,await agentPaymentAPI.metadata());
 if(url.pathname==='/api/merchant/deals'||url.pathname.startsWith('/api/merchant/deals/')){
  const merchantUser=!agentAuthorized&&userAuth.configured()?await userAuth.userFromBearer(req.headers.authorization):null;
  if(!agentAuthorized&&!merchantUser)return send(401,{error:'Merchant API credential or signed-in account required.'});
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4000)return send(413,{error:'Request too large'});}
  let body;try{body=JSON.parse(raw||'{}');}catch{return send(400,{error:'Invalid request'});}
  const result=await merchantDealRequest({authorized:agentAuthorized||!!merchantUser,...(merchantUser?{owner:merchantUser.id}:{}),method:req.method,action:url.pathname.slice('/api/merchant/deals'.length).replace(/^\//,''),body,getManager:getCollectibles,origin:'http://localhost:'+port});return send(result.status,result.data);
 }
 if(url.pathname.startsWith('/api/merchant/')){
 if(!agentAuthorized&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin||'')&&req.method!=='GET')return send(403,{error:'Merchant changes require the local manager or authenticated MCP bridge.'});
 if(req.headers.authorization&&!agentAuthorized)return send(401,{error:'Invalid merchant API credential.'});
 if(req.method==='GET'&&url.pathname==='/api/merchant/connection')return send(200,{config:{mcpServers:{'later-merchant':{command:process.execPath,args:[fileURLToPath(new URL('merchant-mcp.mjs',root))]}}}});
 if(req.method==='GET'&&url.pathname==='/api/merchant/execution'){try{const m=await getMarket();return send(200,{available:true,cluster:'devnet',programId:m.deployment.programId});}catch{return send(200,{available:false,cluster:'devnet'});}}
 if(req.method==='GET'&&url.pathname==='/api/merchant/state'){if(reconcile(merchantState,carts))await save();return send(200,merchantSnapshot(merchantState,carts));}
 if(req.method==='GET'&&url.pathname==='/api/merchant/intents')return send(200,{intents:Object.values(carts).filter(c=>verify(c).acceptingOffers).map(c=>({id:c.id,items:c.items,amount:c.amount,currency:c.currency,...(c.shoppingTerms?{shoppingTerms:c.shoppingTerms}:{}),sellers:c.sellers,deliveryDate:c.deliveryDate,expiresAt:c.expiresAt,digest:c.digest,verification:verify(c)}))});
 if(req.method!=='POST')return send(404,{error:'Unknown merchant endpoint'});
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>256000)return send(413,{error:'Catalog request too large'});}const body=JSON.parse(raw||'{}');
 if(url.pathname==='/api/merchant/preview')return send(200,previewCampaign(merchantState,body,carts));
 if(url.pathname==='/api/merchant/campaigns'){if(body.executionMode==='solana')await getMarket();const campaign=createCampaign(merchantState,body);await save();return send(201,{campaign});}
 if(url.pathname==='/api/merchant/update'){const previous=merchantState.campaigns.find(c=>c.id===body.id);updateCampaign(structuredClone(merchantState),body.id,body);if((body.executionMode||previous?.executionMode)==='solana'){const m=await getMarket();if(previous?.solana&&body.status)await m.setActive(previous,body.status==='active');}const campaign=updateCampaign(merchantState,body.id,body);await save();const run=await processCampaigns();return send(200,{campaign,submitted:run?.submitted||0});}
 if(url.pathname==='/api/merchant/run'){const run=await processCampaigns();return send(200,{submitted:run?.submitted||0});}
 return send(404,{error:'Unknown merchant endpoint'});
 }
 if(req.method==='GET'&&url.pathname==='/api/intents')return send(200,{intents:Object.values(carts).filter(c=>c.published&&verify(c).active&&!c.selectedOfferId).map(c=>({id:c.id,items:c.items,amount:c.amount,currency:c.currency,condition:c.condition,...(c.shoppingTerms?{shoppingTerms:c.shoppingTerms}:{}),sellers:c.sellers,deliveryDate:c.deliveryDate,expiresAt:c.expiresAt,digest:c.digest,offerCount:(c.offers||[]).length,verification:verify(c)}))});
 if(req.method==='GET'&&url.pathname==='/api/cards')return send(200,{cards:Object.values(config).every(Boolean)?await getCardVault().list(owner):[]});
 if(req.method==='GET'&&url.pathname==='/api/state')return send(200,{configured:Object.values(config).every(Boolean),assistantConfigured:shoppingAssistant.configured,carts:owned().map(publicCart)});
 if(req.method==='GET'&&url.pathname.startsWith('/api/verify/')){const c=carts[url.pathname.split('/').pop()];return c?send(200,verify(c)):send(404,{error:'Unknown commitment'});}
 if(req.method!=='POST')return send(404,{error:'Not found'});if(locks.has(owner))return send(409,{error:'A payment operation is already in progress.'});locks.add(owner);try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)return send(413,{error:'Request too large'})}let body=JSON.parse(raw||'{}');const originalPaymentInput=body;if(url.pathname==='/api/card-flow'){const draft=validateCart(body);body={items:draft.items.map(x=>({name:x.name,variant:x.variant,quantity:x.quantity,price:(x.cents/100).toFixed(2),url:x.url})),hours:body.hours,sellers:draft.sellers,deliveryDate:draft.deliveryDate,consent:true,publish:draft.published,...(draft.shoppingTerms?{shoppingTerms:draft.shoppingTerms}:{})};if(owned().some(c=>['authorizing','authorized','reversing','needs_review'].includes(c.status)))return send(409,{error:'Resolve your existing commitment first.'});for(const [key,value]of cardFlows)if(value.expiresAt<=Date.now())cardFlows.delete(key);const id=randomBytes(32).toString('hex');cardFlows.set(id,{owner,body,expiresAt:Date.now()+10*60000});return send(200,{flow:id});}if(url.pathname==='/api/card-flow-info'){if(!flow)return send(403,{error:'Open card entry from Mercatus.'});return send(200,{amount:validateCart(flow.body).amount});}if(['/api/commit','/api/commit-card'].includes(url.pathname)&&flow)body={...flow.body,cardToken:body.cardToken,card:body.card,billTo:body.billTo,tokenizeCard:body.tokenizeCard===true,saveCard:body.saveCard===true};if(url.pathname==='/api/commit-card'&&!flow&&req.headers.origin===extensionOrigin){const nativeFlow=cardFlows.get(body.flow);if(!nativeFlow||nativeFlow.owner!==owner||nativeFlow.expiresAt<=Date.now())return send(403,{error:'Card session expired. Open card entry again.'});flow=nativeFlow;body={...nativeFlow.body,card:body.card,billTo:body.billTo,flow:body.flow,tokenizeCard:body.tokenizeCard===true,saveCard:body.saveCard===true};}if(url.pathname==='/api/compare'){const result=await shoppingSearch(body);assistantListings.remember(owner,body.query,result);return send(200,result);}if(url.pathname==='/api/gemini-compare'){const result=await geminiSearch(body);assistantListings.remember(owner,body.query,result);return send(200,result);}if(url.pathname==='/api/card-session'){if(req.headers.origin!=='http://localhost:'+port)return send(400,{error:'Open http://localhost:4318 for hosted card entry.'});const previous=cardSessions.get(owner);if(previous&&Date.now()-previous.createdAt<5000)return send(429,{error:'Wait a few seconds before reloading fields.'});for(const [key,value] of cardSessions)if(value.expiresAt<Date.now())cardSessions.delete(key);const session=await createMicroformSession(config,'http://localhost:'+port);session.createdAt=Date.now();cardSessions.set(owner,session);const {jwk,createdAt,...client}=session;return send(200,client);}if(url.pathname==='/api/cards/delete'){
  if(typeof body.id!=='string')return send(400,{error:'Choose a saved card.'});
  await getCardVault().remove(owner,body.id);return send(200,{cards:await getCardVault().list(owner)});
 }
 if(url.pathname==='/api/cards'){
  if(body.consent!==true)return send(400,{error:'Confirm adding this card.'});
  if(!Object.values(config).every(Boolean))return send(503,{error:'Sandbox credentials are missing.'});
  const demo=resolveDemoCard(body);
  const card=await getCardVault().register(owner,demo.card,demo.billTo,{consent:true});
  return send(200,{card,cards:await getCardVault().list(owner)});
 }
 if(['/api/commit','/api/commit-card','/api/commit-saved-card'].includes(url.pathname)){
  const saved=url.pathname==='/api/commit-saved-card',direct=url.pathname==='/api/commit-card';
  if(saved){
   const bound=cardFlows.get(body.flow);
   if(!bound||bound.owner!==owner||bound.expiresAt<=Date.now())return send(403,{error:'Card session expired. Open card entry again.'});
   flow=bound;body={...bound.body,flow:body.flow,cardId:body.cardId};
  }
  if((direct||saved)&&!flow)return send(403,{error:'Open sandbox card entry from Mercatus.'});
  if(!Object.values(config).every(Boolean))return send(503,{error:'Sandbox credentials are missing.'});
  if(owned().some(c=>['authorizing','authorized','reversing','needs_review'].includes(c.status)))return send(409,{error:'Release or resolve your existing commitment before creating another.'});
  const cart=validateCart(body);
  let billTo=null,cardToken,identity=null;
  if(saved){
   cardToken=await getCardVault().payment(owner,body.cardId);identity=await getCardVault().identity(owner,body.cardId);
  }else{
   if(direct){const demo=resolveDemoCard(originalPaymentInput);billTo=validateBilling(demo.billTo);cardToken=validateSandboxCard(demo.card);}
   else{billTo=validateBilling(body.billTo);cardToken=validateTransientToken(body.cardToken,cardSessions.get(owner));}
   if(body.saveCard===true){
    if(!direct)return send(400,{error:'Saving requires explicitly entered sandbox card details.'});
    const card=await getCardVault().register(owner,cardToken,billTo,{consent:true});
    identity=await getCardVault().identity(owner,card.id);cardToken=await getCardVault().payment(owner,card.id);billTo=null;
   }else if(body.tokenizeCard===true){
    if(!direct)return send(400,{error:'Card verification requires explicitly entered sandbox card details.'});
    identity=await identifySandboxCard(cardToken,config);
   }
  }
  let privateKey=null;
  if(identity){
   privateKey=demandKey(identity,cart);
   if(demandLocks.has(privateKey)||duplicateDemand(carts,privateKey))return send(409,{error:'This card already backs the same basket. Resolve that commitment first.'});
   demandLocks.add(privateKey);cart.privateDemandKey=privateKey;
  }
  try{
   cardSessions.delete(owner);if(flowId||body.flow)cardFlows.delete(flowId||body.flow);
   cart.clientReference='later-'+cart.id;cart.cardEntry=saved||body.saveCard===true?'Visa TMS payment instrument · sandbox':direct?'Visa Acceptance Payments API · sandbox':'Visa Acceptance Microform · sandbox';
   cart.owner=owner;cart.offers=[];carts[cart.id]=cart;await save();
   await authorize(cart,(action,amount,id)=>pay(action,amount,id,cardToken,billTo,cart.clientReference));await save();
   return send(200,{cart:publicCart(cart)});
  }finally{if(privateKey)demandLocks.delete(privateKey);}
 }
 if(url.pathname==='/api/receipt'){const cart=carts[body.id];if(!cart||cart.owner!==owner)return send(404,{error:'Unknown commitment'});if(await reconcileVisaReceipt(cart,config))await save();return send(200,{receipt:publicVisaReceipt(cart)});}

 if(url.pathname==='/api/offers'){const cart=carts[body.intentId];if(!cart)return send(404,{error:'Unknown intent'});if((cart.offers||[]).length>=30)return send(409,{error:'Offer limit reached for this intent.'});const offer=validateOffer(cart,body);offer.submittedBy=owner;(cart.offers??=[]).push(offer);await save();const {submittedBy,...clean}=offer;return send(201,{offer:clean});}
 if(url.pathname==='/api/select'){const cart=carts[body.intentId];if(!cart||cart.owner!==owner)return send(404,{error:'Unknown intent'});if(body.approved!==true)return send(400,{error:'Confirm offer selection.'});const chosen=cart.offers?.find(o=>o.id===body.offerId);if(chosen?.solana){if(!verify(cart).active||Date.parse(chosen.expiresAt)<=Date.now())return send(409,{error:'Offer expired.'});const m=await getMarket();chosen.solana.selectionSignature=await m.select(chosen.solana);}selectOffer(cart,body.offerId);await save();return send(200,{cart:publicCart(cart)});}
 if(url.pathname==='/api/release'){const cart=carts[body.id];if(!cart||cart.owner!==owner)return send(404,{error:'Unknown commitment'});if(cart.status!=='authorized')return send(409,{error:'This commitment cannot be released automatically. Check its status.'});cart.status='reversing';await save();cart.status='authorized';await release(cart,pay);await save();return send(200,{cart:publicCart(cart)});}return send(404,{error:'Not found'});}finally{locks.delete(owner);}
 }catch(e){console.error('Local request failed:',e.diagnostics||e.name);send(e instanceof CardVaultError?(e.code==='CARD_NOT_FOUND'?404:e.code==='VAULT_CONFIGURATION'?503:400):400,{error:e instanceof CardVaultError?e.message:e instanceof SyntaxError?'Invalid request':e.message?.startsWith('Use a sandbox')?e.message:['TypeError','Error'].includes(e.name)&&!['fetch failed'].includes(e.message)?e.message:'Request failed. Check sandbox status before retrying.'});}}).listen(port,'127.0.0.1',()=>console.log('Committed Cart: http://localhost:'+port));
