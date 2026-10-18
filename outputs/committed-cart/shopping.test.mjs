import assert from 'node:assert/strict';import{normalizeShopping,validateSearch,createShoppingSearch,publicLink,matchCandidate}from'./shopping.mjs';
const fixture={shopping_results:[{title:'Headphones black',source:'Best Buy',price:'$90.00',extracted_price:90,product_link:'https://shop.example/item',delivery:'Free shipping'},{title:'Monthly',price:'$4',extracted_price:4,installment:{},link:'https://shop.example/monthly'},{title:'Used headphones',price:'$40',extracted_price:40,link:'https://shop.example/used'},{title:'Euro',price:'€30',extracted_price:30,link:'https://shop.example/euro'},{title:'Bad link',price:'$1',extracted_price:1,link:'javascript:alert(1)'}]};const result=normalizeShopping(fixture,'headphones');assert.equal(result.offers.length,1);assert.equal(result.offers[0].price,9000);assert.equal(result.offers[0].shippingIncluded,true);assert.match(result.offers[0].match,/Strict text/);assert.equal(publicLink('http://127.0.0.1/'),null);assert.equal(publicLink('https://user:pass@example.com'),null);assert.throws(()=>validateSearch({query:'x'}));let calls=0;const search=createShoppingSearch({apiKey:'test',fetcher:async(url)=>{calls++;assert.equal(url.hostname,'serpapi.com');return{ok:true,json:async()=>fixture}}});await Promise.all([search({query:'headphones'}),search({query:'headphones'})]);assert.equal(calls,1);assert.equal((await search({query:'headphones'})).cached,true);const failed=createShoppingSearch({apiKey:'private-test',fetcher:async()=>{throw new Error('private-test')}});await assert.rejects(failed({query:'headphones'}),e=>!e.message.includes('private-test'));console.log('PASS: USD normalization, installment/used exclusion, unsafe links, input limits, cache/deduplication and safe provider errors.');

assert.equal(matchCandidate('Glaciers Goodies Blueberry Goat Milk Dog Treats',"The Farmer's Dog Crunchy Dog Biscuits Goat Milk Blueberries").accepted,false);
assert.equal(matchCandidate('Sony WH-1000XM4 Black','Sony WH-1000XM5 Black').accepted,false);
assert.equal(matchCandidate('Sony WH-1000XM5 Silver','Sony WH-1000XM5 Black').accepted,false);
assert.equal(matchCandidate('Sony WH-1000XM5 Black Wireless Headphones','Sony WH-1000XM5 Black').accepted,true);
assert.equal(matchCandidate('Apple iPhone 16 128GB Black','Apple iPhone 16 256GB Black').accepted,false);
assert.equal(matchCandidate('Acme Biscuits 5 oz','Acme Biscuits 10 oz').accepted,false);
console.log('PASS: wrong brand/model/color/storage/pack-size rejected; matching model accepted.');

const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'later-cache-'));try{let requests=0;const config={apiKey:'test',cacheFile:join(dir,'cache.json'),fetcher:async()=>{requests++;return{ok:true,json:async()=>fixture}}};await createShoppingSearch(config)({query:'headphones'});const reloaded=await createShoppingSearch(config)({query:'  HEADPHONES  '});assert.equal(reloaded.cached,true);assert.equal(requests,1);console.log('PASS: cache survives server restart and normalized repeated search makes no provider request.');}finally{rmSync(dir,{recursive:true,force:true});}

assert.equal(matchCandidate('Sony WHCH520 Wireless Headphones Black','Sony WH-CH520 Black').accepted,true);

const peekDirectory=mkdtempSync(join(tmpdir(),'later-shopping-peek-'));
try{
 let time=Date.parse('2026-10-18T15:00:00Z'),requests=0;
 const config={apiKey:'offline-peek-key',cacheFile:join(peekDirectory,'cache.json'),now:()=>time,fetcher:async()=>{requests++;return{ok:true,json:async()=>fixture};}};
 const first=createShoppingSearch(config);
 assert.equal(first.peek({query:'headphones'}),null);assert.equal(first.peek({query:'x'}),null);assert.equal(first.peek(),null);assert.equal(requests,0);
 await first({query:'headphones'});
 const reloaded=createShoppingSearch(config),cached=reloaded.peek({query:'  HEADPHONES  '});
 assert.equal(cached.cached,true);assert.equal(cached.offers[0].price,9000);assert.equal(requests,1,'restart peek makes no provider request');
 cached.offers[0].price=1;assert.equal(reloaded.peek({query:'headphones'}).offers[0].price,9000,'peek returns an independent clone');
 for(let index=0;index<30;index++)assert.equal(reloaded.peek({query:'headphones'}).offers.length,1);
 for(let index=0;index<19;index++)await reloaded({query:'headphones '+index});
 assert.equal(requests,20,'peeking never consumes provider-call quota');
 await assert.rejects(reloaded({query:'headphones extra'}),/20 per hour/);
 assert.equal(reloaded.peek({query:'headphones'}).offers[0].price,9000,'read-only cache stays available after quota exhaustion');
 const withoutKey=createShoppingSearch({...config,apiKey:''});assert.equal(withoutKey.peek({query:'headphones'}).offers[0].price,9000,'fresh persisted public cache does not require a key');
 time+=3599999;assert.equal(reloaded.peek({query:'headphones'}).offers[0].price,9000);
 time++;assert.equal(reloaded.peek({query:'headphones'}),null,'TTL expires at exactly one hour');
 assert.equal(createShoppingSearch(config).peek({query:'headphones'}),null,'restart does not revive an expired cache');
 assert.equal(requests,20);
}finally{rmSync(peekDirectory,{recursive:true,force:true});}
console.log('PASS: read-only shopping cache peek survives restart, clones data, uses no quota or network, and expires at the exact TTL.');
