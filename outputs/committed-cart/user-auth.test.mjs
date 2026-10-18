import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,scryptSync} from 'node:crypto';
import {ObjectId} from 'mongodb';
import {createUserAuth} from './user-auth.mjs';

const uri='mongodb://private-user:private-password@private-db.example/later';
const password='Test password 123';
const email='shopper@example.test';
const safeMessage='Sign-in is temporarily unavailable. Please try again.';
const bearer='Bearer '+'a'.repeat(64);

function fixture({failAt=null,code=null}={}){
 const id=new ObjectId(),salt='fixed-offline-fixture-salt';
 const records={users:[{_id:id,email,passwordSalt:salt,passwordHash:scryptSync(password,salt,64).toString('hex')}],sessions:[]};
 const tokenHash=createHash('sha256').update('a'.repeat(64)).digest('hex');
 records.sessions.push({tokenHash,userId:id,expiresAt:new Date(Date.now()+3600000)});
 let closed=false;
 const fail=stage=>{if(stage===failAt)throw Object.assign(new Error('Driver failure for '+uri),{code,connectionString:uri});};
 const database={collection(name){
  return{
   async createIndex(){fail(name+'.createIndex');return'index';},
   async insertOne(doc){fail(name+'.insertOne');const _id=new ObjectId();records[name].push({...doc,_id});return{insertedId:_id};},
   async findOne(query){fail(name+'.findOne');return records[name].find(row=>Object.entries(query).every(([key,value])=>key==='expiresAt'?row.expiresAt>value.$gt:key==='_id'?String(row._id)===String(value):row[key]===value))||null;},
   async deleteOne(query){fail(name+'.deleteOne');const index=records[name].findIndex(row=>row.tokenHash===query.tokenHash);if(index<0)return{deletedCount:0};records[name].splice(index,1);return{deletedCount:1};}
  };
 }};
 const auth=createUserAuth(uri,{createClient(value,options){
  assert.equal(value,uri);assert.equal(options.serverSelectionTimeoutMS,8000);
  fail('constructor');
  return{async connect(){fail('connect');},db(){fail('db');return database;},async close(){closed=true;}};
 }});
 return{auth,records,closed:()=>closed};
}

function redacted(error){
 assert.equal(error.message,safeMessage);
 assert.equal(error.cause,undefined);
 assert.equal(error.connectionString,undefined);
 assert.equal(JSON.stringify(error).includes('private-'),false);
 assert.equal(error.stack.includes('private-'),false);
 return true;
}

test('Mongo construction, connection, database and index errors use a fixed public message',async t=>{
 for(const stage of ['constructor','connect','db','users.createIndex','sessions.createIndex']){
  await t.test(stage,async()=>{
   const {auth,closed}=fixture({failAt:stage});
   await assert.rejects(auth.login({email,password}),redacted);
   if(stage!=='constructor')assert.equal(closed(),true);
  });
 }
});

test('Mongo query failures never expose driver credentials through public auth operations',async t=>{
 const cases=[
  ['signup user insert','users.insertOne',auth=>auth.signup({email:'new@example.test',password})],
  ['signup session insert','sessions.insertOne',auth=>auth.signup({email:'new@example.test',password})],
  ['login user lookup','users.findOne',auth=>auth.login({email,password})],
  ['login session insert','sessions.insertOne',auth=>auth.login({email,password})],
  ['session lookup','sessions.findOne',auth=>auth.userFromBearer(bearer)],
  ['session user lookup','users.findOne',auth=>auth.userFromBearer(bearer)],
  ['logout','sessions.deleteOne',auth=>auth.logout(bearer)]
 ];
 for(const [name,failAt,operation]of cases)await t.test(name,async()=>{
  const {auth}=fixture({failAt});
  await assert.rejects(operation(auth),redacted);
 });
});

test('Input errors, incorrect password and duplicate email keep useful safe messages',async()=>{
 const {auth}=fixture({failAt:'connect'});
 await assert.rejects(auth.signup({email:'invalid',password}),/Enter a valid email address/);
 await assert.rejects(auth.login({email,password:'short'}),/Password must be/);
 await assert.rejects(fixture().auth.login({email,password:'Wrong password 123'}),/Incorrect email or password/);
 await assert.rejects(fixture().auth.login({email:'missing@example.test',password}),/Incorrect email or password/);
 await assert.rejects(fixture({failAt:'users.insertOne',code:11000}).auth.signup({email,password}),/An account with that email already exists/);
 await assert.rejects(fixture({failAt:'sessions.insertOne',code:11000}).auth.signup({email,password}),redacted);
});

test('Successful signup and login store only password and session hashes and support logout',async()=>{
 const {auth,records}=fixture();
 const added=await auth.signup({email:' New@Example.test ',password});
 assert.deepEqual(Object.keys(added.user).sort(),['email','id']);
 assert.equal(added.user.email,'new@example.test');
 assert.match(added.token,/^[a-f0-9]{64}$/);
 const stored=records.users.find(user=>user.email==='new@example.test');
 assert.equal(stored.password,undefined);
 assert.notEqual(stored.passwordHash,password);
 const session=records.sessions.find(row=>String(row.userId)===added.user.id);
 assert.equal(session.token,undefined);
 assert.equal(session.tokenHash,createHash('sha256').update(added.token).digest('hex'));
 assert.deepEqual(await auth.userFromBearer('Bearer '+added.token),added.user);
 const signedIn=await auth.login({email:'NEW@EXAMPLE.TEST',password});
 assert.deepEqual(signedIn.user,added.user);
 assert.notEqual(signedIn.token,added.token);
 assert.equal(await auth.logout('Bearer '+added.token),true);
 assert.equal(await auth.userFromBearer('Bearer '+added.token),null);
 assert.deepEqual(await auth.userFromBearer('Bearer '+signedIn.token),added.user);
});

test('Invalid bearer tokens do not connect to MongoDB',async()=>{
 const {auth}=fixture({failAt:'constructor'});
 assert.equal(await auth.userFromBearer('Bearer not-a-session'),null);
 assert.equal(await auth.logout(undefined),false);
 const missing=createUserAuth('');
 assert.equal(missing.configured(),false);
 await assert.rejects(missing.login({email,password}),/Sign-in is unavailable/);
});
