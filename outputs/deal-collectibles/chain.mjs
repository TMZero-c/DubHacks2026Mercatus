import {testnetConnection} from './rpc.mjs';
import {Keypair,PublicKey,SystemProgram,Transaction} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID as PROGRAM,ExtensionType,getMintLen,getAccountLen,createInitializeMetadataPointerInstruction,createInitializeMintInstruction,createInitializeAccount3Instruction,createInitializeImmutableOwnerInstruction,createMintToInstruction,createSetAuthorityInstruction,AuthorityType,createTransferCheckedInstruction,createFreezeAccountInstruction,getMint,getAccount,getTokenMetadata} from '@solana/spl-token';
import {createInitializeInstruction,createUpdateFieldInstruction,createUpdateAuthorityInstruction} from '@solana/spl-token-metadata';
import bs58 from 'bs58';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const GENESIS='4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';
export const RPC='https://api.testnet.solana.com';
export const explorer=(id,kind='tx')=>`https://explorer.solana.com/${kind}/${id}?cluster=testnet`;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const digest=s=>createHash('sha256').update(s).digest('hex').slice(0,32);
export async function openChain({directory,keyFile}){
 await mkdir(directory,{recursive:true,mode:0o700});
 const signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(keyFile,'utf8'))));
 const connection=testnetConnection();
 const publicKey=signer.publicKey, journalFile=new URL('transactions.json',directory);
 let journal={};try{journal=JSON.parse(await readFile(journalFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 let queue=Promise.resolve();const save=()=>{const body=JSON.stringify(journal,null,2);queue=queue.then(async()=>{await writeFile(new URL('transactions.tmp',directory),body,{mode:0o600});await rename(new URL('transactions.tmp',directory),journalFile);});return queue;};
 let checkedAt=0;async function network(){if(Date.now()-checkedAt<60000)return;const hash=await connection.getGenesisHash();if(hash!==GENESIS)throw Error('Public Solana testnet required.');const p=await connection.getAccountInfo(PROGRAM);if(!p?.executable)throw Error('Token-2022 unavailable on public testnet.');checkedAt=Date.now();}
 const mintAddress=async id=>PublicKey.createWithSeed(publicKey,'mint:'+digest(id).slice(0,27),PROGRAM);
 const custodyAddress=async(mint,tag)=>PublicKey.createWithSeed(publicKey,digest(mint.toBase58()+':'+tag),PROGRAM);
 const field=(mint,key,value)=>createUpdateFieldInstruction({programId:PROGRAM,metadata:mint,updateAuthority:publicKey,field:key,value:typeof value==='string'?value:JSON.stringify(value)});
 async function final(signature){const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];if(status?.err)throw Error('Solana transaction failed: '+JSON.stringify(status.err));if(status?.confirmationStatus!=='finalized')return null;const tx=await connection.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(!tx||tx.meta?.err||!tx.transaction.message.accountKeys?.[0]?.equals(publicKey)||tx.transaction.message.header.numRequiredSignatures!==1)throw Error('Transaction verification failed.');return{signature,slot:tx.slot,blockTime:tx.blockTime,confirmation:'finalized',feeLamports:tx.meta.fee,explorer:explorer(signature),genesis:GENESIS};}
 async function send(key,instructions,{canReplaceExpired}={}){
  await network();let entry=journal[key];
  if(entry?.proof)return entry.proof;
  let expiredAttempts=[];
  if(entry&&canReplaceExpired){
   const proof=await final(entry.signature);if(proof){entry.proof=proof;await save();return proof;}
   const status=(await connection.getSignatureStatuses([entry.signature],{searchTransactionHistory:true})).value[0];
   if(!status&&await connection.getBlockHeight('finalized')>entry.lastValidBlockHeight){
    if(!await canReplaceExpired())throw Error('Expired mint transaction cannot be safely replaced. Reconciliation required.');
    expiredAttempts=[...(entry.expiredAttempts||[]),{...entry,expiredAttempts:undefined,expiredVerifiedAt:new Date().toISOString()}];entry=null;
   }
  }
  if(!entry){const latest=await connection.getLatestBlockhash('finalized');const tx=new Transaction({feePayer:publicKey,...latest}).add(...instructions);tx.sign(signer);const raw=tx.serialize();entry=journal[key]={signature:bs58.encode(tx.signature),raw:raw.toString('base64'),lastValidBlockHeight:latest.lastValidBlockHeight,createdAt:new Date().toISOString(),expiredAttempts};await save();}
  const prior=await final(entry.signature);if(prior){entry.proof=prior;await save();return prior;}
  // Retries rebroadcast exactly the same signed bytes, never a new payment/action.
  await connection.sendRawTransaction(Buffer.from(entry.raw,'base64'),{skipPreflight:false,maxRetries:3,preflightCommitment:'confirmed'});
  for(let i=0;i<40;i++){await pause(1200);const proof=await final(entry.signature);if(proof){entry.proof=proof;await save();return proof;}if(await connection.getBlockHeight('confirmed')>entry.lastValidBlockHeight)throw Error('Transaction expired or outcome uncertain; reconcile before retrying.');}
  throw Error('Solana finality is pending. Transaction is recorded; do not duplicate it.');
 }
 async function custodyInstructions(mint,tag){const address=await custodyAddress(mint,tag);if(await connection.getAccountInfo(address))return{address,instructions:[]};const size=getAccountLen([ExtensionType.ImmutableOwner]);return{address,instructions:[SystemProgram.createAccountWithSeed({fromPubkey:publicKey,basePubkey:publicKey,seed:digest(mint.toBase58()+':'+tag),newAccountPubkey:address,lamports:await connection.getMinimumBalanceForRentExemption(size),space:size,programId:PROGRAM}),createInitializeImmutableOwnerInstruction(address,PROGRAM),createInitializeAccount3Instruction(address,mint,publicKey,PROGRAM)]};}
 async function mint(id,terms,state,{immutable=false}={}){
  await network();const address=await mintAddress(id),mintSeed='mint:'+digest(id).slice(0,27);
  const size=getMintLen([ExtensionType.MetadataPointer]);
  const setup=[SystemProgram.createAccountWithSeed({fromPubkey:publicKey,basePubkey:publicKey,seed:mintSeed,newAccountPubkey:address,lamports:await connection.getMinimumBalanceForRentExemption(size+2400),space:size,programId:PROGRAM}),createInitializeMetadataPointerInstruction(address,null,address,PROGRAM),createInitializeMintInstruction(address,0,publicKey,publicKey,PROGRAM),createInitializeInstruction({programId:PROGRAM,metadata:address,updateAuthority:publicKey,mint:address,mintAuthority:publicKey,name:terms.kind==='drop'?'Mercatus · Deal collection':`Mercatus · Deal ${terms.edition}`,symbol:'MERCATUS',uri:''})];
  const proofs=[await send(id+':create',setup)];
  proofs.push(await send(id+':terms',[field(address,'terms',terms),field(address,'state',state)]));
  const custody=await custodyInstructions(address,state.holder);
  const issue=[...custody.instructions,createMintToInstruction(address,custody.address,publicKey,1,[],PROGRAM),createSetAuthorityInstruction(address,publicKey,AuthorityType.MintTokens,null,[],PROGRAM)];
  if(immutable)issue.push(createFreezeAccountInstruction(custody.address,address,publicKey,[],PROGRAM),createUpdateAuthorityInstruction({programId:PROGRAM,metadata:address,oldAuthority:publicKey,newAuthority:null}),createSetAuthorityInstruction(address,publicKey,AuthorityType.FreezeAccount,null,[],PROGRAM));
  proofs.push(await send(id+':issue',issue,{canReplaceExpired:async()=>{const current=await getMint(connection,address,'finalized',PROGRAM);return current.supply===0n&&current.decimals===0&&current.mintAuthority?.equals(publicKey);}}));
  const snapshot=await inspectExpected(address.toBase58(),state,s=>!immutable||(s.frozen&&s.updateAuthority===null&&s.freezeAuthority===null));
  return{mint:address.toBase58(),proofs,snapshot};
 }
 async function inspect(mintString,holder){await network();const address=new PublicKey(mintString);const mint=await getMint(connection,address,'finalized',PROGRAM),metadata=await getTokenMetadata(connection,address,'finalized',PROGRAM);if(!metadata)throw Error('Collectible metadata missing.');const fields=Object.fromEntries(metadata.additionalMetadata);const terms=JSON.parse(fields.terms),state=JSON.parse(fields.state);const token=await getAccount(connection,await custodyAddress(address,holder||state.holder),'finalized',PROGRAM);if(!token.owner.equals(publicKey)||!token.mint.equals(address))throw Error('Invalid custody.');return{mint:mintString,name:metadata.name,supply:mint.supply.toString(),decimals:mint.decimals,mintAuthority:mint.mintAuthority?.toBase58()||null,freezeAuthority:mint.freezeAuthority?.toBase58()||null,updateAuthority:metadata.updateAuthority?.toBase58()||null,amount:token.amount.toString(),frozen:token.isFrozen,terms,state,protocol:publicKey.toBase58(),tokenAccount:token.address.toBase58(),explorer:explorer(mintString,'address'),verifiedAt:new Date().toISOString(),cluster:'testnet'};}
 async function inspectExpected(mintString,state,check=()=>true){
  for(let attempt=0;attempt<8;attempt++){
   const snapshot=await inspect(mintString,state.holder);
   if(snapshot.supply==='1'&&snapshot.decimals===0&&snapshot.mintAuthority===null&&snapshot.amount==='1'&&JSON.stringify(snapshot.state)===JSON.stringify(state)&&check(snapshot))return snapshot;
   await pause(1200);
  }
  throw Error('Finalized transaction state could not be read back exactly. Reconciliation required.');
 }
 async function assign(key,mintString,previous,next){const mint=new PublicKey(mintString),from=await custodyAddress(mint,previous.holder),to=await custodyInstructions(mint,next.holder);const instructions=[...to.instructions];if(!from.equals(to.address))instructions.push(createTransferCheckedInstruction(from,mint,to.address,publicKey,1,0,[],PROGRAM));instructions.push(field(mint,'state',next));const proof=await send(key,instructions);return{proof,snapshot:await inspectExpected(mintString,next,s=>!s.frozen)};}
 async function reserve(key,mintString,state){const mint=new PublicKey(mintString),account=await custodyAddress(mint,state.holder);const next={...state,status:'reserved'};const proof=await send(key,[createFreezeAccountInstruction(account,mint,publicKey,[],PROGRAM),field(mint,'state',next)]);return{proof,snapshot:await inspectExpected(mintString,next,s=>s.frozen)};}
 async function redeem(key,mintString,state,receipt){const mint=new PublicKey(mintString);const next={...state,status:'redeemed',receipt};const proof=await send(key,[field(mint,'state',next),createUpdateAuthorityInstruction({programId:PROGRAM,metadata:mint,oldAuthority:publicKey,newAuthority:null}),createSetAuthorityInstruction(mint,publicKey,AuthorityType.FreezeAccount,null,[],PROGRAM)]);const snapshot=await inspectExpected(mintString,next,s=>s.updateAuthority===null&&s.freezeAuthority===null&&s.frozen);return{proof,snapshot};}
 return{mintAddress,mint,inspect,assign,reserve,redeem,network,final,address:publicKey.toBase58(),balance:()=>connection.getBalance(publicKey,'finalized'),journal:()=>Object.fromEntries(Object.entries(journal).map(([k,v])=>[k,v.proof||{signature:v.signature,confirmation:'pending'}]))};
}
