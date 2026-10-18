import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCart,authorize} from './engine.mjs';
import {waitingIntents} from './merchant-intents.mjs';
const now=Date.now();
async function wait(){const cart=validateCart({items:[{name:'Sunday Smiski Series',variant:'Museum · new',quantity:1,price:'12'}],hours:12,sellers:'Authorized retailers only',deliveryDate:new Date(now+7*86400000).toISOString().slice(0,10),publish:true,consent:true},now);await authorize(cart,async()=>({id:'123456',status:'AUTHORIZED',orderInformation:{amountDetails:{authorizedAmount:'12.00'}}}));return cart;}
test('overnight wait appears immediately in merchant inbox with actual deadline and live offer count',async()=>{
 const cart=await wait();Object.assign(cart,{owner:'private-shopper',privateDemandKey:'private-card',offers:[{snapshotHash:cart.digest,expiresAt:new Date(now+60000).toISOString()},{snapshotHash:cart.digest,expiresAt:new Date(now-1000).toISOString()},{snapshotHash:'outdated',expiresAt:new Date(now+60000).toISOString()},{source:'openrtb-demo',snapshotHash:cart.digest,expiresAt:new Date(now+60000).toISOString()}]});
 cart.items[0].privateNote='never shared';
 const [result]=waitingIntents({[cart.id]:cart},now);
 assert.equal(result.items[0].name,'Sunday Smiski Series');assert.equal(result.waitHours,12);assert.equal(result.expiresAt,cart.expiresAt);assert.equal(result.offerCount,1);
 assert.equal(result.owner,undefined);assert.equal(result.privateDemandKey,undefined);assert.equal(result.items[0].privateNote,undefined);
});
test('unpublished, pending, released, selected, expired and synthetic carts never become waiting demand',async()=>{
 const base=await wait();const variants=[{published:false},{status:'authorizing'},{status:'released'},{selectedOfferId:'selected'},{expiresAt:new Date(now-1).toISOString()},{synthetic:true},{authorizationId:null}];
 for(const patch of variants)assert.deepEqual(waitingIntents({cart:{...base,...patch}},now),[]);
 assert.deepEqual(waitingIntents({cart:base},now+12*3600000),[]);
});
