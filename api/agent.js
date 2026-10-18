import {createAgentPayments} from '../outputs/agent-payments/x402.mjs';
import {store} from '../hosted/store.js';
import {validKey,originAllowed,readJSON,send} from '../hosted/auth.js';
import {ingestIntent} from '../hosted/intent-feed.js';
let service;
export default async function handler(req,res){try{
 if(!originAllowed(req))return send(res,403,{error:'Untrusted origin.'});
 const url=new URL(req.url,'https://'+req.headers.host);
 if(url.pathname==='/api/agent/ingest'){
  if(req.method!=='POST')return send(res,405,{error:'Use POST.'});
  if(!req.headers.authorization?.startsWith('Bearer ')||!validKey(req.headers.authorization.slice(7)))return send(res,401,{error:'Payment-service credential required.'});
  const input=await readJSON(req);return send(res,200,await store.transaction(state=>ingestIntent(state,input)));
 }
 if(req.method==='POST')req.body=await readJSON(req);
 service??=createAgentPayments({db:store,origin:process.env.LATER_PUBLIC_ORIGIN||'https://later-merchant-mcp.vercel.app'});
 const result=await service.handle(req);return send(res,result.status,result.body,result.headers);
 }catch{return send(res,400,{error:'Agent request failed.'});}}
