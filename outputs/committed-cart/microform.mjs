import {createPublicKey,verify as verifySignature} from 'node:crypto';
import {signedPost} from '../visa-sandbox/visa.mjs';
export async function createMicroformSession(config,origin='http://localhost:4318'){
 const r=signedPost('/microform/v2/sessions',{targetOrigins:[origin],clientVersion:'v2.0',allowedCardNetworks:['VISA'],transientTokenResponseOptions:{includeCardPrefix:false}},config);
 const response=await fetch(r.url,r.options);if(!response.ok)throw new Error('Visa hosted card entry unavailable. Check Microform access in your sandbox account.');
 const captureContext=await response.text();const payload=JSON.parse(Buffer.from(captureContext.split('.')[1],'base64url'));const data=payload.ctx?.[0]?.data;
 const library=new URL(data?.clientLibrary);if(library.origin!=='https://testflex.cybersource.com'||!data.clientLibraryIntegrity?.startsWith('sha256-')||!payload.flx?.jwk||payload.exp*1000<=Date.now())throw new Error('Invalid sandbox hosted-fields configuration');
 return{captureContext,clientLibrary:library.href,clientLibraryIntegrity:data.clientLibraryIntegrity,expiresAt:payload.exp*1000,jwk:payload.flx.jwk};
}
export function validateTransientToken(token,session,now=Date.now()){
 if(!session||session.expiresAt<=now||typeof token!=='string'||token.length>12000)throw new Error('Card session expired. Reload the secure fields.');
 const parts=token.split('.');if(parts.length!==3)throw new Error('Invalid card token');
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 if(header.alg!=='RS256'||!Number.isFinite(claims.exp)||claims.exp*1000<=now||!verifySignature('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key:session.jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw new Error('Card token could not be verified. Reload secure fields.');
 return token;
}
