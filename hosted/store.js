import {get,put,BlobNotFoundError,BlobPreconditionFailedError} from '@vercel/blob';
import {newMerchantState} from '../outputs/committed-cart/merchant-engine.mjs';
const pathname='merchant/workspace-v1.json';
export function createStore(io={get,put}){
 async function read(){try{const result=await io.get(pathname,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});if(!result)return{data:{version:1,merchant:newMerchantState(),carts:{}},etag:null};if(result.statusCode!==200)throw new Error('Unexpected storage response');return{data:JSON.parse(await new Response(result.stream).text()),etag:result.blob.etag};}catch(e){if(e instanceof BlobNotFoundError)return{data:{version:1,merchant:newMerchantState(),carts:{}},etag:null};throw e;}}
 async function transaction(operation){for(let attempt=0;attempt<5;attempt++){const {data,etag}=await read();const before=JSON.stringify(data),result=operation(data);if(JSON.stringify(data)===before)return result;try{await io.put(pathname,JSON.stringify(data),{access:'private',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:60});return result;}catch(e){if(e instanceof BlobPreconditionFailedError||e.name==='BlobConflictError'||e.message?.includes('already exists'))continue;throw e;}}throw new Error('Workspace changed concurrently; retry this request.');}
 return{read,transaction};
}
export const store=createStore();
