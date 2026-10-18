import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),hash=s=>createHash('sha256').update(s).digest('hex');
// Local development sign-in, used only when no MongoDB URI is configured.
// This stores normal application accounts, never shopper crypto keys.
export function createSandboxAuth(file){
 mkdirSync(dirname(file),{recursive:true,mode:0o700});const db=new DatabaseSync(file);chmodSync(file,0o600);
 db.exec('PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);');
 const publicUser=u=>({id:u.id,email:u.email});const attempts=new Map();
 function input(body){const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Enter a valid email address.');if(password.length<8||password.length>128)throw Error('Password must be 8–128 characters.');const a=attempts.get(email)||{at:Date.now(),count:0};if(Date.now()-a.at>60000){a.at=Date.now();a.count=0;}if(++a.count>20)throw Error('Too many attempts. Wait one minute.');attempts.set(email,a);return{email,password};}
 function session(user){const token=randomBytes(32).toString('hex'),expires=Date.now()+30*86400000;db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),user.id,expires);return{user:publicUser(user),token,expiresAt:new Date(expires).toISOString()};}
 return{configured:()=>true,mode:'local-sandbox',async signup(body){const {email,password}=input(body);const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64),user={id:randomUUID(),email};try{db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(user.id,email,salt,key.toString('hex'));}catch(e){if(e.code==='ERR_SQLITE_ERROR')throw Error('An account with that email already exists.');throw e;}return session(user);},async login(body){const {email,password}=input(body),user=db.prepare('SELECT * FROM users WHERE email=?').get(email),key=await scrypt(password,user?.salt||'not-an-account',64);if(!user||!timingSafeEqual(key,Buffer.from(user.password,'hex')))throw Error('Incorrect email or password.');return session(user);},async userFromBearer(header){const token=/^Bearer ([a-f0-9]{64})$/.exec(header||'')?.[1];if(!token)return null;const user=db.prepare('SELECT users.id,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>?').get(hash(token),Date.now());return user?publicUser(user):null;},async logout(header){const token=/^Bearer ([a-f0-9]{64})$/.exec(header||'')?.[1];if(token)db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token));},close(){db.close();}};
}
