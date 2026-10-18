import assert from 'node:assert/strict';
import test from 'node:test';
import {createIntentSync} from './intent-sync.mjs';
import {validateCart,authorize} from '../committed-cart/engine.mjs';
import {newMerchantState} from '../committed-cart/merchant-engine.mjs';
import {ingestIntent} from '../../hosted/intent-feed.js';

const image='https://m.media-amazon.com/images/I/31vSl-DWHpL._AC_.jpg';
async function fixture(){
 const deliveryDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const cart=validateCart({consent:true,publish:true,hours:12,sellers:'Authorized retailers only',deliveryDate,items:[{name:'Sunday Smiski Series',variant:'Sealed blind box',quantity:1,price:'20.00',url:'https://www.amazon.com/dp/B0FMP9T45N'}],shoppingTerms:{maxTotalCents:1800,minimumSavingsCents:200,waitHours:12,deliveryBy:deliveryDate,condition:'new'},productImages:[image]});
 // Offline response fixture only: this test never authorizes a network payment.
 await authorize(cart,async()=>({id:'123456789',status:'AUTHORIZED',orderInformation:{amountDetails:{authorizedAmount:'20.00'}}}));
 return cart;
}

test('sync carries overnight terms and public photo to hosted feed without private fields',async()=>{
 const cart=await fixture(),digest=cart.digest;
 cart.owner='PRIVATE_OWNER';cart.privateDemandKey='PRIVATE_CARD_FINGERPRINT';cart.visaReceipt={private:'PRIVATE_RECEIPT'};cart.items[0].privateMetadata='PRIVATE_ITEM_METADATA';
 const cloud={carts:{},merchant:newMerchantState()};let saves=0,requests=0;
 const sync=createIntentSync({carts:{[cart.id]:cart},key:'OFFLINE_TEST_KEY',save:async()=>{saves++;},fetchImpl:async(url,options)=>{
  requests++;assert.equal(url,'https://later-merchant-mcp.vercel.app/api/agent/ingest');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer OFFLINE_TEST_KEY');
  for(const value of ['PRIVATE_OWNER','PRIVATE_CARD_FINGERPRINT','PRIVATE_RECEIPT','PRIVATE_ITEM_METADATA'])assert.equal(options.body.includes(value),false);
  const body=JSON.parse(options.body);assert.deepEqual(body.cart.productImages,[image]);assert.equal(body.cart.shoppingTerms.waitHours,12);
  return {ok:true,json:async()=>ingestIntent(cloud,body)};
 }});
 await sync();assert.equal(requests,1);assert.equal(saves,1);assert.ok(cart.hostedIntentSyncedAt);
 assert.deepEqual(cloud.carts[cart.id].productImages,[image]);assert.deepEqual(cloud.carts[cart.id].shoppingTerms,cart.shoppingTerms);assert.equal(cloud.carts[cart.id].digest,digest);
 cart.status='released';cart.visaStatus='REVERSED';await sync();assert.equal(cloud.carts[cart.id].status,'released');await sync();assert.equal(requests,2,'Closed intents are not repeatedly transmitted');
});

test('sync normalizes image metadata and never sends an unconfirmed intent',async()=>{
 const cart=await fixture();cart.productImages=['http://localhost/private-image','https://example.com/unused.jpg'];let requests=0;
 const sync=createIntentSync({carts:{[cart.id]:cart},key:'OFFLINE_TEST_KEY',save:async()=>{},fetchImpl:async(url,options)=>{requests++;assert.deepEqual(JSON.parse(options.body).cart.productImages,['']);return{ok:true,json:async()=>({offers:[]})};}});
 await sync();assert.equal(requests,1);
 const unconfirmed=await fixture();delete unconfirmed.authorizationId;
 await createIntentSync({carts:{[unconfirmed.id]:unconfirmed},key:'OFFLINE_TEST_KEY',save:async()=>{},fetchImpl:async()=>{throw new Error('Unconfirmed cart must not be sent');}})();
});
