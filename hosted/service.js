import {store} from './store.js';
import {createCampaign,updateCampaign,previewCampaign,runAgent,merchantSnapshot,reconcile} from '../outputs/committed-cart/merchant-engine.mjs';
import {verify} from '../outputs/committed-cart/engine.mjs';
import {merchantTools} from '../outputs/committed-cart/merchant-tools.mjs';
// Stateful Testnet deal tools run on the local protocol backend, not this hosted adapter.
const hostedToolNames=new Set(['merchant_overview','merchant_intents','merchant_preview','merchant_create_campaign','merchant_update_campaign','merchant_run']);
export const hostedTools=merchantTools.filter(t=>hostedToolNames.has(t.name)).map(t=>({...t,description:t.name==='merchant_run'?'Process active campaigns against confirmed Visa sandbox intents. Duplicates and pricing/stock limits are enforced.':t.description,...(t.name==='merchant_create_campaign'?{inputSchema:{...t.inputSchema,required:[...t.inputSchema.required,'requestId']}}:{})}));
const idempotency=body=>{if(!body.requestId||typeof body.requestId!=='string'||body.requestId.length>100)throw new Error('Supply requestId (1–100 characters) for safe retries.');};
// Legacy fixtures remain stored for audit, but cannot participate in the live workspace.
function workspace(data){
 const carts=Object.fromEntries(Object.entries(data.carts).filter(([,c])=>c.synthetic!==true&&c.environment==='visa-acceptance-sandbox'&&/^\d{1,60}$/.test(c.authorizationId||'')&&c.authorizedAmount===c.amount));
 const campaigns=data.merchant.campaigns.filter(c=>!c.requestId?.startsWith('smoke-campaign-'));
 const campaignIds=new Set(campaigns.map(c=>c.id));
 return{carts,merchant:{...data.merchant,campaigns,decisions:data.merchant.decisions.filter(d=>carts[d.intentId]&&campaignIds.has(d.campaignId))}};
}
function processLive(data,live){
 const known=new Set(data.merchant.decisions.map(d=>d.id));
 const result=runAgent(live.merchant,live.carts);
 data.merchant.decisions.push(...live.merchant.decisions.filter(d=>!known.has(d.id)));
 return result;
}
export async function execute(name,body={},db=store){
 if(name==='merchant_overview'){const {data}=await db.read();const live=workspace(data);reconcile(live.merchant,live.carts);return merchantSnapshot(live.merchant,live.carts);}
 if(name==='merchant_run')return db.transaction(data=>{const live=workspace(data);return{submitted:processLive(data,live).submitted};});
 if(name==='merchant_intents'){const {data}=await db.read();return{intents:Object.values(workspace(data).carts).filter(c=>verify(c).acceptingOffers).map(c=>({id:c.id,items:c.items,amount:c.amount,sellers:c.sellers,deliveryDate:c.deliveryDate,expiresAt:c.expiresAt,digest:c.digest,intentSource:'visa-acceptance-sandbox',verification:verify(c)}))};}
 if(name==='merchant_preview'){const {data}=await db.read();const live=workspace(data);return previewCampaign(live.merchant,body,live.carts);}
 if(name==='merchant_create_campaign'){if(body.executionMode==='solana')throw new Error('Solana execution requires the local payment service and a deployed program.');idempotency(body);return db.transaction(data=>({campaign:createCampaign(data.merchant,body)}));}
 if(name==='merchant_update_campaign'&&body.executionMode==='solana')throw new Error('Solana execution requires the local payment service.');
 if(name==='merchant_update_campaign')return db.transaction(data=>{const live=workspace(data);if(!live.merchant.campaigns.some(c=>c.id===body.id))throw new Error('Unknown campaign.');reconcile(live.merchant,live.carts);const campaign=updateCampaign(live.merchant,body.id,body);return{campaign,submitted:processLive(data,live).submitted};});
 throw new Error('Unknown merchant tool');
}
