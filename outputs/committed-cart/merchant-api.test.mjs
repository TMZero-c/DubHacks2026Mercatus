import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {validateCart} from './engine.mjs';
const root=dirname(fileURLToPath(import.meta.url)),dir=await mkdtemp(join(tmpdir(),'later-merchant-qa-')),port=4326,base='http://127.0.0.1:'+port,env={...process.env,LATER_STATE_DIR:dir,LATER_PORT:String(port),MONGODB_URI:''};
const cookie='a'.repeat(64),now=Date.now();const cart=validateCart({items:[{name:'Test headphones',variant:'Black · New',price:'150',quantity:1}],hours:12,sellers:'Authorized retailers only',deliveryDate:new Date(now+7*86400000).toISOString().slice(0,10),publish:true,consent:true},now);Object.assign(cart,{status:'authorized',visaStatus:'AUTHORIZED',authorizationId:'123',authorizedAmount:15000,offers:[],owner:createHash('sha256').update(cookie).digest('hex')});await writeFile(join(dir,'state.json'),JSON.stringify({[cart.id]:cart}),{mode:0o600});
let server,logs='';function start(){server=spawn(process.execPath,[join(root,'server.mjs')],{env,stdio:['ignore','pipe','pipe']});server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);return server;}
async function ready(){for(let i=0;i<80;i++){try{if((await fetch(base+'/api/state')).ok)return;}catch{}if(server.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}throw new Error('Local test server did not start. '+logs);}
async function stop(){if(server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}}
const payload={name:'QA · automatic headphones',merchant:'QA store',dailyBudget:'20',maxIncentive:'10',minMarginPct:20,discountPct:15,strategy:'fixed_discount',deliveryDays:2,offerMinutes:60,returns:'30-day returns',sellerRules:['Authorized retailers only'],inventoryAttested:true,products:[{name:'Test headphones',variant:'Black · New',unitPrice:'150',cost:'90',stock:2}],requestId:'qa-campaign'};
async function req(path,body,headers={}){const r=await fetch(base+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json',Origin:base,...headers}});return{status:r.status,data:await r.json()};}
let bridge;try{
 start();await ready();
 const flowInput={items:[{name:'Real entry only',variant:'Exact variant',price:'25',quantity:1}],hours:1,sellers:'Authorized retailers only',deliveryDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),publish:true,consent:true};
 const flowResponse=await req('/api/card-flow',flowInput);assert.equal(flowResponse.status,200);assert.match(flowResponse.data.flow,/^[a-f0-9]{64}$/);
 assert.equal((await req('/api/card-flow-info',{}, {'X-Later-Card-Flow':flowResponse.data.flow})).status,403,'Only the card page origin can consume a flow');
 const details=await req('/api/card-flow-info',{}, {Origin:'http://localhost:'+port,'X-Later-Card-Flow':flowResponse.data.flow});assert.equal(details.status,200);assert.equal(details.data.amount,2500);
 assert.equal((await req('/api/card-flow-info',{}, {Origin:'http://localhost:'+port,'X-Later-Card-Flow':'bad'})).status,403);
 const extensionOrigin='chrome-extension://kahjaomahjnhcppboeagnjclfbnjgjje',nativeCookie='cart_session='+'b'.repeat(64);
 assert.equal((await req('/api/card-flow',flowInput,{Origin:extensionOrigin,Cookie:nativeCookie})).status,503,'The extension requires MongoDB sign-in');
 assert.equal((await req('/api/commit-card',{flow:'none'},{Origin:extensionOrigin,Cookie:nativeCookie})).status,503);
 assert.equal((await req('/api/commit-test-card',flowInput)).status,404);
 const noBilling=await req('/api/commit',{...flowInput,cardToken:'not-a-token'},{Origin:'http://localhost:'+port,'X-Later-Card-Flow':flowResponse.data.flow});assert.ok([400,503].includes(noBilling.status));assert.match(noBilling.data.error,/billing|credentials/);
 assert.equal((await req('/api/state')).data.carts.length,0,'No Visa success or cart is fabricated on incomplete card entry');
assert.equal((await req('/api/merchant/state')).data.campaigns.length,0);assert.equal((await req('/api/merchant/campaigns',payload,{Origin:'https://evil.example'})).status,403);
 assert.equal((await req('/api/merchant/state',null,{Authorization:'Bearer wrong'})).status,401);
 const preview=await req('/api/merchant/preview',payload);assert.equal(preview.data.eligible,1);assert.equal((await req('/api/merchant/state')).data.decisions.length,0);
 const made=await req('/api/merchant/campaigns',payload);assert.equal(made.status,201);const id=made.data.campaign.id;assert.equal(made.data.campaign.status,'paused');assert.equal((await req('/api/merchant/campaigns',payload)).data.campaign.id,id);
 assert.equal((await req('/api/merchant/update',{id,status:'active'})).status,200);
 const state=(await req('/api/merchant/state')).data;assert.equal(state.summary.offers,1);assert.equal(state.summary.reservedCents,1000);assert.equal((await req('/api/merchant/run',{})).data.submitted,0);
 const shopper=(await req('/api/state',null,{Cookie:'cart_session='+cookie})).data;assert.equal(shopper.carts[0].offers[0].amount,14000);assert.equal(shopper.carts[0].offers[0].source,'merchant-agent');
 assert.equal((await req('/api/select',{intentId:cart.id,offerId:shopper.carts[0].offers[0].id,approved:true},{Cookie:'cart_session='+cookie})).status,200);assert.equal((await req('/api/merchant/state')).data.summary.selections,1);
 assert.equal((await stat(join(dir,'mcp-key'))).mode&0o777,0o600);
 bridge=spawn(process.execPath,[join(root,'merchant-mcp.mjs')],{env,stdio:['pipe','pipe','pipe']});let buf='',pending=new Map();bridge.stdout.on('data',x=>{buf+=x;let at;while((at=buf.indexOf('\n'))>=0){const line=buf.slice(0,at);buf=buf.slice(at+1);const msg=JSON.parse(line);pending.get(msg.id)?.(msg);pending.delete(msg.id);}});let seq=0;function rpc(method,params){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('MCP timed out: '+method)),5000);pending.set(id,r=>{clearTimeout(timer);resolve(r);});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
 assert.equal((await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'QA',version:'1'}})).result.serverInfo.name,'later-merchant');bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');assert.equal((await rpc('tools/list')).result.tools.length,6);
 const overview=await rpc('tools/call',{name:'merchant_overview',arguments:{}});assert.equal(overview.result.isError,false);assert.equal(JSON.parse(overview.result.content[0].text).summary.offers,1);
 const paused=await rpc('tools/call',{name:'merchant_update_campaign',arguments:{id,status:'paused'}});assert.equal(paused.result.isError,false);assert.equal((await req('/api/merchant/state')).data.campaigns[0].status,'paused');
 const mc=await rpc('tools/call',{name:'merchant_create_campaign',arguments:{...payload,name:'MCP campaign',requestId:'mcp-create'}});assert.equal(mc.result.isError,false);assert.equal(JSON.parse(mc.result.content[0].text).campaign.status,'paused');
 assert.equal((await rpc('tools/call',{name:'merchant_update_campaign',arguments:{id:'does-not-exist',status:'active'}})).result.isError,true);
 const toolIntents=await rpc('tools/call',{name:'merchant_intents',arguments:{}});assert.equal(toolIntents.result.isError,false);assert.equal(JSON.parse(toolIntents.result.content[0].text).intents.length,0);
 const toolPreview=await rpc('tools/call',{name:'merchant_preview',arguments:{campaignId:id}});assert.equal(toolPreview.result.isError,false);assert.equal(JSON.parse(toolPreview.result.content[0].text).total,0);
 assert.equal((await rpc('tools/call',{name:'merchant_run',arguments:{}})).result.isError,false);
 const connection=(await req('/api/merchant/connection')).data;assert.ok(connection.config.mcpServers['later-merchant'].args[0].endsWith('merchant-mcp.mjs'));assert.ok(!JSON.stringify(connection).includes((await readFile(join(dir,'mcp-key'),'utf8')).trim()));
 await stop();start();await ready();const restored=(await req('/api/merchant/state')).data;assert.equal(restored.campaigns.length,2);assert.equal(restored.summary.offers,1);assert.equal(restored.summary.selections,1);assert.equal((await req('/api/merchant/run',{})).data.submitted,0);const disk=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));assert.equal(disk.format,2);assert.equal(disk.carts[cart.id].offers.length,1);
 console.log('Isolated HTTP + MCP workflow passed: migration, preview, paused creation, activation, automatic shopper offer, selection analytics, deduplication, access guards, MCP tools, and restart persistence. No Visa requests made.');
}finally{bridge?.kill();await stop();}
