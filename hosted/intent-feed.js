import {createHash} from 'node:crypto';
import {validateCart,verify} from '../outputs/committed-cart/engine.mjs';
import {runAgent} from '../outputs/committed-cart/merchant-engine.mjs';
// This endpoint is trusted server-to-server attestation, not a Visa-signed proof.
export function ingestIntent(state,input){
 const c=input.cart;if(!c||c.synthetic===true||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(c.id||'')||c.environment!=='visa-acceptance-sandbox'||!/^\d{1,60}$/.test(c.authorizationId||'')||!['authorized','released','needs_review','reversing'].includes(c.status)||!['AUTHORIZED','REVERSED','UNKNOWN'].includes(c.visaStatus))throw new Error('A payment-service authorization record is required.');
 const previous=state.carts[c.id];
 if(previous&&['released','needs_review','reversing'].includes(previous.status)&&c.status==='authorized')throw new Error('A closed intent cannot be reactivated.');
 if(previous&&(previous.digest!==c.digest||previous.authorizationId!==c.authorizationId))throw new Error('Intent identity changed.');
 if(!previous&&!verify(c).acceptingOffers)throw new Error('Only a current, published authorization can enter this feed.');
 if(!previous){const draft=validateCart({consent:true,publish:c.published,hours:.25,deliveryDate:c.deliveryDate,sellers:c.sellers,items:c.items.map(i=>({name:i.name,variant:i.variant,price:(i.cents/100).toFixed(2),quantity:i.quantity,url:i.url}))});if(draft.amount!==c.amount||c.authorizedAmount!==c.amount||!Number.isFinite(Date.parse(c.expiresAt))||Date.parse(c.expiresAt)>Date.now()+12*3600000+60000)throw new Error('Invalid authorization amount or deadline.');
 const snapshot={published:c.published,items:c.items,amount:c.amount,currency:c.currency,condition:c.condition,sellers:c.sellers,deliveryDate:c.deliveryDate,expiresAt:c.expiresAt,purchaseApproval:c.purchaseApproval,environment:c.environment};if(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')!==c.digest)throw new Error('Cart fingerprint mismatch.');
 if(Object.keys(state.carts).length>=1000)throw new Error('Hosted intent capacity reached.');
 }
 const allowed=['id','environment','status','authorizationId','authorizedAmount','visaStatus','amount','currency','condition','sellers','deliveryDate','expiresAt','digest','published','items','createdAt','authorizedAt','purchaseApproval','selectedOfferId','selectedAt'];const safe=Object.fromEntries(allowed.filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));safe.items=c.items.map(({name,variant,quantity,cents,url})=>({name,variant,quantity,cents,url}));
 state.carts[c.id]={...safe,offers:previous?.offers||[],intentSource:'later-payment-service'};
 runAgent(state.merchant,state.carts);
 return{accepted:true,id:c.id,offers:state.carts[c.id].offers.filter(o=>o.source!=='openrtb-demo')};
}
