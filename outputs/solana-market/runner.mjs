import {evaluate,reconcile} from '../committed-cart/merchant-engine.mjs';
import {verify,validateOffer} from '../committed-cart/engine.mjs';
// Chain results are authoritative for quote amounts and stock/budget reservations.
// Eligibility/search remain private API work; no local fallback advertises a chain quote.
export async function runSolanaCampaigns(state,carts,market,now=Date.now()){
 let changed=reconcile(state,carts,now),submitted=0;
 for(const cart of Object.values(carts)){
  if(cart.solanaIntentAttemptedAt&&!cart.solanaIntentCancelledAt&&(!verify(cart,now).active||(cart.selectedOfferId&&!cart.offers?.find(o=>o.id===cart.selectedOfferId)?.solana))&&!(Date.parse(cart.solanaCancelRetryAt||0)>now)){
   try{if(await market.cancelIntent(cart)||Date.parse(cart.expiresAt)<=now){cart.solanaIntentCancelledAt=new Date().toISOString();delete cart.solanaCancelRetryAt;}else cart.solanaCancelRetryAt=new Date(now+30_000).toISOString();changed=true;}catch{cart.solanaCancelRetryAt=new Date(now+30_000).toISOString();changed=true;}
  }
 }
 for(const cart of Object.values(carts)){for(const receipt of [...(cart.pendingSolanaReleases||[])]){try{await market.release(receipt);cart.pendingSolanaReleases=cart.pendingSolanaReleases.filter(r=>r!==receipt);changed=true;}catch{}}}
 for(const cart of Object.values(carts))for(const offer of cart.offers||[]){
  if(!offer.solana||offer.solana.releasedAt)continue;
  if(!verify(cart,now).active||Date.parse(offer.expiresAt)<=now||(cart.selectedOfferId&&cart.selectedOfferId!==offer.id)){
   try{const signature=await market.release(offer.solana);offer.solana.releasedAt=new Date().toISOString();if(signature)offer.solana.releaseSignature=signature;changed=true;}catch{if(!offer.solana.releasePending){offer.solana.releasePending=true;changed=true;}}
  }
 }
 for(const campaign of state.campaigns.filter(c=>c.executionMode==='solana'&&c.status==='active')){
  for(const cart of Object.values(carts)){
   const preflight=evaluate(state,campaign,cart,now);if(!preflight.eligible||Date.parse(campaign.chainRetryAt||0)>now)continue;
   let result;try{
    if(!campaign.solana){campaign.solana=await market.publishPolicy(campaign);changed=true;}
    cart.solanaIntentAttemptedAt??=new Date().toISOString();changed=true;
    result=await market.computeQuote(campaign,cart);
    if(!verify(cart).acceptingOffers){if(!verify(cart).active&&await market.cancelIntent(cart))cart.solanaIntentCancelledAt=new Date().toISOString();await market.release(result.receipt);continue;}
    const offer=validateOffer(cart,{merchant:campaign.merchant,price:(result.amount/100).toFixed(2),deliveryDate:preflight.deliveryDate,returns:campaign.returns,minutes:campaign.offerMinutes>=240?240:campaign.offerMinutes>=60?60:15,exactMatch:true,conditionsAccepted:true});
    offer.expiresAt=new Date(result.expires*1000).toISOString();offer.source='solana-compute';offer.campaignId=campaign.id;offer.solana=result.receipt;
    (cart.offers??=[]).push(offer);state.decisions.push({...preflight,id:offer.id,offerId:offer.id,amount:result.amount,incentiveCents:result.incentiveCents,status:'reserved',snapshotHash:cart.digest,createdAt:offer.createdAt,execution:'solana',solana:result.receipt});
    campaign.chainError=null;delete campaign.chainRetryAt;submitted++;changed=true;
   }catch{if(result?.receipt){try{await market.release(result.receipt);}catch{(cart.pendingSolanaReleases??=[]).push(result.receipt);}}campaign.chainError='Solana quote not confirmed. No offer was published.';campaign.chainRetryAt=new Date(now+30_000).toISOString();changed=true;break;}
  }
 }
 return{changed,submitted};
}
