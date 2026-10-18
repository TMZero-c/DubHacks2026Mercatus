import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {authenticated,originAllowed,readJSON,send} from '../hosted/auth.js';
import {execute,hostedTools} from '../hosted/service.js';
export const config={maxDuration:60};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!originAllowed(req))return send(res,403,{error:'Untrusted request origin'});
 if(!authenticated(req))return send(res,401,{error:'Workspace access key required'},{'WWW-Authenticate':'Bearer realm="later-merchant"'});
 if(req.method!=='POST')return send(res,405,{error:'Use Streamable HTTP POST. This stateless server has no standalone SSE stream.'},{Allow:'POST'});
 const server=new Server({name:'later-merchant',version:'1.1.0'},{capabilities:{tools:{}},instructions:'Authenticated merchant workspace. Only confirmed Visa sandbox authorizations qualify as intents. No synthetic-intent or payment tool is available. Create paused campaigns with provided inventory, preview, then activate only within merchant instructions.'});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:hostedTools}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{try{const result=await execute(request.params.name,request.params.arguments||{});return{content:[{type:'text',text:JSON.stringify(result)}],isError:false};}catch(e){return{content:[{type:'text',text:e.message}],isError:true};}});
 const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});res.on('close',()=>{transport.close();server.close();});
 try{await server.connect(transport);await transport.handleRequest(req,res,await readJSON(req));}catch{if(!res.headersSent)send(res,400,{error:'Invalid MCP request'});}
}
