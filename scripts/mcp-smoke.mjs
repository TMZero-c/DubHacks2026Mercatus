import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2],keyFile=process.argv[3]||'.local/access-key';if(!base)throw new Error('Usage: node scripts/mcp-smoke.mjs https://project.vercel.app [local-key-file]');
const key=(await readFile(keyFile,'utf8')).trim(),client=new Client({name:'later-deployment-check',version:'1.0.0'}),transport=new StreamableHTTPClientTransport(new URL('/mcp',base),{requestInit:{headers:{Authorization:'Bearer '+key}}});
async function call(name,args={}){const result=await client.callTool({name,arguments:args});if(result.isError)throw new Error(name+': '+result.content?.[0]?.text);return JSON.parse(result.content[0].text);}
try{
 const denied=await fetch(new URL('/mcp',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(denied.status,401);
 await client.connect(transport);const list=await client.listTools();assert.equal(list.tools.length,6);
 const first=await call('merchant_overview');
 const intents=await call('merchant_intents');
 for(const intent of intents.intents){assert.equal(intent.verification.active,true);assert.match(intent.verification.authorizationId,/^\d{1,60}$/);assert.equal(intent.intentSource,'visa-acceptance-sandbox');}
 const headers={Authorization:'Bearer '+key};
 const a=await (await fetch(new URL('/api/merchant/state',base),{headers})).json();
 const b=await (await fetch(new URL('/api/merchant/state',base),{headers})).json();
 assert.equal(a.summary.offers,first.summary.offers);assert.equal(b.summary.offers,first.summary.offers);
 const removed=await fetch(new URL('/api/merchant/demo-intent',base),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});assert.equal(removed.status,404);
 for(const path of ['/.env','/.env.local','/.local/access-key','/outputs/committed-cart/.env','/api/commit-test-card']){const response=await fetch(new URL(path,base),{headers});assert.ok(!response.ok,'Secret/payment path unexpectedly served: '+path);const body=await response.text();assert.ok(!body.includes(key));}
 console.log(JSON.stringify({ok:true,url:base,mcp:new URL('/mcp',base).href,tools:list.tools.map(t=>t.name),intents:intents.intents.length,unauthenticated:'401',syntheticEndpoint:'removed',secretPaths:'not served',persistentReads:'passed',visaRequests:'none; this is a read-only deployment check'},null,2));
}finally{await client.close();}
