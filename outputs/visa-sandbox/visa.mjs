import {createHash,createHmac,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
const envPath=fileURLToPath(new URL('.env',import.meta.url));
export const host='apitest.visaacceptance.com'; // Intentionally no production switch.
export function buildRequest(action,amount,id,config,date=new Date().toUTCString(),payment=null,billing=null,reference=null) {
 if(!/^\d{1,3}\.\d{2}$/.test(amount)||Number(amount)<=0||Number(amount)>500)throw new Error('Use a sandbox amount from 0.01 to 500.00');
 if(!['authorize','capture','reverse'].includes(action))throw new Error('Unknown operation');
 if(action!=='authorize'&&!/^\d{1,60}$/.test(id||''))throw new Error('Supply the sandbox authorization transaction ID');
 for(const name of ['merchant','key','secret'])if(!config[name])throw new Error('Missing sandbox configuration');
 if(!/^[A-Za-z0-9_-]+$/.test(config.merchant)||!/^[A-Za-z0-9_-]+$/.test(config.key))throw new Error('Invalid merchant ID or key ID format');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(config.secret))throw new Error('Shared secret must be Base64');
 const path=action==='authorize'?'/pts/v2/payments':`/pts/v2/payments/${id}/${action==='capture'?'captures':'reversals'}`;
 if(reference!==null&&!/^[A-Za-z0-9_.:-]{1,50}$/.test(reference))throw new Error('Invalid payment reference');
 const data={clientReferenceInformation:{code:reference||'later-'+randomUUID()},orderInformation:{amountDetails:{totalAmount:amount,currency:'USD'}}};
 if(action==='authorize'){
  if(!payment)throw new Error('A Visa Microform token or explicitly entered sandbox card is required.');
  data.processingInformation={capture:false};
  if(typeof payment==='string'&&payment.trim())data.tokenInformation={transientTokenJwt:payment};
  else data.paymentInformation={card:validateSandboxCard(payment)};
  data.orderInformation.billTo=validateBilling(billing);
 }
 return signedPost(path,data,config,date);
}
export function validateSandboxCard(value){
 const card={number:String(value?.number||'').replace(/\s/g,''),expirationMonth:String(value?.expirationMonth||'').padStart(2,'0'),expirationYear:String(value?.expirationYear||''),securityCode:String(value?.securityCode||'')};
 if(!/^4\d{12}(?:\d{3})?(?:\d{3})?$/.test(card.number)||!/^\d{3}$/.test(card.securityCode)||!/^(0[1-9]|1[0-2])$/.test(card.expirationMonth)||!/^20\d{2}$/.test(card.expirationYear)||new Date(+card.expirationYear,+card.expirationMonth,1)<=new Date())throw new Error('Enter a valid Visa sandbox card, CVV, and future expiry.');
 const sum=[...card.number].reverse().reduce((total,c,i)=>{let n=Number(c);if(i%2){n*=2;if(n>9)n-=9;}return total+n;},0);if(sum%10)throw new Error('Check the sandbox card number.');return card;
}
export function validateBilling(value){
 const result={};for(const field of ['firstName','lastName','address1','locality','administrativeArea','postalCode','country','email']){
  const text=typeof value?.[field]==='string'?value[field].trim():'';
  if(!text||text.length>150)throw new Error('Enter your billing '+field+'.');result[field]=text;
 }
 if(!/^[A-Z]{2}$/.test(result.country)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw new Error('Enter a valid billing email and two-letter country code.');
 return result;
}
export function signedPost(path,data,config,date=new Date().toUTCString()){
 if(!['/microform/v2/sessions','/pts/v2/payments','/tms/v1/instrumentidentifiers'].includes(path)&&!/^\/pts\/v2\/payments\/\d{1,60}\/(captures|reversals)$/.test(path))throw new Error('Invalid sandbox endpoint');
 const body=JSON.stringify(data),digest='SHA-256='+createHash('sha256').update(body).digest('base64');
 const fields=['host','v-c-date','(request-target)','digest','v-c-merchant-id'];
 const canonical=`host: ${host}\nv-c-date: ${date}\n(request-target): post ${path}\ndigest: ${digest}\nv-c-merchant-id: ${config.merchant}`;
 const signature=createHmac('sha256',Buffer.from(config.secret,'base64')).update(canonical).digest('base64');
 return {url:`https://${host}${path}`,options:{method:'POST',redirect:'error',headers:{host,'v-c-date':date,'v-c-merchant-id':config.merchant,digest,signature:`keyid="${config.key}", algorithm="HmacSHA256", headers="${fields.join(' ')}", signature="${signature}"`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(30000)}};
}
async function main(){
 if(existsSync(envPath))process.loadEnvFile(envPath);
 const config={merchant:process.env.VISA_MERCHANT_ID,key:process.env.VISA_KEY_ID,secret:process.env.VISA_SHARED_SECRET};
 const [action='doctor',amount='180.00',id]=process.argv.slice(2);
 if(action==='doctor'){for(const [name,value]of Object.entries(config))console.log(`${name}: ${value?'configured':'MISSING'}`);console.log('Endpoint: '+host+' (sandbox only)');console.log('No request sent.');return}
 const {url,options}=buildRequest(action,amount,id,config);
 const response=await fetch(url,options);
 let result;try{result=await response.json()}catch{throw new Error(`Sandbox returned HTTP ${response.status}, without JSON. No automatic retry.`)}
 // Deliberately print only an allowlist; never dump payment data or credentials.
 console.log(JSON.stringify({environment:'sandbox',httpStatus:response.status,id:result.id,status:result.status,reason:result.errorInformation?.reason,invalidFields:result.errorInformation?.details?.map(x=>x.field),amount:result.orderInformation?.amountDetails},null,2));
 if(!response.ok||result.errorInformation)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Request failed. Check local configuration, operation, transaction ID, and network connectivity. No automatic retry; check the sandbox portal for uncertain outcomes.');process.exitCode=1});
