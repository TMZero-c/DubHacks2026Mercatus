import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {buildTransactionDetailsRequest,matchesTransaction,reconcileVisaReceipt,indexingDelay} from './visa-receipt.mjs';
import {identifySandboxCard,demandKey,duplicateDemand} from './card-identity.mjs';
import {verify} from './engine.mjs';

const config={merchant:'offline_merchant',key:'offline-key',secret:Buffer.from('offline-test-only').toString('base64')};
const now=Date.now();
const cart=()=>({id:'offline-cart',clientReference:'later-offline-cart',environment:'visa-acceptance-sandbox',authorizationId:'123456789',amount:1988,authorizedAmount:1988,currency:'USD',authorizedAt:new Date(now-indexingDelay-1).toISOString(),expiresAt:new Date(now+3600000).toISOString(),items:[{name:'Headphones',variant:'Black',quantity:1}],status:'authorized',visaStatus:'AUTHORIZED',published:true});
const record=()=>({id:'123456789',merchantId:config.merchant,clientReferenceInformation:{code:'later-offline-cart'},orderInformation:{amountDetails:{totalAmount:'19.88',authorizedAmount:'19.88',currency:'USD'}},applicationInformation:{applications:[{name:'ics_auth',reasonCode:'100',rFlag:'SOK'}]},paymentInformation:{card:{number:'PRIVATE-FIXTURE-MUST-NOT-BE-STORED'}}});

test('TSS requests are read-only, sandbox-only, signed and reject path injection',()=>{
 const {url,options}=buildTransactionDetailsRequest('123456789',config,'fixed-date');
 assert.equal(url,'https://apitest.visaacceptance.com/tss/v2/transactions/123456789');assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,'error');assert.equal(options.headers.Accept,'application/hal+json');
 const canonical='host: apitest.visaacceptance.com\nv-c-date: fixed-date\n(request-target): get /tss/v2/transactions/123456789\nv-c-merchant-id: offline_merchant';
 const signature=createHmac('sha256',Buffer.from(config.secret,'base64')).update(canonical).digest('base64');assert.ok(options.headers.signature.endsWith(`signature="${signature}"`));
 assert.throws(()=>buildTransactionDetailsRequest('../other',config));
});
test('record matching requires exact merchant, reference, amount, currency and approved authorization',()=>{
 assert.equal(matchesTransaction(cart(),record(),config.merchant),true);
 for(const change of [r=>r.id='99',r=>r.merchantId='another',r=>r.clientReferenceInformation.code='other',r=>r.orderInformation.amountDetails.totalAmount='19.89',r=>r.orderInformation.amountDetails.authorizedAmount='10.00',r=>r.orderInformation.amountDetails.currency='EUR',r=>r.applicationInformation.applications[0].reasonCode='203']){const r=record();change(r);assert.equal(matchesTransaction(cart(),r,config.merchant),false);}
});
test('delayed records back off, cache success, stop at five reads, and never store payment details',async()=>{
 const c=cart();let calls=0;const fetchImpl=async()=>{calls++;return{ok:true,status:200,json:async()=>record()}};
 await reconcileVisaReceipt(c,config,{fetchImpl,now});assert.equal(c.visaReceipt.status,'matched');assert.ok(!JSON.stringify(c).includes('PRIVATE-FIXTURE'));
 await reconcileVisaReceipt(c,config,{fetchImpl,now:now+indexingDelay});assert.equal(calls,1);
 const pending=cart();let count=0;const missing=async()=>{count++;return{ok:false,status:404}};
 for(let i=0;i<7;i++){await reconcileVisaReceipt(pending,config,{fetchImpl:missing,now:now+i*indexingDelay});await reconcileVisaReceipt(pending,config,{fetchImpl:missing,now:now+i*indexingDelay+1});}
 assert.equal(count,5);assert.equal(pending.visaReceipt.status,'unavailable');
 const released={...c,status:'released',visaStatus:'REVERSED'};assert.equal(verify(released).active,false,'Historical match must not revive a released hold');
});
test('mismatched remote records quarantine demand rather than approving it',async()=>{
 const c=cart();await reconcileVisaReceipt(c,config,{now,fetchImpl:async()=>({ok:true,status:200,json:async()=>({...record(),id:'99'})})});assert.equal(c.status,'needs_review');assert.equal(verify(c).acceptingOffers,false);
});
test('TMS sends PAN only, discards the payment identifier, and deduplicates only matching baskets',async()=>{
 const card={number:'4111111111111111',expirationMonth:'12',expirationYear:'2030',securityCode:'123'};let seen;
 const identity=await identifySandboxCard(card,config,{fetchImpl:async(url,options)=>{seen={url,body:JSON.parse(options.body)};return{ok:true,status:201,json:async()=>({object:'instrumentIdentifier',state:'ACTIVE',id:'offline-private-token'})}}});
 assert.equal(seen.url,'https://apitest.visaacceptance.com/tms/v1/instrumentidentifiers');assert.deepEqual(seen.body,{card:{number:card.number}});assert.match(identity,/^[a-f0-9]{64}$/);assert.ok(!identity.includes('offline-private-token'));
 const key=demandKey(identity,cart());assert.equal(duplicateDemand({a:{...cart(),privateDemandKey:key}},key),true);
 assert.equal(duplicateDemand({a:{...cart(),privateDemandKey:key,status:'released'}},key),false);
 assert.notEqual(key,demandKey(identity,{...cart(),items:[{name:'Headphones',variant:'White',quantity:1}]}));
 const key2=demandKey(identity,{...cart(),items:[{name:' HEADPHONES ',variant:'BLACK',quantity:1,url:'https://other.example'}]});assert.equal(key,key2);
 await assert.rejects(()=>identifySandboxCard(card,config,{fetchImpl:async()=>({ok:false,status:403})}),/not confirmed/);
});
