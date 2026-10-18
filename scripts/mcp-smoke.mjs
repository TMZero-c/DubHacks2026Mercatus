import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2],keyFile=process.argv[3]||'.local/access-key';if(!base)throw new Error('Usage: node scripts/mcp-smoke.mjs https://project.vercel.app [local-key-file]');
const key=(await readFile(keyFile,'utf8')).trim(),client=new Client({name:'later-deployment-check',version:'1.0.0'}),transport=new StreamableHTTPClientTransport(new URL('/mcp',base),{requestInit:{headers:{Authorization:'Bearer '+key}}});
async function call(name,args={}){const result=await client.callTool({name,arguments:args});if(result.isError)throw new Error(name+': '+result.content?.[0]?.text);return JSON.parse(result.content[0].text);}
try{
 const denied=await fetch(new URL('/mcp',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(denied.status,401);
 await client.connect(transport);const list=await client.listTools();assert.equal(list.tools.length,7);
 for(const c of (await call('merchant_overview')).campaigns)if(c.name==='MCP test · Headphones'&&c.status==='active')await call('merchant_update_campaign',{id:c.id,status:'paused'});
 const nonce=Date.now().toString();const input={requestId:'smoke-campaign-'+nonce,name:'MCP test · Headphones',merchant:'Demo Electronics · '+nonce,dailyBudget:'100',maxIncentive:'20',minMarginPct:20,discountPct:15,strategy:'fixed_discount',deliveryDays:2,offerMinutes:60,returns:'30-day returns',sellerRules:['Authorized retailers only'],inventoryAttested:true,products:[{name:'Wireless headphones',variant:'Demo model · black · new',unitPrice:'150',cost:'95',stock:2},{name:'Protective carrying case',variant:'Demo model · black · standard',unitPrice:'30',cost:'12',stock:2}]};
 const created=await call('merchant_create_campaign',input);assert.equal(created.campaign.status,'paused');const id=created.campaign.id;
 assert.equal((await call('merchant_create_campaign',input)).campaign.id,id);
 await call('merchant_preview',{campaignId:id});await call('merchant_update_campaign',{id,status:'active'});
 const intent=await call('merchant_add_test_intent',{requestId:'smoke-intent-'+nonce,items:[{name:'Wireless headphones',variant:'Demo model · black · new',price:'150.00',quantity:1},{name:'Protective carrying case',variant:'Demo model · black · standard',price:'30.00',quantity:1}]});assert.equal(intent.intent.synthetic,true);assert.equal(intent.intent.verification.environment,'synthetic-demo');assert.equal(intent.submitted,1);
 const overview=await call('merchant_overview');assert.ok(overview.decisions.some(d=>d.intentId===intent.intent.id&&d.amount<18000));const found=await call('merchant_intents');assert.ok(found.intents.some(c=>c.id===intent.intent.id));assert.equal((await call('merchant_run')).submitted,0);
 await call('merchant_update_campaign',{id,status:'paused'});
 const repeat=await call('merchant_overview');assert.ok(repeat.campaigns.some(c=>c.id===id&&c.status==='paused'));
 const headers={Authorization:'Bearer '+key};const a=await (await fetch(new URL('/api/merchant/state',base),{headers})).json();const b=await (await fetch(new URL('/api/merchant/state',base),{headers})).json();assert.ok(a.campaigns.some(c=>c.id===id));assert.ok(b.campaigns.some(c=>c.id===id));
 for(const path of ['/.env','/.env.local','/.local/access-key','/outputs/committed-cart/.env','/api/commit-test-card']){const response=await fetch(new URL(path,base),{headers});assert.ok(!response.ok,'Secret/payment path unexpectedly served: '+path);const body=await response.text();assert.ok(!body.includes(key));}
 console.log(JSON.stringify({ok:true,url:base,mcp:new URL('/mcp',base).href,tools:list.tools.map(t=>t.name),testOffer:'Created through live remote MCP; synthetic cart only',campaignId:id,campaignStatus:'paused',unauthenticated:'401',secretPaths:'not served',persistentReads:'passed'},null,2));
}finally{await client.close();}
