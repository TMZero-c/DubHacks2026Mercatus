import {randomUUID} from 'node:crypto';
import {verify,validateOffer} from './engine.mjs';
const norm=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const cents=(value,label)=>{if(!/^\d{1,7}(\.\d{1,2})?$/.test(String(value)))throw new Error(`${label} must be a USD amount with at most two decimals.`);const n=Math.round(Number(value)*100);if(n<1||n>100000000)throw new Error(`${label} is out of range.`);return n;};
const text=(value,label,max=180)=>{const s=String(value||'').trim();if(!s||s.length>max)throw new Error(`Enter ${label} (up to ${max} characters).`);return s;};
const integer=(value,label,min,max)=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${label} must be ${min}–${max}.`);return n;};
export const newMerchantState=()=>({version:1,campaigns:[],decisions:[]});
export function validateCampaign(body,now=Date.now()){
 const executionMode=body.executionMode||'server';if(!['server','solana'].includes(executionMode))throw new Error('Choose a supported execution engine.');if(executionMode==='solana'&&body.publicPolicyAccepted!==true)throw new Error('Confirm publishing test price floors and stock on public Solana devnet.');
 const products=body.products;if(!Array.isArray(products)||!products.length||products.length>200)throw new Error('Add 1–200 catalog products.');
 const catalog=products.map(p=>{const name=text(p.name,'product name'),variant=text(p.variant,'exact variant');let url='';if(p.url){const u=new URL(p.url);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Catalog URLs must use public HTTPS.');url=u.href;if(url.length>1000)throw new Error('Product URL is too long.');}const unitCents=cents(p.unitPrice,'All-in price'),costCents=cents(p.cost,'Unit cost');if(costCents>unitCents)throw new Error('Unit cost cannot exceed the all-in price.');return{id:randomUUID(),name,variant,url,unitCents,costCents,stock:integer(p.stock,'Stock',0,1000000)};});
 const keys=catalog.map(p=>norm(p.name)+'|'+norm(p.variant));if(new Set(keys).size!==keys.length)throw new Error('Catalog contains duplicate products/variants.');
 const sellerRules=body.sellerRules;if(!Array.isArray(sellerRules)||!sellerRules.length||sellerRules.length>10)throw new Error('Set the exact shopper seller requirements you can meet.');
 const strategy=body.strategy||'competitive';if(!['competitive','fixed_discount'].includes(strategy))throw new Error('Choose a pricing strategy.');
 const startAt=body.startAt?new Date(body.startAt).toISOString():new Date(now).toISOString();const endAt=body.endAt?new Date(body.endAt).toISOString():new Date(now+30*86400000).toISOString();if(Date.parse(endAt)<=Math.max(Date.parse(startAt),now))throw new Error('Campaign end must follow its start and the current time.');
 return{id:randomUUID(),executionMode,publicPolicyAccepted:body.publicPolicyAccepted===true,name:text(body.name,'campaign name',100),merchant:text(body.merchant,'merchant name',100),status:'paused',strategy,dailyBudgetCents:cents(body.dailyBudget,'Daily incentive budget'),maxIncentiveCents:cents(body.maxIncentive,'Maximum incentive per cart'),minMarginPct:integer(body.minMarginPct,'Minimum gross margin',0,90),discountPct:integer(body.discountPct,'Maximum discount',1,80),deliveryDays:integer(body.deliveryDays,'Delivery days',0,30),offerMinutes:integer(body.offerMinutes??60,'Offer duration in minutes',1,240),returns:text(body.returns,'return policy',500),sellerRules:[...new Set(sellerRules.map(s=>text(s,'seller requirement',300)))],inventoryAttested:body.inventoryAttested===true,startAt,endAt,products:catalog,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()};
}
export function createCampaign(state,body,now=Date.now()){
 if(state.campaigns.length>=100)throw new Error('Local campaign limit reached.');
 if(body.requestId){const existing=state.campaigns.find(c=>c.requestId===String(body.requestId));if(existing)return existing;}
 const c=validateCampaign(body,now);if(body.requestId)c.requestId=text(body.requestId,'idempotency key',100);state.campaigns.push(c);return c;
}
export function updateCampaign(state,id,patch,now=Date.now()){
 const original=state.campaigns.find(x=>x.id===id);if(!original)throw new Error('Unknown campaign.');const c=structuredClone(original);
 if(patch.status!==undefined){if(!['active','paused'].includes(patch.status))throw new Error('Status must be active or paused.');c.status=patch.status;}
 if(Object.keys(patch).some(k=>!['id','status'].includes(k))){if(original.solana)throw new Error('Published Solana policies are fixed. Create a new campaign to change pricing rules.');if(c.status!=='paused')throw new Error('Pause the campaign before editing its rules.');const rebuilt=validateCampaign({...campaignInput(c),...patch},now);Object.assign(c,rebuilt,{id:c.id,status:'paused',requestId:c.requestId,createdAt:c.createdAt});}
 if(c.status==='active'&&!c.inventoryAttested)throw new Error('Confirm inventory, all-in prices, and seller eligibility before activation.');
 if(c.status==='active'&&now>=Date.parse(c.endAt))throw new Error('Extend the campaign end date before activation.');
 c.updatedAt=new Date(now).toISOString();Object.assign(original,c);return original;
}
export function campaignInput(c){return{executionMode:c.executionMode||'server',publicPolicyAccepted:c.publicPolicyAccepted===true,name:c.name,merchant:c.merchant,strategy:c.strategy,dailyBudget:(c.dailyBudgetCents/100).toFixed(2),maxIncentive:(c.maxIncentiveCents/100).toFixed(2),minMarginPct:c.minMarginPct,discountPct:c.discountPct,deliveryDays:c.deliveryDays,offerMinutes:c.offerMinutes,returns:c.returns,sellerRules:c.sellerRules,inventoryAttested:c.inventoryAttested,startAt:c.startAt,endAt:c.endAt,products:c.products.map(p=>({name:p.name,variant:p.variant,url:p.url,unitPrice:(p.unitCents/100).toFixed(2),cost:(p.costCents/100).toFixed(2),stock:p.stock}))};}
export function reconcile(state,carts,now=Date.now()){
 let changed=false;for(const d of state.decisions){if(d.status!=='reserved'&&d.status!=='selected')continue;const cart=carts[d.intentId],offer=cart?.offers?.find(o=>o.id===d.offerId);const next=!cart||!verify(cart,now).active||!offer?'released':cart.selectedOfferId===d.offerId?'selected':cart.selectedOfferId||Date.parse(offer.expiresAt)<=now?'released':'reserved';if(d.status!==next){d.status=next;changed=true;}}
 return changed;
}
function exposure(state,campaign,now){const day=new Date(now).toISOString().slice(0,10),merchantKey=norm(campaign.merchant);const live=state.decisions.filter(d=>['reserved','selected'].includes(d.status));return{budget:live.filter(d=>d.campaignId===campaign.id&&d.createdAt.slice(0,10)===day).reduce((s,d)=>s+d.incentiveCents,0),inventory:live.filter(d=>(d.merchantKey||norm(state.campaigns.find(c=>c.id===d.campaignId)?.merchant))===merchantKey).flatMap(d=>d.units)};}
function stockLimit(state,campaign,p){const key=norm(p.name)+'|'+norm(p.variant);const stocks=state.campaigns.filter(c=>norm(c.merchant)===norm(campaign.merchant)).flatMap(c=>c.products.filter(x=>norm(x.name)+'|'+norm(x.variant)===key).map(x=>x.stock));return Math.min(p.stock,...stocks);}
function match(p,item){return norm(p.name)===norm(item.name)&&norm(p.variant)===norm(item.variant);}
export function evaluate(state,campaign,cart,now=Date.now(),{preview=false}={}){
 const reject=reason=>({eligible:false,reason,intentId:cart.id,campaignId:campaign.id});
 if(!verify(cart,now).acceptingOffers)return reject('Intent is not accepting offers');
 if(!preview&&campaign.status!=='active')return reject('Campaign paused');
 if(now<Date.parse(campaign.startAt)||now>=Date.parse(campaign.endAt))return reject('Outside campaign schedule');
 if(!campaign.inventoryAttested)return reject('Inventory and eligibility not confirmed');
 if(!campaign.sellerRules.some(s=>norm(s)===norm(cart.sellers)))return reject('Seller requirements do not match');
 const prior=state.decisions.find(d=>d.campaignId===campaign.id&&d.intentId===cart.id&&d.snapshotHash===cart.digest);if(prior)return reject('Already offered on this intent');
 if((cart.offers||[]).length>=30)return reject('Intent offer limit reached');
 const usage=exposure(state,campaign,now),units=[];let list=0,cost=0,floor=0;
 for(const item of cart.items){const p=campaign.products.find(p=>match(p,item));if(!p)return reject('Exact product or variant missing');const reserved=usage.inventory.filter(u=>u.key===norm(p.name)+'|'+norm(p.variant)).reduce((s,u)=>s+u.quantity,0);const already=units.filter(u=>u.key===norm(p.name)+'|'+norm(p.variant)).reduce((s,u)=>s+u.quantity,0);if(stockLimit(state,campaign,p)-reserved-already<item.quantity)return reject('Insufficient available stock');units.push({productId:p.id,key:norm(p.name)+'|'+norm(p.variant),quantity:item.quantity});list+=p.unitCents*item.quantity;cost+=p.costCents*item.quantity;floor+=Math.max(Math.ceil(p.unitCents*(100-campaign.discountPct)/100),Math.ceil(p.costCents*100/(100-campaign.minMarginPct)))*item.quantity;}
 const deliveryDate=new Date(now+campaign.deliveryDays*86400000).toISOString().slice(0,10);if(deliveryDate>cart.deliveryDate)return reject('Cannot meet delivery deadline');
 const remaining=Math.max(0,campaign.dailyBudgetCents-usage.budget),incentiveLimit=Math.min(remaining,campaign.maxIncentiveCents);
 floor=Math.max(floor,list-incentiveLimit);
 // Compete only as far as necessary; never cross merchant margin, discount, inventory or budget bounds.
 const currentBest=Math.min(cart.amount,...(cart.offers||[]).filter(o=>Date.parse(o.expiresAt)>now&&o.snapshotHash===cart.digest).map(o=>o.amount));
 const shopperLimit=cart.shoppingTerms?Math.min(cart.shoppingTerms.maxTotalCents,cart.amount-cart.shoppingTerms.minimumSavingsCents):cart.amount;
 const amount=campaign.strategy==='fixed_discount'?floor:Math.max(floor,Math.min(list,currentBest-1,shopperLimit));
 if(amount<=0||amount>=currentBest)return reject(remaining===0?'Daily incentive budget reserved':'No profitable price beats the best offer');
 if(cart.shoppingTerms&&(amount>cart.shoppingTerms.maxTotalCents||cart.amount-amount<cart.shoppingTerms.minimumSavingsCents))return reject('Cannot meet shopper price and savings terms');
 const incentiveCents=Math.max(0,list-amount);return{eligible:true,intentId:cart.id,campaignId:campaign.id,merchantKey:norm(campaign.merchant),amount,incentiveCents,marginPct:Math.round((amount-cost)/amount*10000)/100,deliveryDate,units,reason:campaign.strategy==='competitive'?'Beat best offer within pricing limits':'Maximum discount within pricing limits'};
}
export function runAgent(state,carts,now=Date.now()){
 let changed=reconcile(state,carts,now),submitted=0;const decisions=[];
 // Index campaigns by exact catalog identity rather than comparing every cart to every merchant.
 const index=new Map();for(const campaign of state.campaigns.filter(c=>c.status==='active'&&c.executionMode!=='solana'))for(const p of campaign.products){const key=norm(p.name)+'|'+norm(p.variant);if(!index.has(key))index.set(key,new Set());index.get(key).add(campaign);}
 for(const cart of Object.values(carts)){
  if(!verify(cart,now).acceptingOffers||!cart.items?.length)continue;
  const first=cart.items[0],candidates=index.get(norm(first.name)+'|'+norm(first.variant))||[];
  for(const campaign of candidates){
  const d=evaluate(state,campaign,cart,now);if(!d.eligible)continue;
  // validateOffer is the same final server gate used for manual offers.
  const offer=validateOffer(cart,{merchant:campaign.merchant,price:(d.amount/100).toFixed(2),deliveryDate:d.deliveryDate,returns:campaign.returns,minutes:campaign.offerMinutes>=240?240:campaign.offerMinutes>=60?60:15,exactMatch:true,conditionsAccepted:true},now);
  offer.expiresAt=new Date(Math.min(now+campaign.offerMinutes*60000,Date.parse(cart.expiresAt))).toISOString();offer.source='merchant-agent';offer.campaignId=campaign.id;
  (cart.offers??=[]).push(offer);const record={...d,id:randomUUID(),offerId:offer.id,status:'reserved',snapshotHash:cart.digest,createdAt:new Date(now).toISOString()};state.decisions.push(record);decisions.push(record);submitted++;changed=true;
  }
 }
 return{changed,submitted,decisions};
}
export function merchantSnapshot(state,carts,now=Date.now()){
 const campaigns=state.campaigns.map(c=>{const ds=state.decisions.filter(d=>d.campaignId===c.id),usage=exposure(state,c,now);return{...c,metrics:{offers:ds.length,selections:ds.filter(d=>carts[d.intentId]?.selectedOfferId===d.offerId).length,reservedCents:usage.budget,remainingCents:Math.max(0,c.dailyBudgetCents-usage.budget),availableStock:c.products.reduce((s,p)=>s+Math.max(0,stockLimit(state,c,p)-usage.inventory.filter(u=>u.key===norm(p.name)+'|'+norm(p.variant)).reduce((s,u)=>s+u.quantity,0)),0)}};});
 return{campaigns,decisions:state.decisions.slice(-100).reverse(),summary:{activeCampaigns:campaigns.filter(c=>c.status==='active'&&now>=Date.parse(c.startAt)&&now<Date.parse(c.endAt)).length,offers:state.decisions.length,selections:state.decisions.filter(d=>carts[d.intentId]?.selectedOfferId===d.offerId).length,reservedCents:campaigns.reduce((s,c)=>s+c.metrics.reservedCents,0)},updatedAt:new Date(now).toISOString()};
}
export function previewCampaign(state,body,intents,now=Date.now()){
 const saved=body.campaignId?state.campaigns.find(c=>c.id===body.campaignId):null;if(body.campaignId&&!saved)throw new Error('Unknown campaign.');const c=saved?(body.products?{...validateCampaign({...campaignInput(saved),...body},now),id:saved.id}:saved):validateCampaign(body,now);
 const shadow=structuredClone(state);reconcile(shadow,intents,now);const results=[];for(const cart of Object.values(intents).filter(cart=>verify(cart,now).acceptingOffers)){const d=evaluate(shadow,c,cart,now,{preview:true});results.push(d);if(d.eligible){shadow.decisions.push({...d,status:'reserved',snapshotHash:cart.digest,createdAt:new Date(now).toISOString()});}}
 return{results,eligible:results.filter(r=>r.eligible).length,total:results.length};
}
