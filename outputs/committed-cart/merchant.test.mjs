import assert from 'node:assert/strict';
import {newMerchantState,createCampaign,updateCampaign,previewCampaign,runAgent,merchantSnapshot,reconcile,evaluate} from './merchant-engine.mjs';
import {validateCart,selectOffer} from './engine.mjs';
import {parseCatalogCSV} from './catalog-csv.js';
const now=Date.now(),date=new Date(now+7*86400000).toISOString().slice(0,10);
const input=(patch={})=>({name:'Headphone offers',merchant:'Campus Electronics',dailyBudget:'20',maxIncentive:'10',minMarginPct:20,discountPct:20,strategy:'fixed_discount',deliveryDays:2,offerMinutes:60,returns:'30-day free returns',sellerRules:['Authorized retailers only'],inventoryAttested:true,products:[{name:'Sony WH-1000XM4',variant:'Black · New',unitPrice:'150',cost:'90',stock:5}],...patch});
function cart(patch={}){return{...validateCart({items:[{name:'Sony WH-1000XM4',variant:'Black · New',price:'150',quantity:1}],hours:12,sellers:'Authorized retailers only',deliveryDate:date,publish:true,consent:true},now),status:'authorized',visaStatus:'AUTHORIZED',authorizationId:'123',authorizedAmount:15000,offers:[],...patch};}
function setup(patch={}){const state=newMerchantState(),c=createCampaign(state,input(patch),now);return{state,c};}
{
 const {state,c}=setup();const a=cart(),carts={[a.id]:a};assert.equal(c.status,'paused');assert.equal(runAgent(state,carts,now).submitted,0);
 const preview=previewCampaign(state,{campaignId:c.id},carts,now);assert.equal(preview.eligible,1);assert.equal(preview.results[0].amount,14000);assert.equal(state.decisions.length,0);assert.equal(a.offers.length,0);
 updateCampaign(state,c.id,{status:'active'},now);assert.equal(runAgent(state,carts,now).submitted,1);assert.equal(a.offers[0].source,'merchant-agent');assert.equal(a.offers[0].amount,14000);assert.equal(state.decisions[0].incentiveCents,1000);assert.equal(runAgent(state,carts,now).submitted,0);
 assert.equal(merchantSnapshot(state,carts,now).summary.reservedCents,1000);assert.equal(previewCampaign(state,{...input(),campaignId:c.id},carts,now).eligible,0);assert.equal(createCampaign(state,input({requestId:'repeat'}),now).id,createCampaign(state,input({requestId:'repeat'}),now).id);
 selectOffer(a,a.offers[0].id,now);reconcile(state,carts,now);assert.equal(state.decisions[0].status,'selected');assert.equal(merchantSnapshot(state,carts,now).summary.selections,1);
 a.status='released';reconcile(state,carts,now);assert.equal(state.decisions[0].status,'released');assert.equal(merchantSnapshot(state,carts,now).summary.reservedCents,0);
}
{
 const {state,c}=setup();updateCampaign(state,c.id,{status:'active'},now);const cs=Array.from({length:3},()=>cart());const carts=Object.fromEntries(cs.map(c=>[c.id,c]));assert.equal(runAgent(state,carts,now).submitted,2);assert.equal(state.decisions.reduce((s,d)=>s+d.incentiveCents,0),2000);assert.equal(previewCampaign(state,{campaignId:c.id},carts,now).eligible,0);
 cs[0].status='released';assert.equal(runAgent(state,carts,now).submitted,1);assert.equal(merchantSnapshot(state,carts,now).summary.reservedCents,2000);
}
{
 const {state,c}=setup({dailyBudget:'100',products:[{name:'Sony WH-1000XM4',variant:'Black · New',unitPrice:'150',cost:'90',stock:1}]});updateCampaign(state,c.id,{status:'active'},now);const a=cart(),b=cart();assert.equal(runAgent(state,{[a.id]:a,[b.id]:b},now).submitted,1);assert.equal(evaluate(state,c,b,now).reason,'Insufficient available stock');a.status='released';assert.equal(runAgent(state,{[a.id]:a,[b.id]:b},now).submitted,1);
}
{
 const {state,c}=setup({strategy:'competitive'});updateCampaign(state,c.id,{status:'active'},now);const a=cart();assert.equal(runAgent(state,{[a.id]:a},now).submitted,1);assert.equal(a.offers[0].amount,14999);
 const b=cart({offers:[{amount:10000,expiresAt:new Date(now+60000).toISOString(),snapshotHash:'x'}]});b.offers[0].snapshotHash=b.digest;assert.equal(evaluate(state,c,b,now).eligible,false);
}
{
 const {state,c}=setup();updateCampaign(state,c.id,{status:'active'},now);
 for(const a of [cart({status:'released'}),cart({published:false}),cart({expiresAt:new Date(now-1).toISOString()}),cart({selectedOfferId:'old'}),cart({sellers:'Only Costco'}),cart({items:[{name:'Sony WH-1000XM5',variant:'Black · New',cents:15000,quantity:1}]}),cart({items:[{name:'Sony WH-1000XM4',variant:'Silver · New',cents:15000,quantity:1}]}),cart({deliveryDate:new Date(now).toISOString().slice(0,10)})])assert.equal(evaluate(state,c,a,now).eligible,false);
 assert.equal(previewCampaign(state,{campaignId:c.id},{private:cart({published:false}),closed:cart({status:'released'})},now).total,0);
 const a=cart();a.items[0].quantity=6;assert.equal(evaluate(state,c,a,now).eligible,false);
 assert.throws(()=>updateCampaign(state,c.id,{dailyBudget:'40'},now),/Pause/);updateCampaign(state,c.id,{status:'paused'},now);assert.equal(runAgent(state,{[a.id]:a},now).submitted,0);
}
{
 const {state,c}=setup({inventoryAttested:false});assert.throws(()=>updateCampaign(state,c.id,{status:'active'},now),/Confirm inventory/);assert.equal(c.status,'paused');
 updateCampaign(state,c.id,{dailyBudget:'50',inventoryAttested:true},now);assert.equal(c.dailyBudgetCents,5000);assert.equal(c.inventoryAttested,true);const original=structuredClone(c);assert.throws(()=>updateCampaign(state,c.id,{status:'paused',dailyBudget:'bad'},now));assert.deepEqual(c,original);
 assert.throws(()=>createCampaign(state,input({minMarginPct:100}),now),/margin/);assert.throws(()=>createCampaign(state,input({dailyBudget:'-1'}),now),/USD/);
}
{
 const {state,c}=setup({dailyBudget:'100',maxIncentive:'100',discountPct:50,minMarginPct:40});updateCampaign(state,c.id,{status:'active'},now);const a=cart();assert.equal(runAgent(state,{[a.id]:a},now).submitted,0); // cost 90 / 60% = 150 floor
}
{
 const {state,c}=setup();updateCampaign(state,c.id,{status:'active'},now);const a=cart();runAgent(state,{[a.id]:a},now);reconcile(state,{[a.id]:a},now+61*60000);assert.equal(state.decisions[0].status,'released');assert.equal(runAgent(state,{[a.id]:a},now+61*60000).submitted,0); // no repeat bidding on the same intent
}
{
 const {state,c}=setup({products:[{name:'Sony WH-1000XM4',variant:'Black · New',unitPrice:'150',cost:'90',stock:3}]});updateCampaign(state,c.id,{status:'active'},now);const a=cart();a.items.push({...a.items[0]});a.amount=30000;a.authorizedAmount=30000;assert.equal(runAgent(state,{[a.id]:a},now).submitted,1);assert.equal(state.decisions[0].units.reduce((s,u)=>s+u.quantity,0),2);
}
{
 const state=newMerchantState();const first=createCampaign(state,input({products:[{name:'Sony WH-1000XM4',variant:'Black · New',unitPrice:'150',cost:'90',stock:1}]}),now);const second=createCampaign(state,input({name:'Second campaign',discountPct:30,products:[{name:'Sony WH-1000XM4',variant:'Black · New',unitPrice:'150',cost:'90',stock:1}]}),now);for(const c of [first,second])updateCampaign(state,c.id,{status:'active'},now);const a=cart(),b=cart();assert.equal(runAgent(state,{[a.id]:a,[b.id]:b},now).submitted,1);assert.equal(state.decisions.length,1); // shared stock across campaigns for one business
}
assert.deepEqual(parseCatalogCSV('name,variant,unitPrice,cost,stock,url\r\n"Sony, headphones",Black,150.00,90,3,https://example.com/a')[0],{name:'Sony, headphones',variant:'Black',unitPrice:'150.00',cost:'90',stock:3,url:'https://example.com/a'});
assert.throws(()=>parseCatalogCSV('name,variant,unitPrice,cost\na,b,1,1'),/stock/);
assert.throws(()=>parseCatalogCSV('name,variant,unitPrice,cost,stock\n"oops'),/Unclosed/);
console.log('Merchant campaign engine: pricing, budget reservations, inventory, eligibility, previews, deduplication, selection/release, expiry and CSV passed.');
