import {createCipheriv,createDecipheriv,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {chmod,lstat,mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {signedPost,signedDelete,storedPaymentInstrument,validateBilling,validateSandboxCard} from '../visa-sandbox/visa.mjs';

// TMS payment instruments are merchant-scoped vault references, not network
// credentials that another merchant (or Amazon) can spend.
// Official APIs: https://developer.visaacceptance.com/docs/vas/en-us/tms/developer/all/rest/tms.html
const queues=new Map(),tokenId=/^[-A-Za-z0-9]{1,100}$/,localId=/^[a-f0-9-]{36}$/;
const statuses=new Set(['identifier_pending','identifier_ready','instrument_pending','active','delete_pending','review_required']);
export class CardVaultError extends Error{
 constructor(code,message,diagnostics=null){
  super(message);this.name='CardVaultError';this.code=code;
  // Available to the server operator only. JSON serialization and the browser's
  // generic error response must never include provider diagnostics.
  if(diagnostics)Object.defineProperty(this,'diagnostics',{value:Object.freeze(diagnostics),enumerable:false});
 }
}
function fail(code,message,diagnostics){return new CardVaultError(code,message,diagnostics);}
const diagnosticFields=new Set(['card','card.number','card.expirationMonth','card.expirationYear','card.type','instrumentIdentifier','instrumentIdentifier.id','billTo',...['firstName','lastName','address1','address2','locality','administrativeArea','postalCode','country','email','company','phoneNumber'].map(field=>'billTo.'+field)]);
function safeCode(value){return typeof value==='string'&&/^[A-Z]+(?:_[A-Z]+){1,8}$/.test(value)&&value.length<=80?value:null;}
async function diagnostics(path,response){
 // Never retain a raw response, message, token ID, field value, or request body.
 const safePath=path.startsWith('/tms/v1/paymentinstruments/')?'/tms/v1/paymentinstruments/{id}':path;
 const result={path:safePath};
 if(Number.isInteger(response?.status)&&response.status>=100&&response.status<=599)result.httpStatus=response.status;
 let body;try{body=await response?.json();}catch{}
 if(body&&typeof body==='object'){
  const reason=safeCode(body.errorInformation?.reason)||safeCode(body.reason)||safeCode(body.code)||safeCode(body.status);
  if(reason)result.reason=reason;
  const reasonCode=String(body.errorInformation?.reasonCode||body.reasonCode||'');if(/^\d{1,3}$/.test(reasonCode))result.reasonCode=reasonCode;
  const details=body.errorInformation?.details||body.details||body.errors;
  if(Array.isArray(details)){
   const fields=[...new Set(details.slice(0,50).map(detail=>detail?.field||detail?.fieldName).filter(field=>diagnosticFields.has(field)))];
   if(fields.length)result.fields=Object.freeze(fields);
  }
 }
 return result;
}
function ownerValue(owner){
 if(typeof owner!=='string'||owner.length<16||owner.length>512)throw fail('INVALID_OWNER','A private card owner is required.');return owner;
}
function safeCard(record){return{id:record.id,brand:'Visa',last4:record.last4,expirationMonth:record.expirationMonth,expirationYear:record.expirationYear};}
async function noSymlink(path){try{if((await lstat(path)).isSymbolicLink())throw fail('VAULT_STORAGE','Private card storage cannot use symbolic links.');}catch(error){if(error.code!=='ENOENT')throw error;}}
async function atomicWrite(path,data){
 await noSymlink(path);
 const temporary=path+'.'+randomUUID()+'.tmp';let file;
 try{
  file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await file.writeFile(data);await file.sync();await file.close();file=null;
  await rename(temporary,path);await chmod(path,0o600);
 }finally{if(file)await file.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function acquireLock(path){
 for(let attempt=0;attempt<400;attempt++){
  try{
   const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   await file.writeFile(JSON.stringify({pid:process.pid}));await file.close();
   return async()=>{await unlink(path);};
  }catch(error){
   if(error.code!=='EEXIST')throw error;
   await noSymlink(path);
   // A crashed process must not leave the vault locked forever. Never break a
   // lock belonging to a live process, even when its network request is slow.
   let pid;try{pid=JSON.parse(await readFile(path,'utf8')).pid;}catch(readError){if(readError.code==='ENOENT')continue;}
   if(Number.isInteger(pid)&&pid>0){try{process.kill(pid,0);}catch(processError){if(processError.code==='ESRCH'){await unlink(path).catch(e=>{if(e.code!=='ENOENT')throw e;});continue;}}}
   await delay(100);
  }
 }
 throw fail('VAULT_BUSY','Saved cards are busy. Please try again.');
}
async function loadKey(path,statePath){
 await noSymlink(path);
 try{
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let key;
  try{key=Buffer.from((await file.readFile('utf8')).trim(),'base64');}finally{await file.close();}
  if(key.length!==32)throw fail('VAULT_STORAGE','Private card storage is unavailable.');
  await chmod(path,0o600);return key;
 }catch(error){
  if(error.code!=='ENOENT')throw error;
  try{await lstat(statePath);throw fail('VAULT_STORAGE','The saved-card encryption key is missing.');}catch(stateError){if(stateError.code!=='ENOENT')throw stateError;}
  const key=randomBytes(32),file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(key.toString('base64')+'\n');await file.sync();}finally{await file.close();}return key;
 }
}
function associatedData(config){return Buffer.from('later-card-vault-v1\0'+config.merchant);}
async function readState(path,key,config){
 await noSymlink(path);
 let encoded;try{encoded=await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return{version:1,cards:[]};throw error;}
 try{
  const envelope=JSON.parse(encoded);
  if(envelope.version!==1||!['iv','tag','data'].every(field=>typeof envelope[field]==='string'))throw new Error();
  const iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');if(iv.length!==12||tag.length!==16)throw new Error();
  const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(associatedData(config));decipher.setAuthTag(tag);
  const state=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString('utf8'));
  if(state.version!==1||!Array.isArray(state.cards)||state.cards.length>10000)throw new Error();
  for(const card of state.cards){
   if(!localId.test(card.id)||!/^\d{4}$/.test(card.last4)||!/^\d{2}$/.test(card.expirationMonth)||!/^20\d{2}$/.test(card.expirationYear)||!statuses.has(card.status)||!/^[a-f0-9]{64}$/.test(card.ownerKey)||!/^[a-f0-9]{64}$/.test(card.fingerprint))throw new Error();
   for(const field of ['instrumentIdentifierId','paymentInstrumentId'])if(card[field]&&!tokenId.test(card[field]))throw new Error();
  }
  return state;
 }catch{throw fail('VAULT_STORAGE','Saved-card data could not be authenticated.');}
}
async function writeState(path,key,config,state){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(associatedData(config));
 const data=Buffer.concat([cipher.update(JSON.stringify(state),'utf8'),cipher.final()]);
 await atomicWrite(path,JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')})+'\n');
 // Persist the rename, not only the encrypted file contents.
 const directory=await open(resolve(path,'..'),constants.O_RDONLY);try{await directory.sync();}finally{await directory.close();}
}
function privateHmac(key,domain,value){return createHmac('sha256',key).update(domain+'\0'+value).digest('hex');}
async function tokenPost(path,data,config,fetchImpl){
 const request=signedPost(path,data,config);let response;
 try{response=await fetchImpl(request.url,request.options);}catch{throw fail('TMS_UNCERTAIN','Visa did not confirm card saving. No automatic retry was made.',await diagnostics(path));}
 if(!response.ok){
  const known=[400,401,403,404,405,415,422].includes(response.status);
  throw fail(known?'TMS_REJECTED':'TMS_UNCERTAIN',known?'Visa could not save this card.':'Visa did not confirm card saving. No automatic retry was made.',await diagnostics(path,response));
 }
 try{return await response.json();}catch{throw fail('TMS_UNCERTAIN','Visa did not confirm card saving. No automatic retry was made.',{path,httpStatus:response.status});}
}

export function createCardVault({directory,config,fetchImpl=fetch}){
 if(typeof directory!=='string'||!directory.trim())throw fail('VAULT_STORAGE','Private card storage is required.');
 if(!config?.merchant||!config?.key||!config?.secret)throw fail('VAULT_CONFIGURATION','Visa sandbox credentials are required.');
 const folder=resolve(directory),statePath=join(folder,'cards.enc'),keyPath=join(folder,'vault.key'),lockPath=join(folder,'vault.lock');
 async function transact(operation){
  const previous=queues.get(folder)||Promise.resolve();
  const current=previous.catch(()=>{}).then(async()=>{
   await noSymlink(folder);await mkdir(folder,{recursive:true,mode:0o700});await chmod(folder,0o700);
   const release=await acquireLock(lockPath);
   try{
    const key=await loadKey(keyPath,statePath),state=await readState(statePath,key,config);
    const persist=()=>writeState(statePath,key,config,state);
    return await operation({key,state,persist});
   }finally{await release();}
  });
  queues.set(folder,current);try{return await current;}finally{if(queues.get(folder)===current)queues.delete(folder);}
 }
 function owned(state,key,owner,id){
  const ownerKey=privateHmac(key,'later-vault-owner-v1',ownerValue(owner));
  const card=state.cards.find(record=>record.id===id&&record.ownerKey===ownerKey);
  if(!card)throw fail('CARD_NOT_FOUND','Saved card was not found.');return card;
 }
 return Object.freeze({
  async register(owner,input,billTo,{consent=false}={}){
   ownerValue(owner);if(consent!==true)throw fail('SAVE_CONSENT_REQUIRED','Choose whether to save this card before continuing.');
   const card=validateSandboxCard(input),billing=validateBilling(billTo);
   return transact(async({key,state,persist})=>{
    const ownerKey=privateHmac(key,'later-vault-owner-v1',owner),fingerprint=privateHmac(key,'later-vault-card-v1',owner+'\0'+card.number+'\0'+card.expirationMonth+'\0'+card.expirationYear);
    let record=state.cards.find(entry=>entry.ownerKey===ownerKey&&entry.fingerprint===fingerprint);
    if(record?.status==='active')return safeCard(record);
    if(record&&record.status!=='identifier_ready')throw fail('TMS_REVIEW_REQUIRED','The previous card-saving request needs reconciliation before it can be retried.');
    if(!record){
     if(state.cards.filter(entry=>entry.ownerKey===ownerKey).length>=10||state.cards.length>=10000)throw fail('CARD_LIMIT','Remove a saved card before adding another.');
     record={id:randomUUID(),ownerKey,fingerprint,last4:card.number.slice(-4),expirationMonth:card.expirationMonth,expirationYear:card.expirationYear,status:'identifier_pending',createdAt:new Date().toISOString()};
     state.cards.push(record);await persist();
     try{
      // Never send CVV to a vault API and never store PAN, CVV, or billing data.
      const result=await tokenPost('/tms/v1/instrumentidentifiers',{card:{number:card.number}},config,fetchImpl);
      if(!tokenId.test(result?.id||'')||result.object!=='instrumentIdentifier'||result.state!=='ACTIVE')throw fail('TMS_UNCERTAIN','Visa did not confirm card saving. No automatic retry was made.');
      record.instrumentIdentifierId=result.id;record.status='identifier_ready';await persist();
     }catch(error){
      if(error.code==='TMS_REJECTED')state.cards.splice(state.cards.indexOf(record),1);
      else record.status='review_required';
      await persist();throw error;
     }
    }
    record.status='instrument_pending';await persist();
    try{
     // TMS uses the textual brand, unlike Payments' numeric card type codes.
     // https://developer.visaacceptance.com/docs/cybs/en-us/tms/developer/ctv/rest/tms/tms-pi-tkn/tms-pi-tkn-create-intro/tms-pi-tkn-create-ex-rest.html
     const result=await tokenPost('/tms/v1/paymentinstruments',{card:{expirationMonth:card.expirationMonth,expirationYear:card.expirationYear,type:'visa'},billTo:billing,instrumentIdentifier:{id:record.instrumentIdentifierId}},config,fetchImpl);
     if(tokenId.test(result?.id||''))record.paymentInstrumentId=result.id;
     if(!record.paymentInstrumentId||result.object!=='paymentInstrument'||result.state!=='ACTIVE')throw fail('TMS_UNCERTAIN','Visa did not confirm card saving. No automatic retry was made.');
     record.status='active';await persist();return safeCard(record);
    }catch(error){
     record.status=error.code==='TMS_REJECTED'?'identifier_ready':'review_required';await persist();throw error;
    }
   });
  },
  async list(owner){
   ownerValue(owner);return transact(async({key,state})=>{const ownerKey=privateHmac(key,'later-vault-owner-v1',owner);return state.cards.filter(card=>card.ownerKey===ownerKey&&card.status==='active').map(safeCard);});
  },
  async payment(owner,id){
   ownerValue(owner);return transact(async({key,state})=>{const card=owned(state,key,owner,id);if(card.status!=='active')throw fail('CARD_UNAVAILABLE','This saved card needs reconciliation.');return storedPaymentInstrument(card.paymentInstrumentId);});
  },
  async identity(owner,id){
   ownerValue(owner);return transact(async({key,state})=>{const card=owned(state,key,owner,id);if(card.status!=='active')throw fail('CARD_UNAVAILABLE','This saved card needs reconciliation.');return createHmac('sha256',Buffer.from(config.secret,'base64')).update('later-card-identity-v1\0'+config.merchant+'\0'+card.instrumentIdentifierId).digest('hex');});
  },
  async remove(owner,id){
   ownerValue(owner);return transact(async({key,state,persist})=>{
    const card=owned(state,key,owner,id);
    if(!card.paymentInstrumentId)throw fail('TMS_REVIEW_REQUIRED','Visa card saving needs reconciliation before removal.');
    card.status='delete_pending';await persist();
    const request=signedDelete('/tms/v1/paymentinstruments/'+card.paymentInstrumentId,config);let response;
    try{response=await fetchImpl(request.url,request.options);}catch{throw fail('TMS_DELETE_UNCERTAIN','Visa did not confirm card removal. The card is disabled locally.',await diagnostics('/tms/v1/paymentinstruments/{id}'));}
    if(response.status!==204)throw fail('TMS_DELETE_UNCERTAIN','Visa did not confirm card removal. The card is disabled locally.',await diagnostics('/tms/v1/paymentinstruments/{id}',response));
    state.cards.splice(state.cards.indexOf(card),1);await persist();return{removed:true,id};
   });
  }
 });
}
