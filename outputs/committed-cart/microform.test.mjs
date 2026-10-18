import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {validateTransientToken} from './microform.mjs';
import {buildRequest} from '../visa-sandbox/visa.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const prefix=encode({alg:'RS256'})+'.'+encode({exp:Math.floor(Date.now()/1000)+60});const token=prefix+'.'+sign('RSA-SHA256',Buffer.from(prefix),privateKey).toString('base64url');const session={expiresAt:Date.now()+60000,jwk:publicKey.export({format:'jwk'})};
assert.equal(validateTransientToken(token,session),token);assert.throws(()=>validateTransientToken(token,{...session,expiresAt:0}));assert.throws(()=>validateTransientToken(token.slice(0,-5)+'abcde',session));assert.throws(()=>validateTransientToken(token,null));
const req=buildRequest('authorize','180.00',null,{merchant:'demo',key:'key',secret:'c2VjcmV0'},undefined,token,{firstName:'Offline',lastName:'Fixture',address1:'1 Test St',locality:'Test',administrativeArea:'WA',postalCode:'00000',country:'US',email:'test@example.com'});const body=JSON.parse(req.options.body);assert.equal(body.tokenInformation.transientTokenJwt,token);assert.equal(body.paymentInformation,undefined);assert.equal(body.processingInformation.capture,false);
console.log('PASS: signed transient token validation, expiry/tampering/missing session rejection, token authorization without PAN or capture.');
