import {createHmac} from 'node:crypto';
import {host} from '../visa-sandbox/visa.mjs';

export const indexingDelay=300_000, maxAttempts=5;
export function buildTransactionDetailsRequest(id,config,date=new Date().toUTCString()) {
 if(!/^\d{1,60}$/.test(id||''))throw new Error('Invalid sandbox transaction ID');
 if(!/^[A-Za-z0-9_-]+$/.test(config.merchant||'')||!/^[A-Za-z0-9_-]+$/.test(config.key||'')||!/^[A-Za-z0-9+/]+={0,2}$/.test(config.secret||''))throw new Error('Missing sandbox configuration');
 const path='/tss/v2/transactions/'+id;
 const canonical=`host: ${host}\nv-c-date: ${date}\n(request-target): get ${path}\nv-c-merchant-id: ${config.merchant}`;
 const signature=createHmac('sha256',Buffer.from(config.secret,'base64')).update(canonical).digest('base64');
 return {url:`https://${host}${path}`,options:{method:'GET',redirect:'error',headers:{host,'v-c-date':date,'v-c-merchant-id':config.merchant,signature:`keyid="${config.key}", algorithm="HmacSHA256", headers="host v-c-date (request-target) v-c-merchant-id", signature="${signature}"`,Accept:'application/hal+json'},signal:AbortSignal.timeout(30_000)}};
}
const cents=value=>typeof value==='string'&&/^\d+\.\d{2}$/.test(value)?Math.round(Number(value)*100):null;
export function matchesTransaction(cart,record,merchant) {
 const amount=record?.orderInformation?.amountDetails;
 return cart.synthetic!==true&&cart.environment==='visa-acceptance-sandbox'&&cart.clientReference==='later-'+cart.id&&
  record?.id===cart.authorizationId&&record?.merchantId===merchant&&record?.clientReferenceInformation?.code===cart.clientReference&&
  amount?.currency===cart.currency&&cents(amount?.totalAmount)===cart.amount&&cents(amount?.authorizedAmount)===cart.amount&&
  record?.applicationInformation?.applications?.some(x=>x.name==='ics_auth'&&String(x.reasonCode)==='100'&&x.rFlag==='SOK')===true;
}
export function receiptDue(cart,now=Date.now()) {
 if(cart.synthetic===true||cart.environment!=='visa-acceptance-sandbox'||!/^\d{1,60}$/.test(cart.authorizationId||'')||cart.authorizedAmount!==cart.amount||cart.clientReference!=='later-'+cart.id)return false;
 const receipt=cart.visaReceipt;
 if(receipt&&receipt.status!=='pending')return false;
 if((receipt?.attempts||0)>=maxAttempts)return false;
 const due=receipt?.nextCheckAt?Date.parse(receipt.nextCheckAt):Date.parse(cart.authorizedAt||cart.createdAt)+indexingDelay;
 return Number.isFinite(due)&&due<=now;
}
// No payment/card/billing fields from the remote record are returned or persisted.
export async function reconcileVisaReceipt(cart,config,{fetchImpl=fetch,now=Date.now()}={}) {
 if(!receiptDue(cart,now))return false;
 const attempts=(cart.visaReceipt?.attempts||0)+1,checkedAt=new Date(now).toISOString();
 const pending={status:attempts>=maxAttempts?'unavailable':'pending',attempts,checkedAt,nextCheckAt:new Date(now+indexingDelay).toISOString()};
 try {
  const {url,options}=buildTransactionDetailsRequest(cart.authorizationId,config),response=await fetchImpl(url,options);
  if(response.status===404||response.status===429||response.status>=500){cart.visaReceipt=pending;return true;}
  if(!response.ok){cart.visaReceipt={status:'unavailable',attempts,checkedAt};return true;}
  const record=await response.json(),matched=matchesTransaction(cart,record,config.merchant);
  cart.visaReceipt={status:matched?'matched':'mismatch',attempts,checkedAt};
  // A mismatch quarantines the intent but retains its authorization for manual resolution.
  if(!matched){cart.status='needs_review';cart.message='The Visa transaction record did not match this commitment. Check the sandbox portal.';}
 }catch{cart.visaReceipt=pending;}
 return true;
}
