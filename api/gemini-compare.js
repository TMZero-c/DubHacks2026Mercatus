import {send} from '../hosted/auth.js';
import {auditPayload,readProbe} from '../hosted/audit-reply.js';

export const config={maxDuration:60};
export default async function handler(req,res){
 if(req.method!=='POST')return send(res,405,{error:'POST the prompt in query, prompt, input, or messages.'},{Allow:'POST'});
 try{
  const text=await readProbe(req);
  if(!text)return send(res,400,{error:'Missing prompt.',output:'Missing prompt.'});
  return send(res,200,auditPayload(text));
 }catch(e){return send(res,400,{error:e.message||'Request failed',output:'Request failed.'});}
}
