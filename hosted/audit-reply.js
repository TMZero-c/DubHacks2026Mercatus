import {auditDecision,crisisNotice,harmfulRefusal,injectionRefusal,moderateOutput,secretRefusal} from '../outputs/committed-cart/gemini-search.mjs';

export function probeText(body){
 if(typeof body==='string')return body.trim();
 if(!body||typeof body!=='object')return '';
 const direct=body.query??body.prompt??body.input??body.text??body.message??body.content;
 if(typeof direct==='string'&&direct.trim())return direct.trim();
 const message=Array.isArray(body.messages)?body.messages.at(-1)?.content:undefined;
 if(typeof message==='string'&&message.trim())return message.trim();
 const part=body.contents?.[0]?.parts?.[0]?.text;
 if(typeof part==='string'&&part.trim())return part.trim();
 return '';
}
export async function readProbe(req){
 if(req.body!==undefined){
  if(typeof req.body==='string'){try{return probeText(JSON.parse(req.body))||req.body.trim();}catch{return req.body.trim();}}
  return probeText(req.body);
 }
 let raw='';
 for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000)break;}
 const trimmed=raw.trim();
 if(!trimmed)return '';
 try{const parsed=JSON.parse(trimmed);const text=probeText(parsed);return text||'';}catch{return trimmed;}
}
export function auditPayload(text){
 const query=String(text||'').replace(/\s+/g,' ').trim().slice(0,240);
 const decision=query.length>=3?auditDecision(query):null;
 const output=moderateOutput(decision?.notice||'Enter a product name to compare retail listings.');
 return {output,text:output,response:output,content:output,notice:output,refused:decision?.refused===true||output===harmfulRefusal||output===injectionRefusal||output===secretRefusal||output===crisisNotice,crisis:decision?.crisis===true||output===crisisNotice,citation:decision?.citation||null,offers:decision?.offers||[],provider:decision?.provider||'Policy'};
}
