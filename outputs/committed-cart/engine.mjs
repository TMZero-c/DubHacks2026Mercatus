import {createHash,randomUUID} from 'node:crypto';
export function validateCart(body,now=Date.now()){
 if(body.consent!==true)throw new Error('Confirm the sandbox authorization terms.');
 if(!Array.isArray(body.items)||body.items.length<1||body.items.length>8)throw new Error('Add between 1 and 8 items.');
 const items=body.items.map(x=>{const name=String(x.name||'').trim(),variant=String(x.variant||'').trim();if(!name||!variant||name.length>180||variant.length>180)throw new Error('Each item needs a name and exact variant/model.');const quantity=Number(x.quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>10)throw new Error('Quantity must be 1–10.');if(!/^\d{1,3}(\.\d{1,2})?$/.test(String(x.price)))throw new Error('Enter a valid USD unit price.');const cents=Math.round(Number(x.price)*100);if(cents<=0)throw new Error('Unit price must be positive.');let url='';if(x.url){const u=new URL(x.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('Use a public product URL.');url=u.href;if(url.length>1000)throw new Error('Product URL is too long.');}return{name,variant,quantity,cents,url};});
 const amount=items.reduce((n,x)=>n+x.cents*x.quantity,0);if(amount<1||amount>50000)throw new Error('Sandbox cart total must be $0.01–$500.00.');
 const hours=Number(body.hours);if(![.25,1,12].includes(hours))throw new Error('Choose a supported commitment duration.');
 const sellers=String(body.sellers||'').trim();if(!sellers||sellers.length>300)throw new Error('Specify acceptable sellers.');
 const deliveryDate=String(body.deliveryDate||'');const deadline=new Date(deliveryDate+'T23:59:59Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)||!Number.isFinite(+deadline)||deadline.toISOString().slice(0,10)!==deliveryDate||+deadline<now)throw new Error('Choose a future delivery date.');
 const snapshot={published:body.publish===true,items,amount,currency:'USD',condition:'New only',sellers,deliveryDate,expiresAt:new Date(now+hours*3600000).toISOString(),purchaseApproval:'Required separately; no automatic purchase',environment:'visa-acceptance-sandbox'};
 return {...snapshot,digest:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),id:randomUUID(),createdAt:new Date(now).toISOString(),status:'authorizing'};
}
export function hasAuthorization(cart){return cart.synthetic!==true&&cart.environment==='visa-acceptance-sandbox'&&/^\d{1,60}$/.test(cart.authorizationId||'')&&cart.visaStatus==='AUTHORIZED'&&cart.authorizedAmount===cart.amount;}
export function verify(cart,now=Date.now()){
 const backed=hasAuthorization(cart),active=backed&&cart.status==='authorized'&&Date.parse(cart.expiresAt)>now;
 return{commitmentId:cart.id,environment:cart.environment,status:cart.status,acceptingOffers:active&&cart.published===true&&!cart.selectedOfferId,active,amount:cart.amount,currency:cart.currency,expiresAt:cart.expiresAt,snapshotHash:cart.digest,authorizationId:backed?cart.authorizationId:null,paymentBacking:backed?'Visa Acceptance sandbox authorization confirmed; no real funds reserved':'No confirmed Visa authorization',purchaseApproval:'Required separately; no automatic purchase'};
}
export async function authorize(cart,pay){try{const result=await pay('authorize',(cart.amount/100).toFixed(2));cart.authorizationId=result.id||null;const amount=Number(result.orderInformation?.amountDetails?.authorizedAmount);cart.authorizedAmount=Number.isFinite(amount)?Math.round(amount*100):null;if(result.status==='AUTHORIZED'&&/^\d{1,60}$/.test(cart.authorizationId||'')&&cart.authorizedAmount===cart.amount){cart.status='authorized';cart.authorizedAt=new Date().toISOString();}else{cart.status=result.status==='DECLINED'?'declined':'needs_review';cart.message='Authorization was not approved for the exact full amount. Check the sandbox portal before continuing.';}cart.visaStatus=result.status||'UNKNOWN';}catch{cart.status='needs_review';cart.message='Authorization outcome is uncertain. Check the sandbox portal; do not retry automatically.';}return cart;}
export async function release(cart,pay){if(cart.status!=='authorized')throw new Error('Only an approved authorization can be released here.');cart.status='reversing';try{const result=await pay('reverse',(cart.amount/100).toFixed(2),cart.authorizationId);cart.reversalId=result.id||null;cart.visaStatus=result.status||'UNKNOWN';cart.status=result.status==='REVERSED'?'released':'needs_review';if(cart.status==='released')cart.releasedAt=new Date().toISOString();else cart.message='Reversal not confirmed. Check the sandbox portal.';}catch{cart.status='needs_review';cart.message='Reversal outcome uncertain. Check the sandbox portal before any retry.';}return cart;}
export function validateOffer(cart,body,now=Date.now()) {
 if(!verify(cart,now).active||!cart.published||cart.selectedOfferId)throw new Error('This intent is not open for offers.');
 const merchant=String(body.merchant||'').trim(),returns=String(body.returns||'').trim();
 if(merchant.length<2||merchant.length>100)throw new Error('Enter a merchant name.');
 if(!/^\d{1,3}(\.\d{1,2})?$/.test(String(body.price)))throw new Error('Enter an all-in offer price.');
 const amount=Math.round(Number(body.price)*100);if(amount<=0||amount>cart.amount)throw new Error('Offer must be positive and within the cart budget.');
 const deliveryDate=String(body.deliveryDate||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)||!Number.isFinite(Date.parse(deliveryDate))||new Date(deliveryDate).toISOString().slice(0,10)!==deliveryDate||deliveryDate>cart.deliveryDate||Date.parse(deliveryDate+'T23:59:59Z')<now)throw new Error('Delivery must meet the shopper deadline.');
 if(returns.length<3||returns.length>500)throw new Error('Describe your return terms.');
 if(body.exactMatch!==true||body.conditionsAccepted!==true)throw new Error('Confirm exact items and shopper conditions.');
 const minutes=Number(body.minutes);if(![15,60,240].includes(minutes))throw new Error('Choose an offer duration.');
 return{id:randomUUID(),merchant,amount,currency:'USD',deliveryDate,returns,createdAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+minutes*60000,Date.parse(cart.expiresAt))).toISOString(),snapshotHash:cart.digest,exactMatch:true,conditionsAccepted:true,merchantIdentity:'Self-declared local demo; not verified',status:'submitted'};
}
export function selectOffer(cart,offerId,now=Date.now()){
 if(!verify(cart,now).active||cart.selectedOfferId)throw new Error('Intent is expired, released, or already selected.');
 const offer=(cart.offers||[]).find(o=>o.id===offerId);if(!offer||Date.parse(offer.expiresAt)<=now||offer.snapshotHash!==cart.digest)throw new Error('Offer is unavailable or expired.');
 cart.selectedOfferId=offer.id;cart.selectedAt=new Date(now).toISOString();return cart;
}
