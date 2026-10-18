import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createKeyPairSignerFromBytes} from '@solana/kit';
import {x402Client} from '@x402/fetch';
import {ExactSvmScheme} from '@x402/svm/exact/client';
import {decodePaymentRequiredHeader,encodePaymentSignatureHeader} from '@x402/core/http';
import {NETWORK,USDC,PRICE} from './x402.mjs';
export async function buyIntent({resource,keyFile,requestFile,payTo}){
 const target=new URL(resource);if(!['http://localhost:4318','https://later-merchant-mcp.vercel.app'].includes(target.origin)||!/^\/api\/agent\/intents\/[a-f0-9-]{36}$/i.test(target.pathname))throw new Error('Use a Later intent resource URL.');if(!payTo)throw new Error('Supply the expected merchant recipient address.');
 const signer=await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(await readFile(keyFile,'utf8'))));
 let attempt;try{attempt=JSON.parse(await readFile(requestFile,'utf8'));if(attempt.resource!==target.origin+target.pathname||attempt.buyer!==signer.address||attempt.payTo!==payTo)throw new Error('Saved purchase belongs to another resource, buyer or recipient.');}catch(e){if(e.code!=='ENOENT')throw e;attempt={requestId:randomUUID(),resource:target.origin+target.pathname,buyer:signer.address,payTo};await writeFile(requestFile,JSON.stringify(attempt),{mode:0o600,flag:'wx'});}
 target.search='?requestId='+attempt.requestId;
 if(!attempt.paymentHeader){const challenge=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(30000)});if(challenge.status!==402)throw new Error('Expected a payment challenge; received '+challenge.status);const required=decodePaymentRequiredHeader(challenge.headers.get('PAYMENT-REQUIRED'));if(required.x402Version!==2||required.resource.url!==target.href)throw new Error('Unexpected payment resource.');
 const client=new x402Client();client.registerPolicy((_version,requirements)=>requirements.filter(r=>r.scheme==='exact'&&r.network===NETWORK&&r.asset===USDC&&r.payTo===payTo&&r.amount===PRICE&&r.maxTimeoutSeconds<=60));client.register(NETWORK,new ExactSvmScheme(signer,{rpcUrl:'https://api.devnet.solana.com'}));
 const payload=await client.createPaymentPayload(required);attempt.paymentHeader=encodePaymentSignatureHeader(payload);await writeFile(requestFile,JSON.stringify(attempt),{mode:0o600});}
 const response=await fetch(target,{redirect:'error',headers:{'PAYMENT-SIGNATURE':attempt.paymentHeader},signal:AbortSignal.timeout(60000)});const result=await response.json();attempt.lastStatus=response.status;attempt.result=result;await writeFile(requestFile,JSON.stringify(attempt),{mode:0o600});if(!response.ok)throw new Error('HTTP '+response.status+': '+(result.error||'Purchase unconfirmed. Retry the same request file.'));return{...result,requestId:attempt.requestId};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [resource,keyFile,requestFile,payTo]=process.argv.slice(2);if(!resource||!keyFile||!requestFile||!payTo)throw new Error('Usage: node outputs/agent-payments/buy.mjs <intent-url> <private-key-file> <private-request-file> <expected-recipient>');const result=await buyIntent({resource,keyFile,requestFile,payTo});console.log(JSON.stringify({intentId:result.intent.id,amount:result.payment.amount,asset:result.payment.asset,network:result.payment.network,transaction:result.payment.transaction,requestId:result.requestId,activeNow:result.activeNow}));}
