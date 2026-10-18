#!/usr/bin/env node
// Newline-delimited stdio MCP. stdout is reserved for JSON-RPC messages.
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
const stateDir=process.env.LATER_STATE_DIR?new URL('file://'+process.env.LATER_STATE_DIR.replace(/\/$/,'')+'/'):new URL('.local/',import.meta.url);
import {merchantTools as tools,merchantRoutes as routes} from './merchant-tools.mjs';
async function call(name,args){if(!routes[name])throw new Error('Unknown tool');const key=(await readFile(new URL('mcp-key',stateDir),'utf8')).trim();const [method,path]=routes[name];const response=await fetch(`http://127.0.0.1:${Number(process.env.LATER_PORT||4318)}/api/merchant/${path}`,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(args)}:{}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Merchant request failed');return data;}
async function handle(message){const {id,method,params}=message;if(id===undefined)return;
 if(method==='initialize')return{jsonrpc:'2.0',id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'later-merchant',version:'1.0.0'},instructions:'Local merchant campaign manager. Create paused, preview, then activate only within the merchant’s instructions. Never infer seller eligibility or inventory. No purchases, card holds, capture or settlement tools are exposed.'}};
 if(method==='ping')return{jsonrpc:'2.0',id,result:{}};
 if(method==='tools/list')return{jsonrpc:'2.0',id,result:{tools}};
 if(method==='tools/call'){try{const data=await call(params?.name,params?.arguments||{});return{jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(data)}],isError:false}};}catch(e){return{jsonrpc:'2.0',id,result:{content:[{type:'text',text:e.code==='ENOENT'?'Start the Later local server before connecting MCP.':e.message}],isError:true}};}}
 return{jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}};
}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});let queue=Promise.resolve();lines.on('line',line=>{queue=queue.then(async()=>{let message;try{message=JSON.parse(line);}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');return;}const response=await handle(message);if(response)process.stdout.write(JSON.stringify(response)+'\n');}).catch(()=>process.stderr.write('MCP request failed.\n'));});
