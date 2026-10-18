import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtemp,readFile,stat,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCardVault} from './card-vault.mjs';
import {buildRequest,signedDelete} from '../visa-sandbox/visa.mjs';

// All provider responses in this file are explicit offline fixtures. These tests
// never create tokens, charge cards, or contact Visa's sandbox.
const config={merchant:'offline_merchant',key:'offline-key',secret:Buffer.from('offline-shared-secret').toString('base64')};
const owner='offline-owner-aaaaaaaa',other='offline-owner-bbbbbbbb';
const input={number:'4111111111111111',expirationMonth:'12',expirationYear:'2035',securityCode:'123'};
const billing={firstName:'Offline',lastName:'Fixture',address1:'1 Private St',locality:'Seattle',administrativeArea:'WA',postalCode:'98105',country:'US',email:'offline@example.com'};
const identifierId='offline-instrument-identifier',instrumentId='offline-payment-instrument';
function provider(){
 const calls=[];
 return{calls,fetchImpl:async(url,options)=>{
  calls.push({url,options,body:options.body?JSON.parse(options.body):undefined});
  if(options.method==='DELETE')return{ok:true,status:204};
  const identifier=new URL(url).pathname==='/tms/v1/instrumentidentifiers';
  return{ok:true,status:201,json:async()=>({id:identifier?identifierId:instrumentId,object:identifier?'instrumentIdentifier':'paymentInstrument',state:'ACTIVE'})};
 }};
}
async function temporary(t){const directory=await mkdtemp(join(tmpdir(),'later-card-vault-offline-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
test('consent and owner validation happen before any provider call',async t=>{
 const directory=await temporary(t),remote=provider(),vault=createCardVault({directory,config,...remote});
 await assert.rejects(()=>vault.register(owner,input,billing),{code:'SAVE_CONSENT_REQUIRED'});
 await assert.rejects(()=>vault.register(owner,input,billing,{consent:'true'}),{code:'SAVE_CONSENT_REQUIRED'});
 await assert.rejects(()=>vault.register('short',input,billing,{consent:true}),{code:'INVALID_OWNER'});
 await assert.rejects(()=>vault.register(owner,{...input,number:'4012888888881881'},billing,{consent:true}),/public Visa test card/);
 assert.equal(remote.calls.length,0);
});
test('TMS creates exact instrument requests and retains encrypted references only',async t=>{
 const directory=await temporary(t),remote=provider(),vault=createCardVault({directory,config,...remote});
 const saved=await vault.register(owner,input,billing,{consent:true});
 assert.match(saved.id,/^[a-f0-9-]{36}$/);
 assert.deepEqual(Object.keys(saved).sort(),['id','brand','last4','expirationMonth','expirationYear'].sort());
 assert.equal(saved.brand,'Visa');assert.equal(saved.last4,'1111');
 assert.deepEqual(remote.calls[0].body,{card:{number:input.number}});
 assert.deepEqual(remote.calls[1].body,{card:{expirationMonth:'12',expirationYear:'2035',type:'visa'},billTo:billing,instrumentIdentifier:{id:identifierId}});
 for(const call of remote.calls){assert.equal(new URL(call.url).host,'apitest.visaacceptance.com');assert.equal(call.options.redirect,'error');assert.ok(!call.options.body.includes('securityCode'));}
 const encoded=await readFile(join(directory,'cards.enc'),'utf8');
 for(const secret of [input.number,identifierId,instrumentId,billing.email,billing.address1,owner])assert.ok(!encoded.includes(secret));
 assert.equal((await stat(join(directory,'cards.enc'))).mode&0o777,0o600);
 assert.equal((await stat(join(directory,'vault.key'))).mode&0o777,0o600);
 assert.equal((await stat(directory)).mode&0o777,0o700);
 assert.deepEqual(await vault.list(owner),[saved]);
 assert.deepEqual(await vault.list(other),[]);
 const again=await vault.register(owner,input,billing,{consent:true});assert.deepEqual(again,saved);assert.equal(remote.calls.length,2);
});
test('saved credentials authorize without raw card, CVV, billing or browser token injection',async t=>{
 const directory=await temporary(t),remote=provider(),vault=createCardVault({directory,config,...remote});
 const saved=await vault.register(owner,input,billing,{consent:true}),payment=await vault.payment(owner,saved.id);
 assert.ok(!JSON.stringify(payment).includes(instrumentId));
 const request=buildRequest('authorize','1.00',null,config,undefined,payment),body=JSON.parse(request.options.body);
 assert.deepEqual(body.paymentInformation,{paymentInstrument:{id:instrumentId}});
 assert.equal(body.processingInformation.capture,false);assert.equal(body.orderInformation.billTo,undefined);assert.ok(!request.options.body.includes(input.number));
 assert.throws(()=>buildRequest('authorize','1.00',null,config,undefined,JSON.parse(JSON.stringify(payment))),/public Visa test card/);
 assert.throws(()=>buildRequest('authorize','1.00',null,config,undefined,{paymentInstrument:{id:instrumentId}}),/public Visa test card/);
 await assert.rejects(()=>vault.payment(other,saved.id),{code:'CARD_NOT_FOUND'});
 await assert.rejects(()=>vault.identity(other,saved.id),{code:'CARD_NOT_FOUND'});
 await assert.rejects(()=>vault.remove(other,saved.id),{code:'CARD_NOT_FOUND'});
 assert.equal(remote.calls.length,2);
 const expected=createHmac('sha256',Buffer.from(config.secret,'base64')).update('later-card-identity-v1\0'+config.merchant+'\0'+identifierId).digest('hex');
 assert.equal(await vault.identity(owner,saved.id),expected);
});
test('saved references survive restart and deletion is signed and confirmed by Visa',async t=>{
 const directory=await temporary(t),remote=provider();let vault=createCardVault({directory,config,...remote});
 const saved=await vault.register(owner,input,billing,{consent:true});vault=createCardVault({directory,config,...remote});
 assert.deepEqual(await vault.list(owner),[saved]);
 assert.deepEqual(await vault.remove(owner,saved.id),{removed:true,id:saved.id});
 const call=remote.calls.at(-1);assert.equal(call.url,'https://apitest.visaacceptance.com/tms/v1/paymentinstruments/'+instrumentId);
 assert.equal(call.options.method,'DELETE');assert.equal(call.options.body,undefined);
 const headers=call.options.headers,canonical=`host: ${headers.host}\nv-c-date: ${headers['v-c-date']}\n(request-target): delete /tms/v1/paymentinstruments/${instrumentId}\nv-c-merchant-id: ${config.merchant}`;
 const signature=createHmac('sha256',Buffer.from(config.secret,'base64')).update(canonical).digest('base64');assert.ok(headers.signature.endsWith(`signature="${signature}"`));
 assert.deepEqual(await vault.list(owner),[]);await assert.rejects(()=>vault.payment(owner,saved.id),{code:'CARD_NOT_FOUND'});
 assert.throws(()=>signedDelete('/tms/v1/paymentinstruments/../../other',config),/endpoint/);
 assert.throws(()=>signedDelete('/pts/v2/payments/1',config),/endpoint/);
});
test('uncertain creation cannot create duplicate tokens on retry or restart',async t=>{
 const directory=await temporary(t);let count=0;
 const fetchImpl=async()=>{count++;throw new Error('offline injected timeout');};
 let vault=createCardVault({directory,config,fetchImpl});
 await assert.rejects(()=>vault.register(owner,input,billing,{consent:true}),{code:'TMS_UNCERTAIN'});
 vault=createCardVault({directory,config,fetchImpl});
 await assert.rejects(()=>vault.register(owner,input,billing,{consent:true}),{code:'TMS_REVIEW_REQUIRED'});
 assert.equal(count,1);assert.deepEqual(await vault.list(owner),[]);
});
test('known payment-instrument rejection reuses identifier; uncertain creation stays blocked',async t=>{
 const directory=await temporary(t),remote=provider();let reject=true;
 const fetchImpl=async(url,options)=>{if(new URL(url).pathname==='/tms/v1/paymentinstruments'&&reject){reject=false;return{ok:false,status:403};}return remote.fetchImpl(url,options);};
 const vault=createCardVault({directory,config,fetchImpl});
 await assert.rejects(()=>vault.register(owner,input,billing,{consent:true}),{code:'TMS_REJECTED'});
 const saved=await vault.register(owner,input,billing,{consent:true});assert.ok(saved.id);
 assert.equal(remote.calls.filter(call=>new URL(call.url).pathname==='/tms/v1/instrumentidentifiers').length,1);
 const second=await temporary(t);let requests=0;
 const uncertain=createCardVault({directory:second,config,fetchImpl:async(url,options)=>{requests++;if(requests===1)return remote.fetchImpl(url,options);return{ok:false,status:500};}});
 await assert.rejects(()=>uncertain.register(owner,input,billing,{consent:true}),{code:'TMS_UNCERTAIN'});
 await assert.rejects(()=>uncertain.register(owner,input,billing,{consent:true}),{code:'TMS_REVIEW_REQUIRED'});assert.equal(requests,2);
});
test('unconfirmed deletion disables payment and retains reference for safe delete retry',async t=>{
 const directory=await temporary(t),remote=provider();let reject=true;
 const vault=createCardVault({directory,config,fetchImpl:async(url,options)=>{if(options.method==='DELETE'&&reject){reject=false;return{ok:false,status:500};}return remote.fetchImpl(url,options);}});
 const saved=await vault.register(owner,input,billing,{consent:true});
 await assert.rejects(()=>vault.remove(owner,saved.id),{code:'TMS_DELETE_UNCERTAIN'});
 await assert.rejects(()=>vault.payment(owner,saved.id),{code:'CARD_UNAVAILABLE'});
 await assert.rejects(()=>vault.register(owner,input,billing,{consent:true}),{code:'TMS_REVIEW_REQUIRED'});
 assert.deepEqual(await vault.remove(owner,saved.id),{removed:true,id:saved.id});
});
test('concurrent registrations across instances create one token pair',async t=>{
 const directory=await temporary(t),remote=provider(),first=createCardVault({directory,config,...remote}),second=createCardVault({directory,config,...remote});
 const results=await Promise.all([first.register(owner,input,billing,{consent:true}),second.register(owner,input,billing,{consent:true})]);
 assert.equal(results[0].id,results[1].id);assert.equal(remote.calls.length,2);
});
test('tampering, lost encryption keys, and a different merchant fail closed',async t=>{
 const directory=await temporary(t),remote=provider(),vault=createCardVault({directory,config,...remote});
 await vault.register(owner,input,billing,{consent:true});
 const encoded=await readFile(join(directory,'cards.enc'),'utf8');
 await assert.rejects(()=>createCardVault({directory,config:{...config,merchant:'other_merchant'},...remote}).list(owner),{code:'VAULT_STORAGE'});
 const envelope=JSON.parse(encoded);envelope.tag=Buffer.alloc(16).toString('base64');await writeFile(join(directory,'cards.enc'),JSON.stringify(envelope));
 await assert.rejects(()=>vault.list(owner),{code:'VAULT_STORAGE'});
 await writeFile(join(directory,'cards.enc'),encoded);await rm(join(directory,'vault.key'));
 await assert.rejects(()=>vault.list(owner),{code:'VAULT_STORAGE'});
});
test('a definitive identifier rejection permits an explicit retry without retaining a pending card',async t=>{
 const directory=await temporary(t),remote=provider();let reject=true;
 const vault=createCardVault({directory,config,fetchImpl:async(url,options)=>{if(reject){reject=false;return{ok:false,status:400};}return remote.fetchImpl(url,options);}});
 await assert.rejects(()=>vault.register(owner,input,billing,{consent:true}),{code:'TMS_REJECTED'});
 assert.deepEqual(await vault.list(owner),[]);
 assert.equal((await vault.register(owner,input,billing,{consent:true})).last4,'1111');assert.equal(remote.calls.length,2);
});
test('invalid successful provider responses remain uncertain and cannot be repeated',async t=>{
 for(const response of [
  {ok:true,status:201,json:async()=>{throw new Error('offline malformed JSON');}},
  {ok:true,status:201,json:async()=>({id:'../../unsafe',object:'instrumentIdentifier',state:'ACTIVE'})},
  {ok:true,status:201,json:async()=>({id:identifierId,object:'instrumentIdentifier',state:'SUSPENDED'})}
 ]){
  const directory=await temporary(t);let count=0;const vault=createCardVault({directory,config,fetchImpl:async()=>{count++;return response;}});
  await assert.rejects(()=>vault.register(owner,input,billing,{consent:true}),{code:'TMS_UNCERTAIN'});
  await assert.rejects(()=>vault.register(owner,input,billing,{consent:true}),{code:'TMS_REVIEW_REQUIRED'});assert.equal(count,1);
 }
});
test('symbolic-link storage cannot redirect private card reads or writes',async t=>{
 const directory=await temporary(t),outside=await temporary(t),remote=provider();
 await writeFile(join(outside,'outside-key'),'unchanged');await symlink(join(outside,'outside-key'),join(directory,'vault.key'));
 const vault=createCardVault({directory,config,...remote});
 await assert.rejects(()=>vault.list(owner),{code:'VAULT_STORAGE'});assert.equal(await readFile(join(outside,'outside-key'),'utf8'),'unchanged');assert.equal(remote.calls.length,0);
});
test('provider diagnostics are private, allowlisted, and omit response values and identifiers',async t=>{
 const directory=await temporary(t),remote=provider();
 const vault=createCardVault({directory,config,fetchImpl:async(url,options)=>{
  if(new URL(url).pathname==='/tms/v1/instrumentidentifiers')return remote.fetchImpl(url,options);
  return{ok:false,status:400,json:async()=>({id:instrumentId,reason:'INVALID_DATA',reasonCode:'102',message:'Rejected '+input.number,details:[{field:'card.type',value:input.number},{field:'billTo.email',value:billing.email},{field:instrumentId},{field:'card.type'}]})};
 }});
 await assert.rejects(()=>vault.register(owner,input,billing,{consent:true}),error=>{
  assert.equal(error.code,'TMS_REJECTED');assert.deepEqual(error.diagnostics,{path:'/tms/v1/paymentinstruments',httpStatus:400,reason:'INVALID_DATA',reasonCode:'102',fields:['card.type','billTo.email']});
  assert.equal(Object.prototype.propertyIsEnumerable.call(error,'diagnostics'),false);assert.ok(!JSON.stringify(error).includes('INVALID_DATA'));
  for(const secret of [input.number,instrumentId,billing.email])assert.ok(!JSON.stringify(error.diagnostics).includes(secret));return true;
 });
});
