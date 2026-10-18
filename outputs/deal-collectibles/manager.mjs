import {validateDeal} from './terms.mjs';
import {openChain,GENESIS,RPC} from './chain.mjs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomBytes,randomUUID,createHmac,createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
export class CollectibleError extends Error{constructor(message,status=409){super(message);this.status=status;}}
export async function createCollectibles({directory,keyFile,pay,saveCard,chainFactory=openChain}){
 await mkdir(directory,{recursive:true,mode:0o700});const file=new URL('state.json',directory),saltFile=new URL('identity-salt',directory);
 let salt;try{salt=await readFile(saltFile,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;salt=randomBytes(32).toString('hex');await writeFile(saltFile,salt,{mode:0o600,flag:'wx'});}
 let db={drops:{},passes:{},jobs:{},links:{}};try{db=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const job of Object.values(db.jobs))if(job.status==='running'){job.status='needs_review';job.message='Interrupted operation. Reconcile the recorded transactions before retrying.';}
 let queue=Promise.resolve();const save=()=>{const raw=JSON.stringify(db,null,2);queue=queue.then(async()=>{await writeFile(new URL('state.tmp',directory),raw,{mode:0o600});await rename(new URL('state.tmp',directory),file);});return queue;};await save();
 let chainPromise;const chain=()=>chainPromise??=chainFactory({directory:new URL('chain/',directory),keyFile}).catch(e=>{chainPromise=null;throw e;});
 const tag=owner=>createHmac('sha256',salt).update(owner).digest('hex').slice(0,32);let busy=false;
 const owned=(id,owner)=>{const pass=db.passes[id];if(!pass||pass.owner!==owner)throw new CollectibleError('This collectible is not in your collection.',404);return pass;};
 const publicPass=(pass,owner)=>{const drop=db.drops[pass.dropId];return{id:pass.id,mint:pass.mint,edition:pass.edition,status:pass.status,mine:pass.owner===owner,product:drop.terms.product,priceCents:drop.terms.priceCents,currency:'USD',merchant:drop.terms.merchant,expiresAt:drop.terms.expiresAt,editionCount:drop.terms.mints.length,campaignCode:drop.campaignCode,shareCode:pass.status==='shared'?Object.values(db.jobs).findLast(j=>j.owner===owner&&j.passId===pass.id&&j.type==='share'&&j.status==='complete')?.claimCode:undefined,creator:drop.owner===owner?'You':'Mercatus creator',proofs:pass.proofs,snapshot:pass.snapshot,dropProof:drop.proofs?.at(-1),dropProofs:drop.proofs||[],dropMint:drop.mint,checkout:pass.checkout?{phase:pass.checkout.phase,authorization:pass.checkout.authorization,capture:pass.checkout.capture,order:pass.checkout.order,reward:pass.checkout.reward}:null};};
 function assertActive(pass){if(pass.status!=='active')throw new CollectibleError(pass.status==='redeemed'?'This pass has already been redeemed.':'This pass is not available to share or redeem.');if(Date.parse(db.drops[pass.dropId].terms.expiresAt)<=Date.now())throw new CollectibleError('This price pass has expired.');}
 async function verified(pass){const c=await chain(),drop=db.drops[pass.dropId];const root=await c.inspect(drop.mint,'protocol');if(root.updateAuthority!==null||root.mintAuthority!==null||root.supply!=='1'||root.decimals!==0||root.amount!=='1'||root.freezeAuthority!==null||!root.frozen||root.terms.mints?.length!==drop.terms.mints.length||new Set(root.terms.mints).size!==drop.terms.mints.length||root.terms.mints?.[pass.edition-1]!==pass.mint||JSON.stringify(root.terms)!==JSON.stringify(drop.terms))throw new CollectibleError('The immutable drop terms could not be verified.');const nft=await c.inspect(pass.mint,tag(pass.owner));if(nft.supply!=='1'||nft.decimals!==0||nft.mintAuthority!==null||nft.amount!=='1'||nft.terms.drop!==drop.mint||nft.terms.edition!==pass.edition||nft.state.holder!==tag(pass.owner)||nft.state.status!==pass.status)throw new CollectibleError('On-chain custody and app state differ. Reconciliation required.');return nft;}
 async function launch(owner,type,action,metadata={}){if(busy)throw new CollectibleError('Another collectible transaction is being verified. Try again shortly.');busy=true;const job={...metadata,id:randomUUID(),owner,type,status:'running',message:'Submitting to public Solana testnet…',createdAt:new Date().toISOString()};db.jobs[job.id]=job;await save();void(async()=>{try{await action(job);job.status='complete';job.message='Verified on public Solana testnet.';}catch(e){job.status='needs_review';job.message=e.message||'Operation needs review. No automatic retry.';}finally{busy=false;await save();}})();return{job:{id:job.id,status:job.status}};}
 async function issue(owner,body,merchant=false){
  if(body.approved!==true)throw new CollectibleError('Approve publishing these deal terms.',400);
  let config,requestHash;
  if(merchant){
   if(typeof body.requestId!=='string'||! /^[a-zA-Z0-9_-]{8,80}$/.test(body.requestId))throw new CollectibleError('Supply an 8–80 character requestId for safe retries.',400);
   requestHash=sha(JSON.stringify(body.deal));
   const existing=Object.values(db.jobs).find(j=>j.owner===owner&&j.type==='issue'&&j.requestId===body.requestId);
   if(existing){if(existing.requestHash!==requestHash)throw new CollectibleError('requestId was already used with different terms.');return{job:{id:existing.id,status:existing.status}};}
   try{config=validateDeal(body.deal);}catch(error){throw new CollectibleError(error.message,400);}
  }else{
   if(Object.values(db.drops).some(d=>d.owner===owner))throw new CollectibleError('Your test drop already exists.');
   config={product:'First wait · desk accessory',merchant:'Mercatus sandbox merchant',priceCents:85,quantity:3,expiresAt:new Date(Date.now()+48*3600000).toISOString(),rewardCents:5};
  }
  return launch(owner,'issue',async job=>{
   const c=await chain();await c.network();if(await c.balance()<100000000)throw new CollectibleError('Protocol needs free testnet SOL. Users never fund a wallet.');
   const id=randomUUID(),mint=(await c.mintAddress(id)).toBase58(),passes=[];
   for(let i=1;i<=config.quantity;i++){const pid=id+':'+i;passes.push({id:pid,mint:(await c.mintAddress(pid)).toBase58(),dropId:id,edition:i,owner,status:'issuing',proofs:[]});}
   const {quantity,...offer}=config;
   const terms={kind:'drop',...offer,art:{sha256:'3163bd1c7b0833698e74eabff86a60b5fcc1a0921bae9efee593e48212f025dd',mediaType:'image/png'},currency:'USD',creator:tag(owner),mints:passes.map(p=>p.mint)};
   const drop=db.drops[id]={id,mint,owner,terms,status:'issuing',proofs:[]};for(const pass of passes)db.passes[pass.id]=pass;await save();await finishDrop(drop,job);
  },merchant?{requestId:body.requestId,requestHash}:{});
 }
 const createMerchantDrop=(owner,body)=>issue(owner,body,true);
 async function finishDrop(drop,job){
  const c=await chain(),passes=Object.values(db.passes).filter(p=>p.dropId===drop.id).sort((a,b)=>a.edition-b.edition);
  job.dropId=drop.id;job.message='Publishing immutable deal terms…';await save();
  const root=await c.mint(drop.id,drop.terms,{holder:'protocol',status:'manifest'},{immutable:true});drop.proofs=root.proofs;await save();
  for(const pass of passes){if(pass.status!=='issuing')continue;job.message=`Minting collectible ${pass.edition} of ${passes.length}…`;await save();const nft=await c.mint(pass.id,{kind:'pass',drop:drop.mint,edition:pass.edition},{holder:tag(pass.owner),status:'active',revision:0});pass.proofs=nft.proofs;pass.snapshot=nft.snapshot;pass.status='active';await save();}
  drop.status='active';await save();
 }
 async function resumeIssue(owner,body={}){const drop=Object.values(db.drops).find(d=>d.owner===owner&&d.status==='issuing'&&(!body.id||d.id===body.id));if(!drop)throw new CollectibleError('No incomplete drop to resume.');return launch(owner,'issue_resume',job=>finishDrop(drop,job));}

 async function share(owner,body){const pass=owned(body.id,owner);assertActive(pass);if(db.drops[pass.dropId].campaignCode)throw new CollectibleError('Share the campaign link. Campaign coupons cannot be transferred individually.');const code=randomBytes(24).toString('base64url');return launch(owner,'share',async job=>{job.passId=pass.id;await save();const nft=await verified(pass),c=await chain();const next={...nft.state,status:'shared',revision:nft.state.revision+1,claim:sha(code)};const result=await c.assign(job.id,pass.mint,nft.state,next);pass.status='shared';pass.snapshot=result.snapshot;pass.proofs.push(result.proof);db.links[sha(code)]={passId:pass.id,createdAt:new Date().toISOString(),used:false};job.claimCode=code;job.passId=pass.id;await save();});}
 async function shareCampaign(owner,body){
  const drop=db.drops[body.id];if(!drop||drop.owner!==owner)throw new CollectibleError('Unknown merchant drop.',404);
  if(drop.status!=='active'||Date.parse(drop.terms.expiresAt)<=Date.now())throw new CollectibleError('Only active, unexpired drops can be shared.');
  if(drop.campaignCode)return{campaignCode:drop.campaignCode,dropId:drop.id,totalUses:drop.terms.mints.length};
  if(busy)throw new CollectibleError('Another deal operation is running.');
  const passes=Object.values(db.passes).filter(pass=>pass.dropId===drop.id);
  if(passes.some(pass=>pass.owner!==owner||pass.status!=='active'))throw new CollectibleError('Create a campaign link before distributing or redeeming any passes.');
  drop.campaignCode=randomBytes(24).toString('base64url');drop.claimants={};await save();
  return{campaignCode:drop.campaignCode,dropId:drop.id,totalUses:drop.terms.mints.length};
 }
 async function claimCampaign(owner,drop){
  if(drop.owner===owner)throw new CollectibleError('Send this campaign link to your customers.');
  if(Date.parse(drop.terms.expiresAt)<=Date.now())throw new CollectibleError('This campaign has expired.');
  if(drop.claimants?.[owner])throw new CollectibleError('You already claimed this campaign. Each account can use it once.');
  const pass=Object.values(db.passes).find(pass=>pass.dropId===drop.id&&pass.owner===drop.owner&&pass.status==='active'&&!pass.claimReservation);
  if(!pass)throw new CollectibleError('This campaign is fully claimed.');
  return launch(owner,'claim',async job=>{
   job.passId=pass.id;pass.claimReservation=owner;(drop.claimants??={})[owner]={passId:pass.id,jobId:job.id,status:'reserved'};await save();
   const nft=await verified(pass),c=await chain();const next={holder:tag(owner),status:'active',revision:nft.state.revision+1};
   const result=await c.assign(job.id,pass.mint,nft.state,next);pass.owner=owner;pass.snapshot=result.snapshot;pass.proofs.push(result.proof);drop.claimants[owner].status='claimed';await save();
  });
 }
 function resolveLink(code){if(typeof code!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(code))throw new CollectibleError('Paste a valid Mercatus deal link.',400);const link=db.links[sha(code)];if(!link||link.used)throw new CollectibleError('This deal link has already been claimed or is unavailable.');return{link,pass:db.passes[link.passId]};}
 async function claim(owner,body){const campaign=Object.values(db.drops).find(drop=>drop.campaignCode&&drop.campaignCode===body.code);if(campaign)return claimCampaign(owner,campaign);const {link,pass}=resolveLink(body.code);if(pass.owner===owner)throw new CollectibleError('This is your pass. Send the link to a friend.');if(pass.status!=='shared'||Date.parse(db.drops[pass.dropId].terms.expiresAt)<=Date.now())throw new CollectibleError('This deal is no longer claimable.');return launch(owner,'claim',async job=>{job.passId=pass.id;await save();const nft=await verified(pass);if(nft.state.claim!==sha(body.code))throw new CollectibleError('Claim does not match the on-chain commitment.');const c=await chain(),next={holder:tag(owner),status:'active',revision:nft.state.revision+1};const result=await c.assign(job.id,pass.mint,nft.state,next);pass.owner=owner;pass.status='active';pass.snapshot=result.snapshot;pass.proofs.push(result.proof);link.used=true;job.passId=pass.id;await save();});}
 async function redeem(owner,body){const pass=owned(body.id,owner);assertActive(pass);const campaign=db.drops[pass.dropId];if(campaign.campaignCode&&(!campaign.claimants?.[owner]||campaign.claimants[owner].passId!==pass.id||campaign.claimants[owner].status!=='claimed'))throw new CollectibleError('Claim your own campaign coupon before redeeming.');if(body.approved!==true||body.testCard!=='visa-1111')throw new CollectibleError('Approve this deal’s USD Visa sandbox purchase with the public test card.',400);return launch(owner,'redeem',async job=>{
  job.passId=pass.id;await save();const nft=await verified(pass),c=await chain(),drop=db.drops[pass.dropId];const reservation=await c.reserve(job.id+':reserve',pass.mint,nft.state);pass.status='reserved';pass.snapshot=reservation.snapshot;pass.proofs.push(reservation.proof);pass.checkout={phase:'saving_card'};await save();
  const handle=await saveCard(owner);pass.checkout.phase='authorizing';await save();const ref='collect-'+sha(job.id).slice(0,30);const auth=await pay('authorize',drop.terms.priceCents,null,ref,handle);pass.checkout.authorization=auth;await save();if(auth.status!=='AUTHORIZED'||auth.amountCents!==drop.terms.priceCents||!auth.id)throw new CollectibleError('Authorization needs reconciliation. No retry was submitted.');
  pass.checkout.phase='capturing';await save();const capture=await pay('capture',drop.terms.priceCents,auth.id,ref,null);pass.checkout.capture=capture;await save();if(!capture.id||!['PENDING','COMPLETED','TRANSMITTED','SETTLED'].includes(capture.status)||capture.amountCents!==drop.terms.priceCents)throw new CollectibleError('Capture needs reconciliation. No retry was submitted.');
  pass.checkout.phase='locking_collectible';pass.checkout.order={id:'TEST-'+sha(job.id).slice(0,8).toUpperCase(),amountCents:drop.terms.priceCents,status:'capture_accepted',fulfillment:'Controlled test merchant; no real shipment'};await save();
  const receipt=sha(JSON.stringify({authorization:auth.id,capture:capture.id,amount:drop.terms.priceCents,currency:'USD'}));const result=await c.redeem(job.id+':redeem',pass.mint,reservation.snapshot.state,receipt);pass.status='redeemed';pass.snapshot=result.snapshot;pass.proofs.push(result.proof);pass.checkout.phase='complete';pass.checkout.reward={amountCents:drop.terms.rewardCents,currency:'USD',status:pass.owner===drop.owner?'not_eligible_self_purchase':'pending_merchant_settlement',paid:false};await save();});}
 async function snapshot(owner){const drops=Object.values(db.drops).filter(d=>d.owner===owner).map(d=>{const passes=Object.values(db.passes).filter(p=>p.dropId===d.id);return{id:d.id,mint:d.mint,campaignCode:d.campaignCode,totalUses:d.terms.mints.length,remainingUses:passes.filter(p=>p.owner===d.owner&&p.status==='active'&&!p.claimReservation).length,terms:d.terms,status:d.status,issued:passes.filter(p=>p.status!=='issuing').length,claimed:passes.filter(p=>p.owner!==owner).length,redeemed:passes.filter(p=>p.status==='redeemed').length,pendingReferralCents:passes.reduce((n,p)=>n+(p.checkout?.reward?.status==='pending_merchant_settlement'?p.checkout.reward.amountCents:0),0)};});return{drops,cluster:'testnet',rpc:RPC,genesis:GENESIS,custody:'Protocol wallet only. No shopper, creator or merchant wallet.',passes:Object.values(db.passes).filter(p=>p.owner===owner).map(p=>publicPass(p,owner)),jobs:Object.values(db.jobs).filter(j=>j.owner===owner).map(({owner,...j})=>j).slice(-12),canIssue:!Object.values(db.drops).some(d=>d.owner===owner),canResumeIssue:Object.values(db.drops).some(d=>d.owner===owner&&d.status==='issuing'),busy};}
 async function preview(code){const campaign=Object.values(db.drops).find(d=>d.campaignCode&&d.campaignCode===code);if(campaign)return{product:campaign.terms.product,priceCents:campaign.terms.priceCents,expiresAt:campaign.terms.expiresAt,totalUses:campaign.terms.mints.length,remainingUses:Date.parse(campaign.terms.expiresAt)>Date.now()?Object.values(db.passes).filter(p=>p.dropId===campaign.id&&p.owner===campaign.owner&&p.status==='active'&&!p.claimReservation).length:0,onePerAccount:true};const {pass}=resolveLink(code);return{product:db.drops[pass.dropId].terms.product,priceCents:db.drops[pass.dropId].terms.priceCents,edition:pass.edition,expiresAt:db.drops[pass.dropId].terms.expiresAt};}
 async function verifyPass(owner,id){const pass=owned(id,owner);pass.snapshot=await verified(pass);await save();return{pass:publicPass(pass,owner)};}
 return{snapshot,issue,createMerchantDrop,shareCampaign,resumeIssue,share,claim,redeem,preview,verifyPass};
}
