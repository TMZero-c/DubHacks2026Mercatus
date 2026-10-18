import {MongoClient,ObjectId} from 'mongodb';
import {createHash,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const scryptAsync=promisify(scrypt);
const SESSION_MS=30*24*60*60*1000;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(token){return createHash('sha256').update(token).digest('hex');}
function publicUser(doc){return{id:String(doc._id),email:doc.email};}

async function hashPassword(password,salt=randomBytes(16).toString('hex')){
 const hash=await scryptAsync(password,salt,64);
 return{salt,hash:Buffer.from(hash).toString('hex')};
}

async function verifyPassword(password,salt,expectedHex){
 const hash=await scryptAsync(password,salt,64);
 const expected=Buffer.from(expectedHex,'hex');
 return hash.length===expected.length&&timingSafeEqual(hash,expected);
}

function normalizeEmail(email){
 const value=String(email||'').trim().toLowerCase();
 if(!EMAIL.test(value)||value.length>254)throw new Error('Enter a valid email address.');
 return value;
}

function normalizePassword(password){
 const value=String(password||'');
 if(value.length<8||value.length>128)throw new Error('Password must be 8–128 characters.');
 return value;
}

export function createUserAuth(uri=process.env.MONGODB_URI){
 let client=null,db=null,ready=null;
 const configured=()=>typeof uri==='string'&&uri.trim().length>0;

 async function connect(){
  if(!configured())throw new Error('Sign-in is unavailable. Add MONGODB_URI to the local app .env.');
  if(db)return db;
  if(!ready)ready=(async()=>{
   client=new MongoClient(uri.trim(),{maxPoolSize:5,serverSelectionTimeoutMS:8000});
   await client.connect();
   db=client.db();
   await db.collection('users').createIndex({email:1},{unique:true});
   await db.collection('sessions').createIndex({tokenHash:1},{unique:true});
   await db.collection('sessions').createIndex({expiresAt:1},{expireAfterSeconds:0});
   return db;
  })().catch(error=>{ready=null;client=null;db=null;throw error;});
  return ready;
 }

 async function createSession(userId){
  const database=await connect();
  const token=randomBytes(32).toString('hex');
  const expiresAt=new Date(Date.now()+SESSION_MS);
  await database.collection('sessions').insertOne({tokenHash:hashToken(token),userId:new ObjectId(userId),expiresAt,createdAt:new Date()});
  return{token,expiresAt};
 }

 async function signup({email,password}){
  const database=await connect();
  const normalized=normalizeEmail(email);
  const secret=normalizePassword(password);
  const {salt,hash}=await hashPassword(secret);
  try{
   const result=await database.collection('users').insertOne({email:normalized,passwordHash:hash,passwordSalt:salt,createdAt:new Date()});
   const session=await createSession(result.insertedId);
   return{user:publicUser({_id:result.insertedId,email:normalized}),token:session.token,expiresAt:session.expiresAt.toISOString()};
  }catch(error){
   if(error?.code===11000)throw new Error('An account with that email already exists.');
   throw error;
  }
 }

 async function login({email,password}){
  const database=await connect();
  const normalized=normalizeEmail(email);
  const secret=normalizePassword(password);
  const user=await database.collection('users').findOne({email:normalized});
  if(!user||!(await verifyPassword(secret,user.passwordSalt,user.passwordHash)))throw new Error('Incorrect email or password.');
  const session=await createSession(user._id);
  return{user:publicUser(user),token:session.token,expiresAt:session.expiresAt.toISOString()};
 }

 async function logout(bearer){
  const token=parseBearer(bearer);
  if(!token)return false;
  const database=await connect();
  const result=await database.collection('sessions').deleteOne({tokenHash:hashToken(token)});
  return result.deletedCount>0;
 }

 async function userFromBearer(bearer){
  const token=parseBearer(bearer);
  if(!token)return null;
  const database=await connect();
  const session=await database.collection('sessions').findOne({tokenHash:hashToken(token),expiresAt:{$gt:new Date()}});
  if(!session)return null;
  const user=await database.collection('users').findOne({_id:session.userId});
  return user?publicUser(user):null;
 }

 return{configured,signup,login,logout,userFromBearer};
}

function parseBearer(value){
 if(typeof value!=='string'||!value.startsWith('Bearer '))return null;
 const token=value.slice(7).trim();
 return /^[a-f0-9]{64}$/.test(token)?token:null;
}
