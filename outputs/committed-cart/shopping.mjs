import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export function validateSearch(body){
 const query=String(body.query||'').replace(/\s+/g,' ').trim();if(query.length<3||query.length>240)throw new Error('Use a product search from 3 to 240 characters.');
 return query;
}
export function publicLink(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname))return null;return u.href;}catch{return null}}
const noise=new Set(['the','and','for','with','from','new','only','asin','name','color','size','flavor','confirm','selected','variant','human','grade','all','natural','made','real','ingredients','adult','puppies','dogs','ages','sizes','breeds']);
function canonical(text){return String(text||'').toLowerCase().replace(/[’']/g,'').replace(/([a-z]+)-(?=\d)/g,'$1').replace(/(\d)-(?=[a-z])/g,'$1').replace(/\b[a-z][a-z0-9-]*\d[a-z0-9-]*\b/g,m=>m.replace(/-/g,'')).replace(/blueberries/g,'blueberry').replace(/strawberries/g,'strawberry');}
function words(text){return [...new Set(canonical(text).replace(/[^a-z0-9]+/g,' ').split(' ').filter(x=>x.length>1&&!noise.has(x)))];}
function specs(text){const units={ounces:'oz',ounce:'oz',oz:'oz',pounds:'lb',pound:'lb',lbs:'lb',lb:'lb',inches:'inch',inch:'inch',gb:'gb',tb:'tb',count:'count',ct:'count',pack:'pack',ml:'ml',kg:'kg',g:'g'};return [...canonical(text).matchAll(/(\d+(?:\.\d+)?)\s*(ounces|ounce|oz|pounds|pound|lbs|lb|inches|inch|gb|tb|count|ct|pack|ml|kg|g)\b/g)].map(m=>m[1]+units[m[2]]);}
export function matchCandidate(title,query){
 const desired=words(query),actual=words(title),normalized=canonical(title).replace(/[^a-z0-9]/g,'');
 if(!desired.length)return{accepted:false,reason:'No product identifiers'};
 const models=desired.filter(x=>/[a-z]/.test(x)&&/\d/.test(x));
 if(models.some(x=>!actual.includes(x)))return{accepted:false,reason:'Model identifier missing or different'};
 if(desired.filter(x=>/^\d+$/.test(x)).some(x=>!actual.includes(x)))return{accepted:false,reason:'Model number or quantity differs'};
 const colors=['black','white','blue','red','green','pink','purple','silver','gold','orange','gray','grey','beige'];
 if(desired.filter(x=>colors.includes(x)).some(x=>!actual.includes(x)))return{accepted:false,reason:'Color missing or different'};
 if(specs(query).some(x=>!specs(title).includes(x)))return{accepted:false,reason:'Size, capacity or pack count missing or different'};
 // The leading substantive term is treated as a brand/product anchor, never silently dropped.
 if(!actual.includes(desired[0]))return{accepted:false,reason:'Brand or leading product identifier missing'};
 const coverage=desired.filter(x=>actual.includes(x)||models.includes(x)&&normalized.includes(x)).length/desired.length;
 return{accepted:coverage>=0.85,coverage,reason:coverage>=0.85?'Strict text candidate; variant still needs confirmation':'Product description mismatch'};
}
export function closeCandidate(title,query){return matchCandidate(title,query).accepted;}
export function normalizeShopping(data,query,now=new Date().toISOString()){
 const rows=[...(data.shopping_results||[]),...(data.inline_shopping_results||[])];const seen=new Set();const offers=[];let rejected=0;
 for(const row of rows){
  if(!/^(?:amazon(?:\.com)?|walmart|target|best buy|bestbuy|newegg(?:\.com)?|ebay|sony|apple|b&h|adorama|costco|sam'?s club|the home depot|home depot|lowe'?s|nordstrom|macy'?s|dick'?s sporting goods|rei|chewy|petco|petsmart|the farmer'?s dog)(?:$|[\s.·-])/i.test(String(row.source||''))){rejected++;continue;}
  const match=matchCandidate(row.title,query);if(!match.accepted){rejected++;continue;}
  if(row.installment||row.second_hand_condition||/\b(used|refurbished|renewed|preowned|pre-owned)\b/i.test(String(row.title)))continue;
  const price=Number(row.extracted_price),url=publicLink(row.product_link||row.link);
  if(!Number.isFinite(price)||price<=0||!url||!/^\s*(?:US\s*)?\$/.test(String(row.price||'')))continue;
  const id=String(row.product_id||url);if(seen.has(id))continue;seen.add(id);
  offers.push({id,title:String(row.title||'Product listing').slice(0,300),merchant:String(row.source||'Store not specified').slice(0,100),price:Math.round(price*100),currency:'USD',delivery:String(row.delivery||'Delivery cost not provided').slice(0,240),shippingIncluded:/\bfree\s+(shipping|delivery)\b/i.test(String(row.delivery||'')),url,match:'Strict text candidate — confirm exact variant, pack size and condition',matchCoverage:match.coverage,checkedAt:now});
 }
 return{query,checkedAt:now,rejected,matching:'Recognized store names only; merchant identity remains unverified. Strict: brand anchor, model, stated specifications and ≥85% descriptive coverage',provider:'SerpApi · Google Shopping',offers:offers.sort((a,b)=>a.price-b.price).slice(0,12),notice:'Search candidates, not verified exact matches. Prices can change. Tax, delivery, membership pricing and checkout availability may differ.'};
}
export function createShoppingSearch({apiKey,fetcher=fetch,now=()=>Date.now(),cacheFile=null}){
 const cache=new Map(),pending=new Map();let windowStart=now(),calls=0;
 const file=cacheFile?(cacheFile instanceof URL?fileURLToPath(cacheFile):cacheFile):null;
 if(file){try{const saved=JSON.parse(readFileSync(file,'utf8'));if(saved.version===3){for(const [key,value]of saved.entries||[])if(now()-value.time<3600000)cache.set(key,value);windowStart=saved.windowStart||now();calls=saved.calls||0;}}catch{}}
 function persist(){if(!file)return;try{mkdirSync(dirname(file),{recursive:true,mode:0o700});for(const [key,value]of cache)if(now()-value.time>=3600000)cache.delete(key);while(cache.size>200)cache.delete(cache.keys().next().value);writeFileSync(file+'.tmp',JSON.stringify({version:3,windowStart,calls,entries:[...cache]}),{mode:0o600});renameSync(file+'.tmp',file);}catch{}}

 const search=async body=>{
  const query=validateSearch(body),key=query.toLowerCase();if(!apiKey)throw new Error('Price comparison is not configured. Add SERPAPI_API_KEY to the backend .env.');
  const previous=cache.get(key);if(previous&&now()-previous.time<3600000)return{...previous.result,cached:true};if(pending.has(key))return pending.get(key);
  if(now()-windowStart>=3600000){windowStart=now();calls=0;}if(calls>=20)throw new Error('Local demo search limit reached (20 per hour). Cached searches remain available.');calls++;persist();
  const job=(async()=>{try{const url=new URL('https://serpapi.com/search.json');url.search=new URLSearchParams({engine:'google_shopping',q:query,gl:'us',hl:'en',api_key:apiKey}).toString();const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('Provider request failed');const data=await response.json();if(data.error)throw new Error('Provider search error');const result=normalizeShopping(data,query,new Date(now()).toISOString());cache.set(key,{result,time:now()});persist();return{...result,cached:false};}catch{throw new Error('Price search failed. Check SerpApi quota and account status, then try again. No payment was sent.');}finally{pending.delete(key)}})();pending.set(key,job);return job;
 };
 // Read-only bridge for assistant context after a server restart. Public cached
 // listings need no provider call, active credential or quota consumption.
 search.peek=body=>{
  let query;try{query=validateSearch(body);}catch{return null;}
  const previous=cache.get(query.toLowerCase()),age=previous?now()-previous.time:NaN;
  if(!previous||!Number.isFinite(age)||age<0||age>=3600000||!previous.result)return null;
  return structuredClone({...previous.result,cached:true});
 };
 return search;
}
