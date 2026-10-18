import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import http from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,relative,resolve} from 'node:path';

// A real HTTP server runs against explicit OFFLINE Visa fixtures. Only source
// modules are copied into isolation: no real .env, credentials, or local state.
// Its fetch preload rejects every outbound request outside the fixed mock API.
const project=fileURLToPath(new URL('../../',import.meta.url));
const extension='chrome-extension://kahjaomahjnhcppboeagnjclfbnjgjje';
const card={number:'4111111111111111',expirationMonth:'12',expirationYear:'2035',securityCode:'123'};
const billTo={firstName:'Offline',lastName:'RouteFixture',address1:'1 Offline Test St',locality:'Seattle',administrativeArea:'WA',postalCode:'98105',country:'US',email:'offline-route@example.com'};
const draft={items:[{name:'Offline headphones',variant:'Black model A',price:'19.88',quantity:1,url:'https://shop.example.test/product'}],hours:1,sellers:'Authorized retailers',deliveryDate:'2035-01-10',consent:true,publish:false};
const cookies={a:'cart_session='+'a'.repeat(64),b:'cart_session='+'b'.repeat(64),c:'cart_session='+'c'.repeat(64)};
async function copyModules(source,destination,seen=new Set()){
 if(seen.has(source))return;seen.add(source);
 const code=await readFile(source,'utf8'),target=join(destination,relative(project,source));
 assert.ok(!relative(project,source).startsWith('..'),'fixture modules stay inside the project');
 await mkdir(dirname(target),{recursive:true});await writeFile(target,code);
 const imports=/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])(\.{1,2}\/[^'"]+)\1/g;
 for(const match of code.matchAll(imports))await copyModules(resolve(dirname(source),match[2]),destination,seen);
}
async function unusedPort(){const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;server.close();await once(server,'close');return port;}
async function fixture(t){
 const directory=await mkdtemp(join(project,'work/.tmp-card-routes-'));
 let child,stopped;
 t.after(async()=>{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');if(stopped)await stopped;await rm(directory,{recursive:true,force:true});});
 await copyModules(join(project,'outputs/committed-cart/server.mjs'),directory);
 const logfile=join(directory,'offline-provider.jsonl'),state=join(directory,'state');
 await writeFile(join(directory,'preload.mjs'),`
import {appendFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const logfile=${JSON.stringify(logfile)};let sequence=0;
globalThis.fetch=async(url,options={})=>{
 const target=new URL(url),body=options.body?JSON.parse(options.body):null;
 if(target.origin!=='https://apitest.visaacceptance.com'){
  await appendFile(logfile,JSON.stringify({unexpected:true,origin:target.origin})+'\\n');throw new Error('Offline fixture blocks outbound network');
 }
 assert.equal(options.redirect,'error');assert.ok(options.headers.signature);
 const method=options.method||'GET',path=target.pathname;
 await appendFile(logfile,JSON.stringify({method,path,amount:body?.orderInformation?.amountDetails?.totalAmount,paymentKind:body?.paymentInformation?.paymentInstrument?'stored':body?.paymentInformation?.card?'raw':null})+'\\n');
 if(method==='POST'&&path==='/tms/v1/instrumentidentifiers'){
  assert.deepEqual(Object.keys(body),['card']);assert.deepEqual(Object.keys(body.card),['number']);
  return Response.json({id:'offline-identifier',object:'instrumentIdentifier',state:'ACTIVE'},{status:201});
 }
 if(method==='POST'&&path==='/tms/v1/paymentinstruments'){
  assert.equal(body.card.type,'visa');assert.equal(body.instrumentIdentifier.id,'offline-identifier');assert.equal(body.card.securityCode,undefined);
  return Response.json({id:'offline-pi-'+(++sequence),object:'paymentInstrument',state:'ACTIVE'},{status:201});
 }
 if(method==='DELETE'&&/^\\/tms\\/v1\\/paymentinstruments\\/offline-pi-\\d+$/.test(path))return new Response(null,{status:204});
 if(method==='POST'&&path==='/pts/v2/payments'){
  assert.equal(body.processingInformation.capture,false);
  if(body.paymentInformation?.paymentInstrument){assert.match(body.paymentInformation.paymentInstrument.id,/^offline-pi-\\d+$/);assert.equal(body.paymentInformation.card,undefined);assert.equal(body.orderInformation.billTo,undefined);}
  return Response.json({id:String(100000+(++sequence)),status:'AUTHORIZED',orderInformation:{amountDetails:{authorizedAmount:body.orderInformation.amountDetails.totalAmount}}},{status:201});
 }
 if(method==='POST'&&/^\\/pts\\/v2\\/payments\\/\\d+\\/reversals$/.test(path))return Response.json({id:String(100000+(++sequence)),status:'REVERSED'},{status:201});
 throw new Error('Unexpected offline provider operation');
};
`);
 const port=await unusedPort(),origin='http://localhost:'+port;
 child=spawn(process.execPath,['--import',join(directory,'preload.mjs'),join(directory,'outputs/committed-cart/server.mjs')],{cwd:directory,env:{PATH:process.env.PATH,HOME:directory,TMPDIR:directory,VISA_MERCHANT_ID:'offline_merchant',VISA_KEY_ID:'offline-key',VISA_SHARED_SECRET:Buffer.from('offline-api-secret').toString('base64'),LATER_STATE_DIR:state,LATER_PORT:String(port),LATER_AGENT_AUTORUN:'0'},stdio:['ignore','pipe','pipe']});
 let output='';stopped=once(child,'exit');
 await new Promise((accept,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Offline HTTP fixture did not start: '+output.slice(-1000))),15000);
  const capture=chunk=>{output+=chunk.toString();if(output.includes('Committed Cart: ')){clearTimeout(timer);accept();}};
  child.stdout.on('data',capture);child.stderr.on('data',capture);child.once('exit',()=>{clearTimeout(timer);reject(new Error('Offline HTTP fixture exited: '+output.slice(-1000)));});
 });
 const browserRequests=[];
 async function request(path,{owner='a',body,method=body?'POST':'GET',requestOrigin=extension,headers={}}={}){
  return new Promise((accept,reject)=>{
   const call=http.request({hostname:'127.0.0.1',port,path,method,headers:{Cookie:cookies[owner],Origin:requestOrigin,...(body?{'Content-Type':'application/json'}:{}),...headers}},response=>{
    let raw='';response.setEncoding('utf8');response.on('data',chunk=>raw+=chunk);response.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=null;}browserRequests.push({path,body,status:response.statusCode});accept({status:response.statusCode,data,raw,headers:response.headers});});response.on('error',reject);
   });call.on('error',reject);if(body)call.write(JSON.stringify(body));call.end();
  });
 }
 return{directory,state,origin,request,browserRequests,log:async()=>{try{return(await readFile(logfile,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(error){if(error.code==='ENOENT')return[];throw error;}}};
}
test('saved-card HTTP flow preserves ownership, bound terms, privacy, consent, and token-only authorization',async t=>{
 const f=await fixture(t);
 const post=(path,body,options={})=>f.request(path,{...options,body});
 assert.deepEqual((await f.request('/api/cards')).data,{cards:[]});
 const beforeInvalid=(await f.log()).length;
 for(const consent of [undefined,false,'true']){
  const rejected=await post('/api/cards',{testCard:'visa-1111',...(consent===undefined?{}:{consent})});assert.equal(rejected.status,400,rejected.raw);
 }
 // Intentional rejected-payload probes; real extension requests below contain
 // only an alias/opaque IDs and cart terms, never PAN, CVV, or billing details.
 const forbiddenFields={card,billTo,cardToken:'offline-transient-token',number:card.number,securityCode:card.securityCode,expirationMonth:card.expirationMonth,expirationYear:card.expirationYear};
 for(const invalid of [{testCard:'unknown-card'},...Object.entries(forbiddenFields).map(([field,value])=>({testCard:'visa-1111',[field]:value})),{card,billTo}]){
  const rejected=await post('/api/cards',{consent:true,...invalid});
  assert.equal(rejected.status,400,rejected.raw);
 }
 assert.equal((await f.log()).length,beforeInvalid,'missing consent, unknown aliases and raw payment bodies are rejected before Visa');
 const added=await post('/api/cards',{testCard:'visa-1111',consent:true});assert.ok([200,201].includes(added.status),added.raw);
 const creationCalls=(await f.log()).slice(beforeInvalid);
 assert.deepEqual(creationCalls.map(call=>[call.method,call.path]),[['POST','/tms/v1/instrumentidentifiers'],['POST','/tms/v1/paymentinstruments']],'adding a card creates TMS references without a payment authorization');
 assert.deepEqual((await f.request('/api/state')).data.carts,[],'adding a card does not create a cart commitment');
 let cards=await f.request('/api/cards');assert.equal(cards.status,200);assert.equal(cards.data.cards.length,1);
 const saved=cards.data.cards[0];assert.equal(saved.last4,'1111');assert.match(saved.id,/^[a-f0-9-]{36}$/);
 assert.deepEqual(added.data.card,saved);assert.deepEqual(added.data.cards,[saved]);
 assert.deepEqual(Object.keys(saved).sort(),['id','brand','last4','expirationMonth','expirationYear'].sort());
 const beforeRepeat=(await f.log()).length,repeated=await post('/api/cards',{testCard:'visa-1111',consent:true});assert.ok([200,201].includes(repeated.status),repeated.raw);assert.deepEqual(repeated.data.card,saved);
 assert.equal((await f.log()).length,beforeRepeat,'adding an already-saved card does not create another provider token');
 const flow=(await post('/api/card-flow',draft)).data.flow;assert.match(flow,/^[a-f0-9]{64}$/);
 const beforeHold=(await f.log()).length,committed=await post('/api/commit-saved-card',{flow,cardId:saved.id});
 assert.equal(committed.status,200,committed.raw);assert.equal(committed.data.cart.status,'authorized');assert.equal(committed.data.cart.amount,1988);assert.equal(committed.data.cart.verification.cardDeduplicated,true);
 const holdCalls=(await f.log()).slice(beforeHold);assert.equal(holdCalls.length,1);assert.equal(holdCalls[0].path,'/pts/v2/payments');assert.equal(holdCalls[0].paymentKind,'stored');
 assert.deepEqual((await f.request('/api/cards',{owner:'b'})).data.cards,[]);
 assert.equal((await post('/api/cards/delete',{id:saved.id},{owner:'b'})).status,404);
 assert.equal((await post('/api/commit-saved-card',{flow,cardId:saved.id},{owner:'b'})).status,403);
 assert.equal((await post('/api/cards/delete',{id:saved.id},{requestOrigin:'https://attacker.example'})).status,403);
 assert.equal((await post('/api/cards/delete',{id:saved.id},{headers:{Host:'attacker.example'}})).status,403);
 const otherFlow=(await post('/api/card-flow',draft,{owner:'b'})).data.flow;
 const callsBefore=(await f.log()).length;
 assert.equal((await post('/api/commit-saved-card',{flow:otherFlow,cardId:saved.id},{owner:'b'})).status,404);
 assert.equal((await post('/api/commit-saved-card',{flow:otherFlow,cardId:'offline-pi-1'},{owner:'b'})).status,404);
 assert.equal((await f.log()).length,callsBefore,'cross-owner or injected provider IDs cannot reach Visa');
 const released=await post('/api/release',{id:committed.data.cart.id});assert.equal(released.data.cart.status,'released');
 const nextFlow=(await post('/api/card-flow',draft)).data.flow;
 const beforeReuse=(await f.log()).length;
 const reused=await post('/api/commit-saved-card',{flow:nextFlow,cardId:saved.id,items:[{...draft.items[0],price:'0.01'}],paymentInstrument:{id:'attacker-token'}});
 assert.equal(reused.status,200,reused.raw);assert.equal(reused.data.cart.status,'authorized');assert.equal(reused.data.cart.amount,1988,'saved-card spending uses the immutable flow draft');
 const reuseCalls=(await f.log()).slice(beforeReuse);assert.equal(reuseCalls.length,1);assert.equal(reuseCalls[0].paymentKind,'stored');assert.equal(reuseCalls[0].amount,'19.88');
 assert.equal((await post('/api/commit-saved-card',{flow:nextFlow,cardId:saved.id})).status,403,'a consumed flow cannot be replayed');
 assert.equal((await post('/api/release',{id:reused.data.cart.id})).data.cart.status,'released');
 const publicState=await f.request('/api/state');
 for(const secret of [card.number,'securityCode',billTo.email,billTo.address1,'offline-identifier','offline-pi-','privateDemandKey','instrumentIdentifierId','paymentInstrumentId'])assert.ok(!publicState.raw.includes(secret),'public state excludes '+secret);
 const stored=await readFile(join(f.state,'state.json'),'utf8');for(const secret of [card.number,billTo.email,billTo.address1,'offline-identifier','offline-pi-'])assert.ok(!stored.includes(secret),'cart persistence excludes private payment fields');
 for(const path of ['/card-vault/cards.enc','/.local/card-vault/vault.key','/.env'])assert.equal((await f.request(path)).status,404);
 assert.equal((await post('/api/cards/delete',{id:saved.id})).status,200);assert.deepEqual((await f.request('/api/cards')).data.cards,[]);
 const deletedFlow=(await post('/api/card-flow',draft)).data.flow;assert.equal((await post('/api/commit-saved-card',{flow:deletedFlow,cardId:saved.id})).status,404);
 const rawFlow=(await post('/api/card-flow',draft,{owner:'c'})).data.flow,beforeRaw=(await f.log()).length;
 const unsaved=await post('/api/commit-card',{flow:rawFlow,testCard:'visa-1111',saveCard:false,tokenizeCard:false},{owner:'c'});
 assert.equal(unsaved.status,200,unsaved.raw);assert.equal(unsaved.data.cart.status,'authorized');assert.deepEqual((await f.request('/api/cards',{owner:'c'})).data.cards,[]);
 const rawCalls=(await f.log()).slice(beforeRaw);assert.equal(rawCalls.length,1);assert.equal(rawCalls[0].paymentKind,'raw','no save consent means no TMS vault calls');
 assert.equal((await post('/api/release',{id:unsaved.data.cart.id},{owner:'c'})).data.cart.status,'released');
 for(const request of f.browserRequests.filter(request=>request.body&&request.status>=200&&request.status<300)){
  const encoded=JSON.stringify(request.body);
  assert.ok(!encoded.includes(card.number),'successful browser requests never contain the test PAN');
  assert.ok(!/"(?:card|billTo|securityCode|number)"\s*:/.test(encoded),'successful browser requests never contain raw payment or billing fields');
 }
 assert.ok((await f.log()).every(call=>!call.unexpected),'all provider traffic stayed inside the offline fixture');
});
