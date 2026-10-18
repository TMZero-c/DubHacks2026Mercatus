import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {address,signature,createSolanaRpc} from '@solana/kit';
import {findAssociatedTokenPda,TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import {HTTPFacilitatorClient,x402ResourceServer} from '@x402/core/server';
import {ExactSvmScheme} from '@x402/svm/exact/server';
import {decodePaymentSignatureHeader,encodePaymentRequiredHeader,encodePaymentResponseHeader} from '@x402/core/http';
import {verify,validateOffer} from '../committed-cart/engine.mjs';
export const NETWORK='solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
export const USDC='4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const FACILITATOR='https://x402.org/facilitator';
export const PRICE='1000'; // 0.001 test USDC, six decimals. Never a mainnet asset.
const digest=x=>createHash('sha256').update(x).digest('hex');
const eligible=c=>c&&verify(c).acceptingOffers&&Date.parse(c.expiresAt)>Date.now()+90_000;
const response=(status,body,headers={})=>({status,body,headers:{'Cache-Control':'private, no-store','Content-Type':'application/json',...headers}});
function snapshot(cart){return{id:cart.id,items:cart.items.map(({name,variant,quantity})=>({name,variant,quantity})),amount:cart.amount,currency:cart.currency,condition:cart.condition,...(cart.shoppingTerms?{shoppingTerms:cart.shoppingTerms}:{}),sellers:cart.sellers,deliveryDate:cart.deliveryDate,expiresAt:cart.expiresAt,snapshotHash:cart.digest,verifiedAt:new Date().toISOString(),backing:'Visa Acceptance sandbox authorization',purchaseGuaranteed:false,offerEndpoint:'/api/agent/intents/'+cart.id+'/offers'};}
// Read-only token account validation. A fee-sponsoring facilitator does not create the recipient ATA.
export async function recipientReady(payTo){const rpc=createSolanaRpc('https://api.devnet.solana.com');const [ata]=await findAssociatedTokenPda({mint:address(USDC),owner:address(payTo),tokenProgram:TOKEN_PROGRAM_ADDRESS});const {value}=await rpc.getAccountInfo(ata,{encoding:'jsonParsed',commitment:'confirmed'}).send({abortSignal:AbortSignal.timeout(15000)});const info=value?.data?.parsed?.info;return !!(value?.owner===TOKEN_PROGRAM_ADDRESS&&info?.mint===USDC&&info?.owner===payTo&&info?.state==='initialized');}
export async function settlementConfirmed(transaction){try{const rpc=createSolanaRpc('https://api.devnet.solana.com');const {value}=await rpc.getSignatureStatuses([signature(transaction)],{searchTransactionHistory:true}).send({abortSignal:AbortSignal.timeout(15000)});return !!value[0]&&!value[0].err&&['confirmed','finalized'].includes(value[0].confirmationStatus);}catch{return false;}}
export function createAgentPayments({db,confirmSettlement=settlementConfirmed,payTo=process.env.LATER_X402_PAY_TO,origin,facilitator=new HTTPFacilitatorClient({url:FACILITATOR,timeoutMs:20_000}),checkRecipient=recipientReady}){
 const server=new x402ResourceServer(facilitator).register(NETWORK,new ExactSvmScheme());
 let readyUntil=0,initializing=null;const locks=new Set();
 async function ready(){if(!payTo)throw new Error('Set up the devnet USDC recipient first.');address(payTo);if(Date.now()<readyUntil)return;if(!initializing)initializing=(async()=>{await server.initialize();if(!server.getSupportedKind(2,NETWORK,'exact'))throw new Error('Facilitator does not support Solana devnet.');if(!await checkRecipient(payTo))throw new Error('The devnet USDC recipient account is not ready.');readyUntil=Date.now()+60_000;})().finally(()=>{initializing=null;});await initializing;}
 async function metadata(){try{await ready();return{available:true,protocol:'x402',x402Version:2,network:NETWORK,asset:USDC,amount:PRICE,payTo,facilitator:FACILITATOR,unit:'one verified cart snapshot',testnet:true};}catch{return{available:false,protocol:'x402',testnet:true,reason:'Devnet USDC setup or facilitator connection required.'};}}
 async function handle(req){
  const url=new URL(req.url,origin),path=url.pathname;
  const {data}=await db.read();
  const offerMatch=path.match(/^\/api\/agent\/intents\/([a-f0-9-]{36})\/offers$/i);
  if(req.method==='POST'&&offerMatch){const requestId=url.searchParams.get('requestId'),key=digest(offerMatch[1]+'\0'+requestId),entry=data.agentPayments?.[key];let payloadHash;try{const h=req.headers['payment-signature'];if(typeof h!=='string'||h.length>16000)throw new Error();payloadHash=digest(JSON.stringify(decodePaymentSignatureHeader(h)));}catch{return response(401,{error:'Use the original paid request signature.'});}if(!entry||entry.status!=='paid'||entry.payloadHash!==payloadHash)return response(402,{error:'Unlock this intent before submitting an offer.'});try{const bodyHash=digest(JSON.stringify(req.body));const offer=await db.transaction(state=>{const purchase=state.agentPayments[key],cart=state.carts[offerMatch[1]];if(purchase.offerId){if(purchase.offerBodyHash!==bodyHash)throw new Error('This purchase already submitted another offer.');return cart.offers.find(o=>o.id===purchase.offerId);}if((cart?.offers||[]).length>=30)throw new Error('Offer limit reached.');const offer=validateOffer(cart,req.body);offer.source='x402-agent';(cart.offers??=[]).push(offer);purchase.offerId=offer.id;purchase.offerBodyHash=bodyHash;return offer;});return response(201,{offer});}catch{return response(409,{error:'Offer unavailable, invalid, or already submitted with different terms.'});}}
  if(req.method!=='GET')return response(405,{error:'Use GET.'},{Allow:'GET'});
  if(path==='/api/agent')return response(200,{...await metadata(),intents:Object.values(data.carts).filter(eligible).map(c=>({id:c.id,products:c.items.map(i=>({name:i.name,variant:i.variant})),itemCount:c.items.reduce((s,i)=>s+i.quantity,0),expiresAt:c.expiresAt,resource:'/api/agent/intents/'+c.id})),requestId:'Supply a unique UUID as ?requestId= for each purchase. Retry with the same UUID and payment signature.'});
  const match=path.match(/^\/api\/agent\/intents\/([a-f0-9-]{36})$/i);if(!match)return response(404,{error:'Unknown agent resource.'});
  const requestId=url.searchParams.get('requestId');if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId||''))return response(400,{error:'Supply a UUID requestId for safe payment retries.'});
  const cart=data.carts[match[1]],key=digest(match[1]+'\0'+requestId),memo=Buffer.from(digest('later-x402-v1\0'+key+'\0'+(cart?.digest||'')),'hex').subarray(0,16).toString('base64url'),resource={url:origin+path+'?requestId='+requestId,description:'One Visa-backed shopping intent snapshot',mimeType:'application/json'};
  const paymentHeader=req.headers['payment-signature'];let payload,payloadHash;
  if(paymentHeader){if(typeof paymentHeader!=='string'||paymentHeader.length>16000)return response(400,{error:'Invalid payment payload.'});try{payload=decodePaymentSignatureHeader(paymentHeader);payloadHash=digest(JSON.stringify(payload));}catch{return response(400,{error:'Invalid payment payload.'});}}
  const previous=data.agentPayments?.[key];
  if(previous){if(!payloadHash||previous.payloadHash!==payloadHash)return response(409,{error:'Retry this requestId with the original payment signature.'});if(previous.status==='paid')return response(200,{intent:previous.snapshot,activeNow:!!cart&&verify(cart).acceptingOffers,payment:{network:NETWORK,amount:PRICE,asset:USDC,transaction:previous.settlement.transaction}},{'PAYMENT-RESPONSE':encodePaymentResponseHeader(previous.settlement)});}
  if(!previous?.settlementAttempted&&!eligible(cart))return response(410,{error:'This cart is not accepting paid intent requests. No new payment was submitted.'});
  try{await ready();}catch{return response(503,{error:'Devnet USDC payments are not ready. No payment submitted.'});}
  const requirements=previous?.requirements||(await server.buildPaymentRequirements({scheme:'exact',network:NETWORK,payTo,price:{amount:PRICE,asset:USDC},maxTimeoutSeconds:60,extra:{memo}}))[0];
  const required=await server.createPaymentRequiredResponse([requirements],resource);
  const challenge=()=>response(402,{error:'Pay 0.001 test USDC to unlock this cart.'},{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(required)});
  if(!payload)return challenge();
  if(payload.x402Version!==2||payload.resource?.url!==resource.url||!isDeepStrictEqual(payload.accepted,requirements)||!server.findMatchingRequirements([requirements],payload))return response(400,{error:'Payment does not match this resource, recipient, network, asset, amount or request.'});
  if(locks.has(key))return response(409,{error:'This payment is processing. Retry the identical request.'});locks.add(key);
  try{
   if(!previous?.settlementAttempted){
    const verified=await server.verifyPayment(payload,requirements);
    if(!verified.isValid)return response(402,{error:'Payment verification failed. No intent was delivered.'},{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(required)});
    const fresh=(await db.read()).data.carts[cart.id];
    if(!eligible(fresh))return response(410,{error:'Intent closed before settlement. No payment submitted.'});
   }
   // Claim a durable request slot before any settlement. A second worker cannot attach a different payment.
   const entry=await db.transaction(state=>{state.agentPayments??={};const existing=state.agentPayments[key];if(existing){if(existing.payloadHash!==payloadHash)throw new Error('Request already uses another payment.');return existing;}if(Object.keys(state.agentPayments).length>=10000)throw new Error('Payment ledger capacity reached.');return state.agentPayments[key]={status:'pending',payloadHash,requirements,snapshot:snapshot(cart),createdAt:new Date().toISOString()};});
   if(entry.status==='paid')return response(200,{intent:entry.snapshot,activeNow:verify(cart).acceptingOffers,payment:{network:NETWORK,amount:PRICE,asset:USDC,transaction:entry.settlement.transaction}},{'PAYMENT-RESPONSE':encodePaymentResponseHeader(entry.settlement)});
   if(!entry.settlementAttempted)await db.transaction(state=>{state.agentPayments[key].settlementAttempted=true;return null;});
   // A retry always reuses the identical signed transaction, including after uncertain settlement.
   const settlement=await server.settlePayment(payload,requirements);
   if(!settlement.success||settlement.network!==NETWORK||!settlement.transaction||!await confirmSettlement(settlement.transaction))return response(503,{error:'Settlement is unconfirmed. Retry only this requestId and original payment signature.',settlementPending:true});
   await db.transaction(state=>{Object.assign(state.agentPayments[key],{status:'paid',settlement,paidAt:new Date().toISOString()});return null;});
   const fresh=(await db.read()).data.carts[cart.id];return response(200,{intent:entry.snapshot,activeNow:!!fresh&&verify(fresh).acceptingOffers,payment:{network:NETWORK,amount:PRICE,asset:USDC,transaction:settlement.transaction}},{'PAYMENT-RESPONSE':encodePaymentResponseHeader(settlement)});
  }catch{return response(503,{error:'Payment outcome is unconfirmed. Retry the same requestId and original payment signature.',settlementPending:true});}finally{locks.delete(key);}
 }
 return{handle,metadata};
}
