import {Connection} from '@solana/web3.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let queue=Promise.resolve(),lastRequest=0;
// Bound public-RPC traffic and retry rate limits with identical request bytes.
// In particular, sendTransaction retries retain the original signed transaction.
export function testnetConnection(){
 return new Connection('https://api.testnet.solana.com',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,options)=>{
  const operation=queue.then(async()=>{
   for(let attempt=0;attempt<6;attempt++){
    await pause(Math.max(0,500-(Date.now()-lastRequest)));lastRequest=Date.now();
    const response=await fetch(url,options);
    if(response.status!==429||attempt===5)return response;
    await response.text();await pause(Math.min(20000,2000*2**attempt));
   }
  });queue=operation.then(()=>{},()=>{});return operation;
 }});
}
