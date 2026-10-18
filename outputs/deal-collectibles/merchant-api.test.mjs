import {test} from 'node:test';
import assert from 'node:assert/strict';
import {merchantDealRequest,merchantDealOwner} from './merchant-api.mjs';
import {merchantTools,merchantRoutes} from '../committed-cart/merchant-tools.mjs';
const calls=[];
const manager={snapshot:async owner=>({drops:[],passes:[],jobs:[{status:'complete',claimCode:'invite'}],owner}),createMerchantDrop:async(...args)=>{calls.push(args);return{job:{status:'running'}}},share:async(owner,body)=>{if(body.id==='shopper-pass')throw Object.assign(new Error('Not your pass'),{status:404});calls.push([owner,body]);return{job:{status:'running'}}},redeem:async(...args)=>{calls.push(args);return{job:{status:'running'}}}};
const request=options=>merchantDealRequest({authorized:true,method:'POST',origin:'http://localhost:4318',getManager:async()=>manager,...options});
test('credential and approval checks run before manager mutation',async()=>{
 calls.length=0;
 assert.equal((await request({authorized:false,action:'create',body:{approved:true}})).status,401);
 assert.equal((await request({action:'create',body:{approved:false}})).status,400);
 assert.equal((await request({action:'redeem',body:{id:'pass',approved:true,testCard:'real'}})).status,400);
 assert.equal((await request({action:'share',body:{id:'pass',owner:'shopper'}})).status,400);
 assert.equal(calls.length,0);
});
test('merchant creation and sharing use a fixed identity and return async jobs',async()=>{
 assert.equal((await request({action:'create',body:{approved:true}})).status,202);
 assert.equal(calls.at(-1)[0],merchantDealOwner);
 assert.equal((await request({action:'share',body:{id:'pass'}})).status,202);
 assert.equal((await request({action:'share',body:{id:'shopper-pass'}})).status,404);
 const result=await request({method:'GET',action:''});assert.equal(result.data.jobs[0].shareUrl,'http://localhost:4318/extension/popup.html?claim=invite');
});
test('sandbox redemption requires explicit approval and preserves ownership boundary',async()=>{
 assert.equal((await request({action:'redeem',body:{id:'pass',approved:true,testCard:'visa-1111'}})).status,202);
 assert.equal(calls.at(-1)[0],merchantDealOwner);
});
test('MCP tools and HTTP operations remain aligned',()=>{
 for(const name of ['merchant_deals','merchant_create_deals','merchant_resume_deals','merchant_share_deal','merchant_redeem_test_deal','merchant_verify_deal']){assert.ok(merchantTools.find(t=>t.name===name));assert.ok(merchantRoutes[name]);}
 assert.equal(merchantTools.find(t=>t.name==='merchant_redeem_test_deal').inputSchema.properties.approved.const,true);
});

test('Authenticated browser identity is server-scoped, never read from request body',async()=>{
 await request({owner:'signed-in-merchant',action:'create',body:{approved:true}});assert.equal(calls.at(-1)[0],'signed-in-merchant');
 assert.equal((await request({owner:'signed-in-merchant',action:'create',body:{approved:true,owner:'victim'}})).status,400);
});
