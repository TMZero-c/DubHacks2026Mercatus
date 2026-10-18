import {createHmac} from 'node:crypto';
import {signedPost,validateSandboxCard} from '../visa-sandbox/visa.mjs';

export async function identifySandboxCard(card,config,{fetchImpl=fetch}={}) {
 const {number}=validateSandboxCard(card);
 const {url,options}=signedPost('/tms/v1/instrumentidentifiers',{card:{number}},config);
 const response=await fetchImpl(url,options);
 if(!response.ok)throw new Error('Visa sandbox card tokenization was not confirmed.');
 const data=await response.json();
 if(data.object!=='instrumentIdentifier'||data.state!=='ACTIVE'||!/^[-A-Za-z0-9]{1,100}$/.test(data.id||''))throw new Error('Visa sandbox card tokenization was not confirmed.');
 // Raw TMS identifiers are payment resources. Never persist or expose them.
 return createHmac('sha256',Buffer.from(config.secret,'base64')).update('later-card-identity-v1\0'+config.merchant+'\0'+data.id).digest('hex');
}
export function demandKey(cardIdentity,cart) {
 if(!/^[a-f0-9]{64}$/.test(cardIdentity||''))throw new Error('Missing private card identity');
 // Basket order and URLs do not change demand; quantities and exact variants do.
 const items=cart.items.map(({name,variant,quantity})=>({name:name.trim().toLowerCase(),variant:variant.trim().toLowerCase(),quantity})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return createHmac('sha256',Buffer.from(cardIdentity,'hex')).update(JSON.stringify({v:1,currency:cart.currency,items})).digest('hex');
}
export function duplicateDemand(carts,key) {
 return Object.values(carts).some(c=>c.privateDemandKey===key&&['authorizing','authorized','reversing','needs_review'].includes(c.status));
}
