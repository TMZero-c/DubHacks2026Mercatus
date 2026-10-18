import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGeminiSearch,extractOffersJson,normalizeGemini,usdCents} from './gemini-search.mjs';

const query='Sony WH-1000XM5 Black';
const payload={candidates:[{content:{parts:[{text:'```json\n[{"merchant":"Best Buy","title":"Sony WH-1000XM5 Black Wireless Headphones","price":"$328.00","url":"https://www.bestbuy.com/site/xm5"},{"merchant":"Walmart","title":"Sony WH-1000XM5 Black","price":"299.99","url":"https://www.walmart.com/ip/xm5"},{"merchant":"Ebay","title":"Sony WH-1000XM5 Black used","price":"120.00","url":"https://ebay.example/used","condition":"used"},{"merchant":"Google","title":"Sony WH-1000XM5 Black","price":"10.00","url":"https://www.google.com/search?q=xm5"},{"merchant":"Local","title":"Sony WH-1000XM5 Black","price":"90.00","url":"http://127.0.0.1/secret"},{"merchant":"Target","title":"Sony WH-1000XM4 Black","price":"250.00","url":"https://www.target.com/p/xm4"}]\n```'}]}}]};
const result=normalizeGemini(payload,query);
assert.deepEqual(result.offers.map(offer=>[offer.merchant,offer.price]),[['Walmart',29999],['Best Buy',32800]]);
assert.equal(result.provider,'Gemini · Google Search');
assert.equal(usdCents('1,299.50'),129950);
assert.equal(usdCents('€30'),null);
assert.deepEqual(extractOffersJson('no listings'),[]);
assert.equal(normalizeGemini({candidates:[{content:{parts:[{text:'not json'}]}}]},query).offers.length,0);
assert.equal(normalizeGemini({candidates:[{content:{parts:[{text:'{broken'}]}}]},query).offers.length,0);
console.log('PASS: Gemini listings keep priced new matches and drop used, wrong model, search pages, and unsafe links.');

const search=createGeminiSearch({apiKey:'secret-key',model:'gemini-3.8-flash',fetcher:async(url,init)=>{
 assert.equal(new URL(url).search,'');
 assert.equal(init.headers['x-goog-api-key'],'secret-key');
 assert.deepEqual(JSON.parse(init.body).tools,[{google_search:{}}]);
 assert.match(url,/models\/gemini-3\.8-flash:generateContent$/);
 return{ok:true,json:async()=>payload};
}});
const found=await search({query});
assert.equal(found.cached,false);
assert.equal(found.offers.length,2);
assert.equal((await search({query:'  '+query+'  '})).cached,true);
await assert.rejects(createGeminiSearch({apiKey:''})({query}),/GEMINI_API_KEY/);
await assert.rejects(createGeminiSearch({apiKey:'secret-key',fetcher:async()=>{throw new Error('secret-key leaked');}})({query:'Sony case black'}),error=>!error.message.includes('secret-key'));
console.log('PASS: Gemini key stays in the request header, repeats use cache, and provider failures hide the key.');

const dir=mkdtempSync(join(tmpdir(),'later-gemini-'));
try{
 let requests=0;
 const config={apiKey:'secret-key',cacheFile:join(dir,'cache.json'),fetcher:async()=>{requests++;return{ok:true,json:async()=>payload};}};
 await createGeminiSearch(config)({query});
 const reloaded=await createGeminiSearch(config)({query:'sony wh-1000xm5 black'});
 assert.equal(reloaded.cached,true);
 assert.equal(requests,1);
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('PASS: Gemini search cache survives a restart.');
