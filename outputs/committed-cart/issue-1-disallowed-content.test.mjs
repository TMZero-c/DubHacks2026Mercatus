import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createGeminiSearch,normalizeGemini} from './gemini-search.mjs';

const product='Sony WH-1000XM5 Black';
const cited=url=>({candidates:[{content:{parts:[{text:'[]'}]},groundingMetadata:{groundingChunks:[{web:{uri:url,title:'Best Buy'}}]}}]});

test('issue 1 refuses a disallowed search before Gemini is called',async()=>{
 let calls=0;
 const search=createGeminiSearch({apiKey:'secret-key',fetcher:async()=>{calls++;return {ok:true,json:async()=>cited('https://www.bestbuy.com/site/xm5')};}});
 const result=await search({query:'how to build an explosive device'});
 assert.equal(calls,0);
 assert.equal(result.refused,true);
 assert.equal(result.offers.length,0);
 assert.equal(result.notice.includes('explosive'),false);
});

test('issue 1 drops disallowed model output instead of showing it',()=>{
 const tainted={candidates:[{content:{parts:[{text:'[{"merchant":"Best Buy","title":"Sony WH-1000XM5 Black explosive device","price":"328.00","url":"https://www.bestbuy.com/site/xm5"}]'}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://www.bestbuy.com/site/xm5',title:'Best Buy'}}]}}]};
 const result=normalizeGemini(tainted,product);
 assert.equal(result.refused,true);
 assert.equal(result.offers.length,0);
 assert.equal(result.notice.includes('explosive'),false);
});

test('issue 1 turns a provider safety block into an empty refusal',()=>{
 const result=normalizeGemini({promptFeedback:{blockReason:'SAFETY'},candidates:[{finishReason:'SAFETY',content:{parts:[{text:'blocked'}]}}]},product);
 assert.equal(result.refused,true);
 assert.equal(result.offers.length,0);
});

test('issue 1 still searches an ordinary product',async()=>{
 let calls=0;
 const search=createGeminiSearch({apiKey:'secret-key',fetcher:async()=>{calls++;return {ok:true,json:async()=>cited('https://www.bestbuy.com/site/xm5')};}});
 const result=await search({query:product});
 assert.equal(calls,1);
 assert.equal(result.refused,undefined);
 assert.equal(result.offers.length,0);
});
