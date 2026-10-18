import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {buildRequest} from './visa.mjs';
const config={merchant:'test_merchant',key:'test-key',secret:Buffer.from('offline-test-key').toString('base64')};
for(const action of ['authorize','capture','reverse']){
 const {url,options}=buildRequest(action,'180.00','123456789',config,'Sat, 17 Oct 2026 12:00:00 GMT',action==='authorize'?'offline-token':null,{firstName:'Offline',lastName:'Fixture',email:'test@example.com',address1:'1 Test St',locality:'Test',administrativeArea:'WA',postalCode:'00000',country:'US'});
 assert.equal(new URL(url).host,'apitest.visaacceptance.com');
 assert.equal(options.redirect,'error');
 assert.equal(options.headers.digest,'SHA-256='+createHash('sha256').update(options.body).digest('base64'));
 const headers=options.headers;
 const canonical=`host: ${headers.host}\nv-c-date: ${headers['v-c-date']}\n(request-target): post ${new URL(url).pathname}\ndigest: ${headers.digest}\nv-c-merchant-id: ${headers['v-c-merchant-id']}`;
 const signature=createHmac('sha256',Buffer.from(config.secret,'base64')).update(canonical).digest('base64');
 assert.ok(headers.signature.endsWith(`signature="${signature}"`));
 if(action==='authorize')assert.equal(JSON.parse(options.body).processingInformation.capture,false);
 else assert.ok(!JSON.parse(options.body).paymentInformation);
}
for(const amount of ['0.00','-1.00','999.00','NaN','1e2'])assert.throws(()=>buildRequest('authorize',amount,null,config));
assert.throws(()=>buildRequest('capture','10.00','../../other',config));
console.log('PASS: sandbox-only endpoints, authorization without capture, follow-on operations, signing, invalid amount/ID rejection. No network requests made.');

assert.throws(()=>buildRequest('authorize','180.00',null,config),/explicitly entered sandbox card/);

const billing={firstName:'Offline',lastName:'Fixture',address1:'1 Test St',locality:'Test',administrativeArea:'WA',postalCode:'00000',country:'US',email:'test@example.com'};
const entered={number:'4111111111111111',expirationMonth:'12',expirationYear:'2030',securityCode:'123'};
assert.throws(()=>buildRequest('authorize','19.88',null,config,undefined,{...entered,number:'4012888888881881'},billing),/public Visa test card/,'Demo mode rejects other Luhn-valid Visa card numbers');
const direct=buildRequest('authorize','19.88',null,config,undefined,entered,billing,'later-test-reference');
assert.deepEqual(JSON.parse(direct.options.body).paymentInformation.card,entered);
assert.equal(JSON.parse(direct.options.body).clientReferenceInformation.code,'later-test-reference');
assert.equal(JSON.parse(direct.options.body).orderInformation.billTo.email,billing.email);
assert.throws(()=>buildRequest('authorize','19.88',null,config,undefined,{...entered,number:'4111111111111112'},billing),/number/);
assert.throws(()=>buildRequest('authorize','19.88',null,config,undefined,entered),/billing/);
