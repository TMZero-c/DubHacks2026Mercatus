import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
import {createCollectibles} from './manager.mjs';
async function fixture(t,{captureError=false}={}){const dir=await mkdtemp(tmpdir()+'/later-collectibles-test-');t.after(()=>rm(dir,{recursive:true,force:true}));const records={},calls=[];let serial=0;const proof=()=>({signature:'test-'+(++serial),confirmation:'finalized'});
 const chain={network:async()=>{},balance:async()=>1e9,mintAddress:async id=>({toBase58:()=>id}),async mint(id,terms,state,{immutable=false}={}){records[id]={mint:id,terms,state,supply:'1',decimals:0,mintAuthority:null,updateAuthority:immutable?null:'protocol',freezeAuthority:immutable?null:'protocol',amount:'1',frozen:immutable};return{mint:id,snapshot:structuredClone(records[id]),proofs:[proof()]};},async inspect(id,tag){const s=records[id];assert.equal(s.state.holder,tag);return structuredClone(s);},async assign(key,id,old,state){assert.equal(records[id].frozen,false);records[id].state=state;return{snapshot:structuredClone(records[id]),proof:proof()};},async reserve(key,id,state){records[id].state={...state,status:'reserved'};records[id].frozen=true;return{snapshot:structuredClone(records[id]),proof:proof()};},async redeem(key,id,state,receipt){records[id].state={...state,status:'redeemed',receipt};records[id].updateAuthority=null;records[id].freezeAuthority=null;return{snapshot:structuredClone(records[id]),proof:proof()};}};
 const manager=await createCollectibles({directory:pathToFileURL(dir+'/'),keyFile:'unused-unit-test',chainFactory:async()=>chain,saveCard:async()=>({publicFixture:true}),pay:async(action,amount)=>{calls.push(action);if(captureError&&action==='capture')throw Error('Uncertain capture');return{id:action+'-id',status:action==='authorize'?'AUTHORIZED':'PENDING',amountCents:amount};}});
 const done=async owner=>{for(let i=0;i<100;i++){const s=await manager.snapshot(owner);if(!s.busy)return s;await new Promise(r=>setTimeout(r,5));}throw Error('Test job did not finish');};return{manager,done,calls,records,chain,dir};}
test('Creator drop, one-use share, friend transfer, Visa purchase and locked keepsake',async t=>{const f=await fixture(t),m=f.manager;await m.issue('creator',{approved:true});let s=await f.done('creator');assert.equal(s.passes.length,3);assert.equal(s.jobs.at(-1).status,'complete');await assert.rejects(m.issue('creator',{approved:true}),/already exists/);const id=s.passes[0].id;await assert.rejects(m.share('stranger',{id}),/not in your collection/);await m.share('creator',{id});s=await f.done('creator');const code=s.jobs.at(-1).claimCode;await assert.rejects(m.claim('creator',{code}),/your pass/);await m.claim('fan',{code});s=await f.done('fan');assert.equal(s.passes.length,1);await assert.rejects(m.claim('stranger',{code}),/already been claimed/);await m.share('fan',{id});s=await f.done('fan');await m.claim('friend',{code:s.jobs.at(-1).claimCode});s=await f.done('friend');await assert.rejects(m.redeem('friend',{id}),/Approve/);await m.redeem('friend',{id,approved:true,testCard:'visa-1111'});s=await f.done('friend');assert.equal(s.jobs.at(-1).status,'complete');assert.equal(s.passes[0].status,'redeemed');assert.equal(s.passes[0].snapshot.updateAuthority,null);assert.equal(s.passes[0].snapshot.frozen,true);assert.equal(s.passes[0].checkout.capture.status,'PENDING');assert.equal(s.passes[0].checkout.reward.paid,false);await assert.rejects(m.redeem('friend',{id,approved:true,testCard:'visa-1111'}),/already been redeemed/);assert.deepEqual(f.calls,['authorize','capture']);});
test('Uncertain card capture remains reserved and cannot be retried or shared',async t=>{const f=await fixture(t,{captureError:true}),m=f.manager;await m.issue('creator',{approved:true});let s=await f.done('creator');const id=s.passes[0].id;await m.redeem('creator',{id,approved:true,testCard:'visa-1111'});s=await f.done('creator');assert.equal(s.jobs.at(-1).status,'needs_review');assert.equal(s.passes[0].status,'reserved');assert.equal(s.passes[0].snapshot.frozen,true);await assert.rejects(m.redeem('creator',{id,approved:true,testCard:'visa-1111'}));await assert.rejects(m.share('creator',{id}));assert.deepEqual(f.calls,['authorize','capture']);});
test('Tampered immutable terms prevent any card payment',async t=>{const f=await fixture(t),m=f.manager;await m.issue('creator',{approved:true});let s=await f.done('creator');const pass=s.passes[0];f.records[pass.dropMint].terms={...f.records[pass.dropMint].terms,priceCents:50000};await m.redeem('creator',{id:pass.id,approved:true,testCard:'visa-1111'});s=await f.done('creator');assert.equal(s.jobs.at(-1).status,'needs_review');assert.equal(f.calls.length,0);});

test('Interrupted mint resumes the same approved drop without duplicating editions or charging Visa',async t=>{
 const f=await fixture(t),m=f.manager,mint=f.chain.mint;let fail=true;const attempts=[];
 f.chain.mint=async(id,terms,state,options)=>{attempts.push(id);if(terms.edition===2&&fail){fail=false;throw Error('Public RPC rate limit');}return mint(id,terms,state,options);};
 await m.issue('creator',{approved:true});let s=await f.done('creator');assert.equal(s.jobs.at(-1).status,'needs_review');assert.equal(s.canResumeIssue,true);const ids=s.passes.map(p=>p.id),drop=s.drops[0].mint;
 await assert.rejects(m.resumeIssue('stranger'),/No incomplete/);
 await m.resumeIssue('creator');s=await f.done('creator');assert.equal(s.jobs.at(-1).status,'complete');assert.deepEqual(s.passes.map(p=>p.id),ids);assert.equal(s.drops[0].mint,drop);assert.equal(s.canResumeIssue,false);assert.equal(s.passes.filter(p=>p.status==='active').length,3);assert.equal(attempts.filter(id=>id===ids[0]).length,1);assert.equal(Object.keys(f.records).length,4);assert.equal(f.calls.length,0);await assert.rejects(m.resumeIssue('creator'),/No incomplete/);
});

test('Custom merchant terms survive sharing, redemption, multiple drops and idempotent retries',async t=>{
 const f=await fixture(t),m=f.manager,deal={product:'Blue headphones',merchant:'Campus Audio',priceCents:1299,quantity:2,expiresAt:new Date(Date.now()+86400000).toISOString(),rewardCents:75};
 const body={approved:true,requestId:'custom-drop-001',deal};const first=await m.createMerchantDrop('merchant',body);const retry=await m.createMerchantDrop('merchant',body);assert.equal(first.job.id,retry.job.id);
 let s=await f.done('merchant');assert.equal(s.passes.length,2);assert.equal(s.passes[0].editionCount,2);assert.equal(s.passes[0].priceCents,1299);
 await assert.rejects(m.createMerchantDrop('merchant',{...body,deal:{...deal,priceCents:1}}),/different terms/);
 await m.createMerchantDrop('merchant',{...body,requestId:'custom-drop-002',deal:{...deal,quantity:1}});s=await f.done('merchant');assert.equal(s.drops.length,2);assert.equal(s.passes.length,3);
 const id=s.passes[0].id;await m.share('merchant',{id});s=await f.done('merchant');const code=s.jobs.at(-1).claimCode;assert.equal((await m.preview(code)).priceCents,1299);
 await m.claim('shopper',{code});await f.done('shopper');await assert.rejects(m.redeem('merchant',{id,approved:true,testCard:'visa-1111'}),/not in your collection/);
 await m.redeem('shopper',{id,approved:true,testCard:'visa-1111'});s=await f.done('shopper');assert.equal(s.jobs.at(-1).status,'complete');assert.equal(s.passes[0].checkout.order.amountCents,1299);assert.equal(s.passes[0].checkout.capture.amountCents,1299);assert.equal(s.passes[0].checkout.reward.amountCents,75);
});

test('Custom request IDs, ownership and unused invite links survive a manager restart',async t=>{
 const f=await fixture(t),m=f.manager,body={approved:true,requestId:'restart-custom-001',deal:{product:'Travel pouch',merchant:'Mercatus test merchant',priceCents:2499,quantity:1,rewardCents:100,expiresAt:new Date(Date.now()+86400000).toISOString()}};
 const original=await m.createMerchantDrop('merchant',body);let state=await f.done('merchant');const id=state.passes[0].id;
 await m.share('merchant',{id});state=await f.done('merchant');const code=state.passes[0].shareCode;assert.ok(code);
 const restored=await createCollectibles({directory:pathToFileURL(f.dir+'/'),keyFile:'unused-unit-test',chainFactory:async()=>f.chain,saveCard:async()=>{throw Error('No payment expected');},pay:async()=>{throw Error('No payment expected');}});
 const retry=await restored.createMerchantDrop('merchant',body);assert.equal(retry.job.id,original.job.id);
 assert.equal((await restored.snapshot('merchant')).passes[0].shareCode,code);assert.equal((await restored.snapshot('other-account')).passes.length,0);
 assert.equal((await restored.preview(code)).priceCents,2499);await restored.claim('shopper',{code});
 for(let i=0;i<100&&(await restored.snapshot('shopper')).busy;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal((await restored.snapshot('shopper')).passes[0].id,id);assert.equal((await restored.snapshot('merchant')).passes.length,0);
 await assert.rejects(restored.claim('someone-else',{code}),/already been claimed/);assert.equal(f.calls.length,0);
});

test('One reusable campaign link enforces total uses, account uniqueness and no coupon transfers',async t=>{
 const f=await fixture(t),m=f.manager;
 await m.createMerchantDrop('merchant',{approved:true,requestId:'campaign-link-001',deal:{product:'Campaign product',merchant:'Test merchant',priceCents:299,quantity:2,rewardCents:20,expiresAt:new Date(Date.now()+86400000).toISOString()}});
 let state=await f.done('merchant');const id=state.drops[0].id;
 await assert.rejects(m.shareCampaign('stranger',{id}),/Unknown/);
 const link=await m.shareCampaign('merchant',{id});assert.equal((await m.shareCampaign('merchant',{id})).campaignCode,link.campaignCode);
 await m.claim('alice',{code:link.campaignCode});await assert.rejects(m.claim('bob',{code:link.campaignCode}));state=await f.done('alice');
 const passId=state.passes[0].id;await assert.rejects(m.claim('alice',{code:link.campaignCode}),/already claimed/);
 await assert.rejects(m.share('alice',{id:passId}),/campaign link/);
 await m.claim('bob',{code:link.campaignCode});await f.done('bob');
 await assert.rejects(m.claim('carol',{code:link.campaignCode}),/fully claimed/);
 assert.equal((await m.snapshot('merchant')).drops[0].remainingUses,0);
 await m.redeem('alice',{id:passId,approved:true,testCard:'visa-1111'});await f.done('alice');
 await assert.rejects(m.claim('alice',{code:link.campaignCode}),/already claimed/);await assert.rejects(m.redeem('alice',{id:passId,approved:true,testCard:'visa-1111'}),/already been redeemed/);
});
