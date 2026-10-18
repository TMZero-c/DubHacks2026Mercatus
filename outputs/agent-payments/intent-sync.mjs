import {verify,validateOffer} from '../committed-cart/engine.mjs';
const ENDPOINT='https://later-merchant-mcp.vercel.app/api/agent/ingest';
const fields=['id','environment','status','authorizationId','authorizedAmount','visaStatus','amount','currency','condition','sellers','deliveryDate','expiresAt','digest','published','items','createdAt','authorizedAt','purchaseApproval','selectedOfferId','selectedAt'];
export function createIntentSync({carts,save,key=process.env.LATER_HOSTED_ACCESS_KEY,fetchImpl=fetch}){
 let running=false;const closed=new Map();
 return async()=>{if(!key||running)return;running=true;try{
  for(const cart of Object.values(carts)){
   if(!cart.published||(!verify(cart).active&&!cart.hostedIntentSyncedAt))continue;
   if(!verify(cart).active&&closed.get(cart.id)===cart.status)continue;
   const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({cart:Object.fromEntries(fields.filter(k=>cart[k]!==undefined).map(k=>[k,cart[k]]))}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Hosted intent sync unavailable');const result=await response.json();let changed=false;
   if(!cart.hostedIntentSyncedAt){cart.hostedIntentSyncedAt=new Date().toISOString();changed=true;}
   if(!verify(cart).active)closed.set(cart.id,cart.status);
   if(verify(cart).acceptingOffers)for(const remote of result.offers||[]){if(cart.offers?.some(o=>o.id===remote.id)||remote.snapshotHash!==cart.digest||Date.parse(remote.expiresAt)<=Date.now()||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(remote.id||'')||remote.source==='openrtb-demo')continue;try{const valid=validateOffer(cart,{merchant:remote.merchant,price:(remote.amount/100).toFixed(2),deliveryDate:remote.deliveryDate,returns:remote.returns,minutes:15,exactMatch:remote.exactMatch,conditionsAccepted:remote.conditionsAccepted});valid.id=remote.id;valid.createdAt=remote.createdAt;valid.expiresAt=new Date(Math.min(Date.parse(remote.expiresAt),Date.parse(cart.expiresAt))).toISOString();valid.source=remote.source==='x402-agent'?'x402-agent':'hosted-merchant';(cart.offers??=[]).push(valid);changed=true;}catch{}}
   if(changed)await save();
  }
 }finally{running=false;}};
}
