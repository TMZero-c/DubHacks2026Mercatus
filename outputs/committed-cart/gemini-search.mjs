import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {matchCandidate,publicLink,validateSearch} from './shopping.mjs';

const endpoint='https://generativelanguage.googleapis.com/v1beta/models/';

export function usdCents(value){
 const cleaned=String(value??'').trim().replace(/\s/g,'').replace(/^US\$/i,'').replace(/^\$/,'');
 if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(cleaned))return null;
 const amount=Number(cleaned.replace(/,/g,''));
 if(!Number.isFinite(amount)||amount<=0||amount>100000)return null;
 return Math.round(amount*100);
}
export function extractOffersJson(text){
 const trimmed=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const arrayAt=trimmed.indexOf('['),objectAt=trimmed.indexOf('{');
 const start=arrayAt>=0&&(objectAt<0||arrayAt<objectAt)?arrayAt:objectAt;
 if(start<0)return [];
 const end=trimmed.lastIndexOf(start===arrayAt?']':'}');
 if(end<=start)return [];
 const parsed=JSON.parse(trimmed.slice(start,end+1));
 if(Array.isArray(parsed))return parsed;
 if(Array.isArray(parsed?.offers))return parsed.offers;
 return [];
}
function searchPage(href){const url=new URL(href);return /(?:^|\.)google\.[a-z.]+$/i.test(url.hostname)&&(url.pathname==='/search'||url.pathname.startsWith('/search/'));}
function modelName(value){const name=String(value||'gemini-3.8-flash');if(!/^gemini-[a-z0-9._-]{1,40}$/i.test(name))throw new Error('GEMINI_MODEL is not a Gemini model id.');return name;}
export function normalizeGemini(payload,query,now=new Date().toISOString()){
 const text=(payload?.candidates?.[0]?.content?.parts||[]).map(part=>part.text||'').join('\n');
 let rows=[];try{rows=extractOffersJson(text);}catch{rows=[];}
 const offers=[];const seen=new Set();let rejected=0;
 for(const row of rows){
  const title=String(row?.title||'').replace(/\s+/g,' ').trim();
  const merchant=String(row?.merchant||row?.store||'').replace(/\s+/g,' ').trim();
  const url=publicLink(row?.url||row?.link);
  const price=usdCents(row?.price);
  const condition=`${row?.condition||''} ${title}`;
  if(!title||!merchant||!url||!price||searchPage(url)||/\b(used|refurbished|renewed|preowned|pre-owned|open box)\b/i.test(condition)){rejected++;continue;}
  const match=matchCandidate(title,query);if(!match.accepted){rejected++;continue;}
  if(seen.has(url))continue;seen.add(url);
  offers.push({title:title.slice(0,300),merchant:merchant.slice(0,100),price,currency:'USD',url,delivery:'Shipping and tax not verified',match:'Gemini search candidate — confirm the exact variant and price on the store page',matchCoverage:match.coverage,checkedAt:now});
 }
 return{query,checkedAt:now,rejected,provider:'Gemini · Google Search',offers:offers.sort((a,b)=>a.price-b.price).slice(0,8),notice:'Other websites found by Gemini with Google Search. Listed prices can change and may omit tax or shipping. Confirm the variant before you buy.'};
}
export function createGeminiSearch({apiKey,model,fetcher=fetch,now=()=>Date.now(),cacheFile=null}){
 const cache=new Map(),pending=new Map();let windowStart=now(),calls=0;
 const file=cacheFile?(cacheFile instanceof URL?fileURLToPath(cacheFile):cacheFile):null;
 if(file){try{const saved=JSON.parse(readFileSync(file,'utf8'));if(saved.version===1){for(const [key,value]of saved.entries||[])if(now()-value.time<3600000)cache.set(key,value);windowStart=saved.windowStart||now();calls=saved.calls||0;}}catch{}}
 function persist(){if(!file)return;try{mkdirSync(dirname(file),{recursive:true,mode:0o700});for(const [key,value]of cache)if(now()-value.time>=3600000)cache.delete(key);while(cache.size>200)cache.delete(cache.keys().next().value);writeFileSync(file+'.tmp',JSON.stringify({version:1,windowStart,calls,entries:[...cache]}),{mode:0o600});renameSync(file+'.tmp',file);}catch{}}
 return async body=>{
  const query=validateSearch(body),key=query.toLowerCase();if(!apiKey)throw new Error('Other-store search is not configured. Add GEMINI_API_KEY to outputs/committed-cart/.env.');
  const previous=cache.get(key);if(previous&&now()-previous.time<3600000)return{...previous.result,cached:true};if(pending.has(key))return pending.get(key);
  if(now()-windowStart>=3600000){windowStart=now();calls=0;}if(calls>=20)throw new Error('Local Gemini search limit reached (20 per hour). Cached searches remain available.');calls++;persist();
  const name=modelName(model);
  const prompt=`Search Google for other US websites currently selling this exact new product and the price shown on each listing.\nProduct: ${query}\n\nReturn only a JSON array, no markdown. Each object has merchant, title, price, and url.\nprice is a USD number copied from the listing, never estimated.\nurl is the product page, not a Google search results page.\ntitle is the listing title and includes the brand, model, and any stated color or size.\nInclude at most 8 different stores. Omit used, refurbished, renewed, rental, auction, and listings without a price.\nIf none are found, return [].`;
  const job=(async()=>{try{
   const response=await fetcher(endpoint+name+':generateContent',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],tools:[{google_search:{}}]})});
   if(!response.ok)throw new Error('Provider request failed');
   const data=await response.json();if(data.error)throw new Error('Provider search error');
   const result=normalizeGemini(data,query,new Date(now()).toISOString());cache.set(key,{result,time:now()});persist();return{...result,cached:false};
  }catch{throw new Error('Other-store search failed. Check the Gemini API key, quota, and model name, then try again. No payment was sent.');}finally{pending.delete(key);}})();
  pending.set(key,job);return job;
 };
}
