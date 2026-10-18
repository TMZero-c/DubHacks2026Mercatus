import {productImages} from './product-images.mjs';
import {verify} from './engine.mjs';

// The merchant inbox is sourced from the same authorization gate as campaign bidding.
export function waitingIntents(carts,now=Date.now()){
 return Object.values(carts).filter(cart=>verify(cart,now).acceptingOffers).map(cart=>({
  id:cart.id,items:cart.items.map(({name,variant,quantity,cents,url},index)=>({name,variant,quantity,cents,url,image:productImages(cart.productImages,cart.items.length)[index]})),
  amount:cart.amount,currency:cart.currency,condition:cart.condition,
  ...(cart.shoppingTerms?{shoppingTerms:cart.shoppingTerms}:{}),
  sellers:cart.sellers,deliveryDate:cart.deliveryDate,createdAt:cart.createdAt,expiresAt:cart.expiresAt,
  waitHours:cart.shoppingTerms?.waitHours||(Date.parse(cart.expiresAt)-Date.parse(cart.createdAt))/3600000,
  offerCount:(cart.offers||[]).filter(offer=>offer.source!=='openrtb-demo'&&Date.parse(offer.expiresAt)>now&&offer.snapshotHash===cart.digest).length,
  digest:cart.digest,verification:verify(cart,now)
 })).sort((a,b)=>Date.parse(a.expiresAt)-Date.parse(b.expiresAt));
}
