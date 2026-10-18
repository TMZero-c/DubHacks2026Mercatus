import assert from 'node:assert/strict';
import test from 'node:test';
import {validateCart,authorize} from '../outputs/committed-cart/engine.mjs';
import {newMerchantState} from '../outputs/committed-cart/merchant-engine.mjs';
import {ingestIntent} from './intent-feed.js';

const image='https://m.media-amazon.com/images/I/31vSl-DWHpL._AC_.jpg';
const state=()=>({carts:{},merchant:newMerchantState()});
async function fixture({hours=12,terms=true}={}){
 const deliveryDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const cart=validateCart({consent:true,publish:true,hours,sellers:'Authorized retailers only',deliveryDate,items:[{name:'Sunday Smiski Series',variant:'Sealed blind box',quantity:1,price:'20.00',url:'https://www.amazon.com/dp/B0FMP9T45N'}],...(terms?{shoppingTerms:{maxTotalCents:1800,minimumSavingsCents:200,waitHours:hours,deliveryBy:deliveryDate,condition:'new'}}:{})});
 // Valid Visa response shape in an offline fixture; no live payment or synthetic fallback.
 await authorize(cart,async()=>({id:'123456789',status:'AUTHORIZED',orderInformation:{amountDetails:{authorizedAmount:'20.00'}}}));
 return cart;
}

test('hosted ingest preserves commitment terms for every supported duration',async()=>{
 for(const hours of [.25,1,12,24]){
  const cart=await fixture({hours}),cloud=state();assert.equal(ingestIntent(cloud,{cart}).accepted,true);
  assert.deepEqual(cloud.carts[cart.id].shoppingTerms,cart.shoppingTerms);assert.equal(cloud.carts[cart.id].digest,cart.digest);
 }
 const legacy=await fixture({terms:false}),cloud=state();ingestIntent(cloud,{cart:legacy});assert.equal(cloud.carts[legacy.id].shoppingTerms,undefined);
});

test('optional public images are normalized and do not change the commitment fingerprint',async()=>{
 const cart=await fixture(),cloud=state(),digest=cart.digest;cart.productImages=[image];cart.owner='PRIVATE_OWNER';cart.visaReceipt={raw:'PRIVATE_RECEIPT'};
 ingestIntent(cloud,{cart});assert.deepEqual(cloud.carts[cart.id].productImages,[image]);assert.equal(cloud.carts[cart.id].digest,digest);assert.equal(cloud.carts[cart.id].owner,undefined);assert.equal(cloud.carts[cart.id].visaReceipt,undefined);assert.equal(cloud.carts[cart.id].items[0].image,undefined);
 cart.productImages=['https://localhost/private'];ingestIntent(cloud,{cart});assert.deepEqual(cloud.carts[cart.id].productImages,['']);assert.equal(cloud.carts[cart.id].digest,digest);
});

test('fingerprint changes to products or shopping terms are rejected on creation and updates',async()=>{
 for(const existing of [false,true])for(const change of [c=>{c.items[0].name='Different product';},c=>{c.shoppingTerms.minimumSavingsCents=300;},c=>{c.currency='EUR';}]){
  const cart=await fixture(),cloud=state();if(existing)ingestIntent(cloud,{cart:structuredClone(cart)});const before=JSON.stringify(cloud);
  change(cart);assert.throws(()=>ingestIntent(cloud,{cart}),/fingerprint/i);assert.equal(JSON.stringify(cloud),before);
 }
});

test('invalid authorization, unsupported deadlines and closed reactivation remain rejected',async()=>{
 const original=await fixture();
 for(const patch of [{synthetic:true},{authorizationId:null},{authorizedAmount:1},{published:false},{expiresAt:new Date(Date.now()-1000).toISOString()}])assert.throws(()=>ingestIntent(state(),{cart:{...original,...patch}}));
 const badDuration=structuredClone(original);badDuration.expiresAt=new Date(Date.parse(badDuration.createdAt)+2*3600000).toISOString();assert.throws(()=>ingestIntent(state(),{cart:badDuration}),/duration/);
 const cloud=state();ingestIntent(cloud,{cart:original});ingestIntent(cloud,{cart:{...original,status:'released',visaStatus:'REVERSED'}});assert.throws(()=>ingestIntent(cloud,{cart:original}),/reactivated/);
});
