import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {address,AccountRole,createKeyPairSignerFromBytes,getProgramDerivedAddress,createTransactionMessage,setTransactionMessageFeePayerSigner,setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,signTransactionMessageWithSigners,getBase64EncodedWireTransaction} from '@solana/kit';
export const RPC='https://api.devnet.solana.com',SYSTEM='11111111111111111111111111111111';
const norm=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const hash=x=>createHash('sha256').update(x).digest();
export const productHash=p=>hash(norm(p.name)+'|'+norm(p.variant));
export function cartUnits(c){const units=new Map();for(const item of c.items){const h=productHash(item),key=h.toString('hex'),old=units.get(key);if(old)old.quantity+=item.quantity;else units.set(key,{hash:h,quantity:item.quantity});}return [...units.values()];}
export const sellerHash=s=>hash(norm(s));
export const intentCommitment=c=>hash('later-intent-v1\0'+c.id+'\0'+c.digest);
const u=(n,size=8,signed=false)=>{const b=Buffer.alloc(size);if(size===8){if(signed)b.writeBigInt64LE(BigInt(n));else b.writeBigUInt64LE(BigInt(n));}else if(size===4)b.writeUInt32LE(n);else if(size===2)b.writeUInt16LE(n);else b[0]=Number(n);return b;};
const vec=values=>Buffer.concat([u(values.length,4),...values]);
const ascii=s=>new TextEncoder().encode(s);
const meta=(key,role=AccountRole.READONLY,signer)=>({address:address(key),role,...(signer?{signer}:{})});
const keyBytes=async key=>{const {getAddressEncoder}=await import('@solana/kit');return Buffer.from(getAddressEncoder().encode(address(key)));};
class Reader{
 constructor(data){this.d=Buffer.from(data);this.i=0;}take(n){if(this.i+n>this.d.length)throw new Error('Invalid Solana account data');const b=this.d.subarray(this.i,this.i+n);this.i+=n;return b;}n(size=8,signed=false){const b=this.take(size);return size===8?Number(signed?b.readBigInt64LE():b.readBigUInt64LE()):size===4?b.readUInt32LE():size===2?b.readUInt16LE():b[0];}key(){return this.take(32);}items(){const count=this.n(4);if(count>8)throw new Error('Invalid quote item count');return Array.from({length:count},()=>({hash:this.key(),quantity:this.n(4)}));}}
export function decodeQuote(data){const r=new Reader(data);if(r.n(1)!==4)throw new Error('Not a marketplace quote');return{policy:r.key(),intent:r.key(),operator:r.key(),amount:r.n(),incentiveCents:r.n(),day:r.n(8,true),expires:r.n(8,true),status:r.n(1),units:r.items()};}
export function decodePolicy(data){const r=new Reader(data);if(r.n(1)!==1)throw new Error('Not a marketplace policy');const merchant=r.key(),id=r.key(),dailyBudgetCents=r.n(),maxIncentiveCents=r.n(),fixedDiscount=!!r.n(1),deliveryDays=r.n(2),offerSeconds=r.n(4),end=r.n(8,true),sellerCount=r.n(4);if(sellerCount>10)throw new Error('Invalid seller rules');const sellers=Array.from({length:sellerCount},()=>r.key()),active=!!r.n(1),usageCount=r.n(4);if(usageCount>3)throw new Error('Invalid policy usage');r.take(usageCount*16);const outstanding=r.n(4),count=r.n(4);if(count>200)throw new Error('Invalid policy products');return{merchant,id,dailyBudgetCents,maxIncentiveCents,fixedDiscount,deliveryDays,offerSeconds,end,sellers,active,outstanding,products:Array.from({length:count},()=>({hash:r.key(),list:r.n(),floor:r.n()}))};}
export function listingFloor(p,c){return Math.max(Math.ceil(p.unitCents*(100-c.discountPct)/100),Math.ceil(p.costCents*100/(100-c.minMarginPct)));}
export async function openMarket({directory,fetchImpl=fetch,deploymentFile='deployment.json'}){
 const read=async name=>JSON.parse(await readFile(new URL(name,directory),'utf8'));
 const deployment=await read(deploymentFile);
 if(deployment.cluster!=='devnet'||!deployment.programId)throw new Error('Only a deployed devnet market is supported.');
 const merchant=await createKeyPairSignerFromBytes(Uint8Array.from(await read('merchant-keypair.json'))),attestor=await createKeyPairSignerFromBytes(Uint8Array.from(await read('attestor-keypair.json')));
 if(attestor.address!==deployment.attestor||merchant.address!==deployment.merchant)throw new Error('Solana deployment signer mismatch');
 const programId=address(deployment.programId);
 async function rpc(method,params=[]){const response=await fetchImpl(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok||data.error)throw new Error('Solana devnet RPC request failed: '+(data.error?.code||response.status));return data.result;}
 async function account(key){const result=await rpc('getAccountInfo',[key,{encoding:'base64',commitment:'confirmed'}]);if(!result.value)return null;return{...result.value,data:Buffer.from(result.value.data[0],'base64')};}
 const pda=async seeds=>(await getProgramDerivedAddress({programAddress:programId,seeds}))[0];
 const program=await account(programId);if(!program?.executable)throw new Error('Marketplace program is not deployed on devnet.');
 async function send(data,accounts,payer=merchant){
  const latest=(await rpc('getLatestBlockhash',[{commitment:'confirmed'}])).value;
  let msg=createTransactionMessage({version:0});msg=setTransactionMessageFeePayerSigner(payer,msg);msg=setTransactionMessageLifetimeUsingBlockhash({blockhash:latest.blockhash,lastValidBlockHeight:BigInt(latest.lastValidBlockHeight)},msg);msg=appendTransactionMessageInstructions([{programAddress:programId,accounts,data}],msg);
  const tx=await signTransactionMessageWithSigners(msg),wire=getBase64EncodedWireTransaction(tx);
  const signature=await rpc('sendTransaction',[wire,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:2}]);
  for(let i=0;i<40;i++){const s=(await rpc('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0];if(s?.err)throw new Error('Solana transaction failed; inspect '+signature);if(s&&['confirmed','finalized'].includes(s.confirmationStatus))return signature;await new Promise(r=>setTimeout(r,500));}
  throw new Error('Solana confirmation pending; inspect '+signature);
 }
 const signerMeta=s=>meta(s.address,AccountRole.WRITABLE_SIGNER,s);
 const w=k=>meta(k,AccountRole.WRITABLE);
 async function policyAddress(c){return pda([ascii('policy'),await keyBytes(merchant.address),hash(c.id)]);}
 async function stockAddress(h){return pda([ascii('stock'),await keyBytes(merchant.address),h]);}
 async function intentAddress(c){return pda([ascii('intent'),intentCommitment(c)]);}
 async function quoteAddress(policy,intent){return pda([ascii('quote'),await keyBytes(policy),await keyBytes(intent)]);}
 async function publishPolicy(c){
  const policy=await policyAddress(c);const signatures=[];
  if(!await account(policy)){
   const data=Buffer.concat([u(0,1),hash(c.id),u(c.dailyBudgetCents),u(c.maxIncentiveCents),u(c.strategy==='fixed_discount',1),u(c.deliveryDays,2),u(c.offerMinutes*60,4),u(Math.floor(Date.parse(c.endAt)/1000),8,true),vec(c.sellerRules.map(sellerHash))]);
   signatures.push(await send(data,[signerMeta(merchant),w(policy),meta(SYSTEM)]));
  }
  // Recover an interrupted multi-transaction publication from confirmed account state.
  const record=await account(policy);if(record.owner!==programId)throw new Error('Unexpected policy owner');const existing=decodePolicy(record.data);
  if(!existing.merchant.equals(await keyBytes(merchant.address))||!existing.id.equals(hash(c.id))||existing.dailyBudgetCents!==c.dailyBudgetCents||existing.maxIncentiveCents!==c.maxIncentiveCents||existing.fixedDiscount!==(c.strategy==='fixed_discount')||existing.deliveryDays!==c.deliveryDays||existing.offerSeconds!==c.offerMinutes*60||existing.end!==Math.floor(Date.parse(c.endAt)/1000)||existing.sellers.length!==c.sellerRules.length||existing.sellers.some((s,i)=>!s.equals(sellerHash(c.sellerRules[i]))))throw new Error('Published policy rules do not match campaign');
  const missing=c.products.filter(p=>!existing.products.some(old=>old.hash.equals(productHash(p))&&old.list===p.unitCents&&old.floor===listingFloor(p,c)));
  if(existing.products.length+missing.filter(p=>!existing.products.some(old=>old.hash.equals(productHash(p)))).length!==c.products.length||missing.length&&(existing.active||existing.outstanding))throw new Error('Published policy catalog cannot be changed');
  for(let offset=0;offset<missing.length;offset+=8){const batch=missing.slice(offset,offset+8);const encoded=batch.map(p=>Buffer.concat([productHash(p),u(p.unitCents),u(listingFloor(p,c))]));const stockKeys=await Promise.all(batch.map(p=>stockAddress(productHash(p))));
   signatures.push(await send(Buffer.concat([u(1,1),vec(encoded),vec(batch.map(p=>u(p.stock,4)))]),[signerMeta(merchant),w(policy),meta(SYSTEM),...stockKeys.map(w)]));
  }
  if(!existing.active)signatures.push(await send(Buffer.from([2,1]),[signerMeta(merchant),w(policy)]));
  return{programId,policy,cluster:'devnet',signatures,publishedAt:new Date().toISOString()};
 }
 async function setActive(c,active){const policy=await policyAddress(c);return send(Buffer.from([2,Number(active)]),[signerMeta(merchant),w(policy)]);}
 async function registerIntent(c){
  const intent=await intentAddress(c);if(await account(intent))return{intent};
  const data=Buffer.concat([u(3,1),intentCommitment(c),u(c.amount),u(Math.floor(Date.parse(c.expiresAt)/1000),8,true),u(Math.floor(Date.parse(c.deliveryDate)/86400000),8,true),sellerHash(c.sellers),vec(cartUnits(c).map(i=>Buffer.concat([i.hash,u(i.quantity,4)])))]);
  const signature=await send(data,[signerMeta(attestor),w(intent),meta(SYSTEM)],attestor);return{intent,signature};
 }
 async function computeQuote(c,cart){
  const policy=await policyAddress(c),{intent}=await registerIntent(cart),quote=await quoteAddress(policy,intent);const prior=await account(quote);
  let signature=null;
  if(!prior){const best=Math.min(cart.amount,...(cart.offers||[]).filter(o=>Date.parse(o.expiresAt)>Date.now()&&o.snapshotHash===cart.digest).map(o=>o.amount));signature=await send(Buffer.concat([u(4,1),u(best)]),[signerMeta(merchant),w(policy),w(intent),w(quote),meta(SYSTEM),...await Promise.all(cartUnits(cart).map(async i=>w(await stockAddress(i.hash))))]);}
  const record=await account(quote);if(!record||record.owner!==programId)throw new Error('No confirmed Solana quote');const value=decodeQuote(record.data);if(value.status!==1||value.expires*1000<=Date.now())throw new Error('Solana quote is no longer open');
  if(!value.policy.equals(await keyBytes(policy))||!value.intent.equals(await keyBytes(intent))||!value.operator.equals(await keyBytes(merchant.address))||!Number.isSafeInteger(value.amount)||value.amount<=0||value.amount>cart.amount)throw new Error('Solana quote does not match the requested cart');
  return{...value,receipt:{cluster:'devnet',programId,policy,intent,quote,signature,computedOn:'Solana SVM',confirmedAt:new Date().toISOString()}};
 }
 async function select(receipt){const a=await account(receipt.intent);if(!a||a.owner!==programId)throw new Error('Unknown Solana intent');const r=new Reader(a.data);if(r.n(1)!==3)throw new Error('Invalid Solana intent');r.take(32+8+8+8+32);r.items();const count=r.n(4);if(count>30)throw new Error('Invalid intent quote count');r.take(count*49);const chosen=r.key();if(chosen.equals(await keyBytes(receipt.quote)))return null;if(chosen.some(x=>x!==0))throw new Error('Another quote is already selected');return send(Buffer.from([5]),[signerMeta(attestor),w(receipt.intent),meta(receipt.quote)],attestor);}
 async function release(receipt){const a=await account(receipt.quote);if(!a)return null;const q=decodeQuote(a.data);if(q.status===2)return null;return send(Buffer.from([6]),[signerMeta(attestor),w(receipt.policy),w(receipt.intent),w(receipt.quote),...await Promise.all(q.units.map(async i=>w(await stockAddress(i.hash))))],attestor);}
 async function cancelIntent(cart){const intent=await intentAddress(cart),a=await account(intent);if(!a)return false;if(a.owner!==programId)throw new Error('Unknown Solana intent');const r=new Reader(a.data);if(r.n(1)!==3)throw new Error('Invalid Solana intent');r.take(32+8);if(r.n(8,true)*1000>Date.now())await send(Buffer.from([8]),[signerMeta(attestor),w(intent)],attestor);return true;}
 return{deployment,rpc,account,publishPolicy,setActive,computeQuote,select,release,cancelIntent};
}
