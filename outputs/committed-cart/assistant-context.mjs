import {validateCart,verify} from './engine.mjs';
import {normalizeShoppingTerms} from './shopping-assistant.mjs';
import {productQuery} from '../amazon-extension/product-search.js';

const fields=new Set(['message','history','items','terms','intentId']);
const itemSnapshot=items=>JSON.stringify(items.map(({name,variant,quantity,cents,url})=>({name,variant,quantity,cents,url:url||''})));
export const projectAssistantListings=listings=>listings.slice(0,8).map(({merchant,title,price,currency,checkedAt})=>({merchant,title,price,currency,checkedAt,verified:false,includesTaxAndShipping:false}));
export class AssistantContextError extends Error {
 constructor(message,status=400){super(message);this.status=status;this.code='assistant_context';}
}

// Only this projection crosses the model boundary. The caller cannot supply
// merchant offers, payment details, account identity, or a prompt instruction.
export function prepareAssistantContext({body,owner,carts={},listings=[],now=Date.now()}){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!fields.has(key)))throw new AssistantContextError('Send a shopping message and your cart terms.');
 if(typeof body.message!=='string'||!body.message.trim()||body.message.length>1200)throw new AssistantContextError('Keep your message under 1,200 characters.');
 let cart,locked=false;
 if(body.intentId!==undefined&&body.intentId!==null){
  if(typeof body.intentId!=='string'||body.intentId.length>100)throw new AssistantContextError('Choose a valid waiting cart.');
  cart=carts[body.intentId];
  if(!cart||cart.owner!==owner)throw new AssistantContextError('This waiting cart is unavailable.',404);
  locked=true;
 }
 const defaultDeadline=new Date(now+7*86400000).toISOString().slice(0,10);
 let normalized;
 if(!locked){
  const deliveryDate=body.terms?.deliveryBy||defaultDeadline;
  normalized=validateCart({items:body.items,hours:body.terms?.waitHours??1,sellers:'Authorized retailers',deliveryDate,consent:true},now);
  cart=normalized;
 }else if(body.items){
  normalized=validateCart({items:body.items,hours:1,sellers:cart.sellers||'Authorized retailers',deliveryDate:defaultDeadline,consent:true},now);
  if(itemSnapshot(normalized.items)!==itemSnapshot(cart.items))throw new AssistantContextError('Refresh this cart before continuing.',409);
 }
 const inherited=cart.shoppingTerms||{maxTotalCents:cart.amount,minimumSavingsCents:0,waitHours:(Date.parse(cart.expiresAt)-Date.parse(cart.createdAt))/3600000,deliveryBy:cart.deliveryDate,condition:'new'};
 // Existing/expired commitments retain their original terms for explanation;
 // only new drafts can accept proposed edits.
 const terms=locked?{...inherited}:normalizeShoppingTerms(body.terms||{maxTotalCents:cart.amount,minimumSavingsCents:0,waitHours:1,deliveryBy:defaultDeadline,condition:'new'},{cartTotalCents:cart.amount,now});
 const accepting=locked&&verify(cart,now).active&&!cart.selectedOfferId;
 const offers=locked?(cart.offers||[]).filter(offer=>offer.snapshotHash===cart.digest&&offer.source!=='openrtb-demo').slice(0,30).map(offer=>({id:offer.id,merchant:offer.merchant,amount:offer.amount,currency:offer.currency,deliveryDate:offer.deliveryDate,returns:offer.returns,expiresAt:offer.expiresAt,exactMatch:offer.exactMatch,conditionsAccepted:offer.conditionsAccepted,status:accepting?offer.status:'unavailable',condition:offer.condition})):[];
 return {message:body.message.trim(),history:body.history||[],context:{cart:{items:cart.items.map(({name,variant,quantity,cents})=>({name,variant,quantity,cents})),amount:cart.amount,currency:'USD'},terms,offers,listings:projectAssistantListings(listings),now:new Date(now).toISOString(),timeZone:'America/Los_Angeles',locked}};
}

export function createAssistantListingCache({now=()=>Date.now()}={}){
 const entries=new Map();
 const key=(owner,query)=>JSON.stringify([owner,String(query).trim().toLowerCase()]);
 return {
  remember(owner,query,result){
   if(!Array.isArray(result?.offers))return;
   for(const [id,value]of entries)if(now()-value.at>=3600000)entries.delete(id);
   if(entries.size>=200)entries.delete(entries.keys().next().value);
   entries.set(key(owner,query),{at:now(),offers:result.offers});
  },
  read(owner,items){return items.flatMap(item=>{const found=entries.get(key(owner,productQuery(item)));return found&&now()-found.at<3600000?found.offers:[];}).slice(0,8);}
 };
}
