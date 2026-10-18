import {test} from 'node:test';import assert from 'node:assert/strict';import {validateDeal} from './terms.mjs';
import {Keypair,Transaction} from '@solana/web3.js';import {TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';import {createUpdateFieldInstruction} from '@solana/spl-token-metadata';
const offer=()=>({product:'P'.repeat(80),merchant:'M'.repeat(60),priceCents:100000,quantity:5,rewardCents:99999,expiresAt:new Date(Date.now()+86400000).toISOString()});
test('Reject invalid amounts, expiry, oversized metadata and quantities',()=>{for(const change of [{priceCents:1.5},{priceCents:0},{quantity:6},{quantity:-1},{rewardCents:100000},{expiresAt:'invalid'},{expiresAt:new Date(0).toISOString()},{product:'🎉'.repeat(40)},{owner:'other'}])assert.throws(()=>validateDeal({...offer(),...change}));assert.equal(validateDeal(offer()).quantity,5);});
test('Maximum merchant terms fit in a signed Solana metadata transaction',()=>{
 const signer=Keypair.generate(),mint=Keypair.generate().publicKey,{quantity,...deal}=validateDeal(offer());
 const terms={kind:'drop',...deal,art:{sha256:'a'.repeat(64),mediaType:'image/png'},currency:'USD',creator:'b'.repeat(32),mints:Array.from({length:quantity},()=>Keypair.generate().publicKey.toBase58())};
 const tx=new Transaction({feePayer:signer.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()});for(const [field,value] of Object.entries({terms,state:{holder:'protocol',status:'manifest'}}))tx.add(createUpdateFieldInstruction({programId:TOKEN_2022_PROGRAM_ID,metadata:mint,updateAuthority:signer.publicKey,field,value:JSON.stringify(value)}));tx.sign(signer);assert.ok(tx.serialize().length<=1232);
});
