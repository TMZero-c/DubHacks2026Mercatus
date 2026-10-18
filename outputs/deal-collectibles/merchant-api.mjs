// Merchant credential owns this collection; never accept a caller-supplied shopper ID.
export const merchantDealOwner='mercatus:local-sandbox-merchant';
export async function merchantDealRequest({authorized,method,action,body={},getManager,origin,owner=merchantDealOwner}){
 const fail=(status,error)=>({status,data:{error}});
 if(!authorized)return fail(401,'Merchant API credential required.');
 if(!body||typeof body!=='object'||Array.isArray(body))return fail(400,'Invalid request.');
 const allowed={create:['approved','deal','requestId'],resume:['id'],share:['id'],campaign:['id'],redeem:['id','approved','testCard'],verify:['id']};
 if(method==='GET'&&action===''){
  const state=await(await getManager()).snapshot(owner);
  return{status:200,data:{...state,drops:state.drops.map(drop=>({...drop,...(drop.campaignCode?{campaignUrl:origin+'/extension/popup.html?claim='+encodeURIComponent(drop.campaignCode)}:{})})),passes:state.passes.map(pass=>({...pass,...(pass.shareCode?{shareUrl:origin+'/extension/popup.html?claim='+encodeURIComponent(pass.shareCode)}:{})})),jobs:state.jobs.map(job=>({...job,...(job.status==='complete'&&job.claimCode?{shareUrl:origin+'/extension/popup.html?claim='+encodeURIComponent(job.claimCode)}:{})}))}};
 }
 if(method!=='POST'||!allowed[action])return fail(404,'Unknown merchant deal endpoint.');
 if(Object.keys(body).some(key=>!allowed[action].includes(key)))return fail(400,'Unsupported deal field. Shopper identities cannot be supplied.');
 if(['resume','share','campaign','redeem','verify'].includes(action)&&(typeof body.id!=='string'||!body.id.trim()))return fail(400,action==='resume'?'Drop ID required.':'Pass ID required.');
 if(['create','redeem'].includes(action)&&body.approved!==true)return fail(400,'Explicit approval required.');
 if(action==='redeem'&&body.testCard!=='visa-1111')return fail(400,'Only the public Visa sandbox test card is supported.');
 const manager=await getManager(),operation={create:'createMerchantDrop',resume:'resumeIssue',share:'share',campaign:'shareCampaign',redeem:'redeem',verify:'verifyPass'}[action];
 try{return{status:action==='verify'?200:202,data:await manager[operation](owner,action==='verify'?body.id:body)}}catch(error){if(Number.isInteger(error.status))return fail(error.status,error.message);throw error;}
}
