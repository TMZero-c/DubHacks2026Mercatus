import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const classicScripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].filter(match=>!/^<script\b[^>]*(?:\bsrc\s*=|\btype\s*=\s*["']module["'])/i.test(match[0])).map(match=>match[1]).join('\n');
const userA={id:'shopper-a',email:'a@example.test'},userB={id:'shopper-b',email:'b@example.test'};
const oldCart={id:'old-cart',status:'authorized',amount:15000,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),sellers:'Authorized retailers only',deliveryDate:'2026-10-25',published:false,verification:{active:true},offers:[],items:[{name:'PRIVATE OLD SHOPPER PRODUCT',variant:'Black · New',quantity:1,cents:15000,url:'https://store.example/private-product'}]};
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function harness(){
 const {window}=parseHTML(html),{document}=window;
 const stored=new Map(),pending=[];
 const location={search:'',hash:'',pathname:'/',origin:'http://localhost:4318'};
 const fetch=async(path,options={})=>{
  if(path==='/api/auth/status')return response(200,{configured:true});
  return await new Promise(resolve=>pending.push({path,options,resolve}));
 };
 const localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key)};
 const context=vm.createContext({document,window,Event:window.Event,URL,URLSearchParams,location,localStorage,fetch,history:{replaceState(){}},setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout,console});
 new vm.Script(classicScripts,{filename:'index.html inline app'}).runInContext(context);
 await tick();await tick();
 const evaluate=source=>vm.runInContext(source,context);
 return{document,window,stored,pending,evaluate,context};
}

function seedPrivateState(app){
 app.context.testUser=userA;app.context.testCart=structuredClone(oldCart);
 app.evaluate("saveSession('old-session',testUser);showApp();render(testCart);");
 app.document.querySelector('#items').replaceChildren();
 app.evaluate("add({name:'PRIVATE OLD SHOPPER DRAFT',variant:'Red',quantity:1,price:'45.00'});");
 for(const id of ['compareResults','geminiResults'])app.document.getElementById(id).textContent='PRIVATE OLD SEARCH RESULTS';
 for(const id of ['comparePanel','geminiPanel'])app.document.getElementById(id).hidden=false;
 app.window.marketPrices={privateProduct:12000};
}

function assertPrivateStateCleared(app){
 const {document,evaluate,window}=app;
 assert.equal(evaluate('current'),null);
 assert.equal(document.querySelector('#receipt').style.display,'none');
 assert.equal(document.querySelector('#lineitems').textContent.includes('PRIVATE OLD'),false);
 assert.equal(document.querySelector('#items').textContent.includes('PRIVATE OLD'),false);
 assert.equal([...document.querySelectorAll('#items input')].some(input=>String(input.value).includes('PRIVATE OLD')),false);
 for(const id of ['compareResults','geminiResults'])assert.equal(document.getElementById(id).textContent,'');
 for(const id of ['comparePanel','geminiPanel'])assert.equal(document.getElementById(id).hidden,true);
 assert.equal(Object.keys(window.marketPrices||{}).length,0);
}

test('Full web app classic script parses and initializes its sign-in gate',async()=>{
 const app=await harness();
 assert.equal(app.document.body.classList.contains('auth-locked'),true);
 assert.equal(app.document.querySelector('#authSubmit').textContent,'Log in');
 assert.equal(app.evaluate('current'),null);
});

test('Clearing a web session removes the prior shopper receipt, drafts and comparison results',async()=>{
 const app=await harness();seedPrivateState(app);
 assert.equal(app.document.querySelector('#receipt').style.display,'block');
 app.evaluate('clearSession();');
 assertPrivateStateCleared(app);
 assert.equal(app.evaluate('sessionToken'),'');
 assert.equal(app.evaluate('authUser'),null);
 assert.equal(app.stored.has('laterAuth'),false);
});

test('Switching web accounts removes previous shopper data before fetching the new account',async()=>{
 const app=await harness();seedPrivateState(app);app.context.nextUser=userB;
 app.evaluate("saveSession('new-session',nextUser);");
 assertPrivateStateCleared(app);
 assert.equal(app.evaluate('sessionToken'),'new-session');
 assert.equal(app.evaluate('authUser.id'),userB.id);
});

test('A delayed cart response from an old web session cannot render after account switch',async()=>{
 const app=await harness();seedPrivateState(app);
 const refreshing=app.evaluate('refresh();');
 const request=app.pending.shift();assert.equal(request.path,'/api/state');
 assert.equal(request.options.headers.Authorization,'Bearer old-session');
 app.context.nextUser=userB;app.evaluate("saveSession('new-session',nextUser);");
 request.resolve(response(200,{configured:true,carts:[oldCart]}));
 await refreshing;
 assertPrivateStateCleared(app);
 assert.equal(app.evaluate('sessionToken'),'new-session');
 assert.equal(app.evaluate('authUser.id'),userB.id);
});

test('A delayed 401 for an old web session cannot sign out the new shopper',async()=>{
 const app=await harness();seedPrivateState(app);
 const refreshing=app.evaluate('refresh();');
 const request=app.pending.shift();assert.equal(request.path,'/api/state');
 app.context.nextUser=userB;app.evaluate("saveSession('new-session',nextUser);showApp();");
 request.resolve(response(401,{error:'Old session expired'}));
 await refreshing;
 assertPrivateStateCleared(app);
 assert.equal(app.evaluate('sessionToken'),'new-session');
 assert.equal(app.evaluate('authUser.id'),userB.id);
 assert.equal(JSON.parse(app.stored.get('laterAuth')).token,'new-session');
 assert.equal(app.document.body.classList.contains('auth-locked'),false);
});

test('An old explicit logout finishing after account switch cannot clear the new login',async()=>{
 const app=await harness();seedPrivateState(app);
 const loggingOut=app.document.querySelector('#logout').onclick();
 const request=app.pending.shift();assert.equal(request.path,'/api/auth/logout');
 assert.equal(request.options.headers.Authorization,'Bearer old-session');
 app.context.nextUser=userB;app.evaluate("saveSession('new-session',nextUser);showApp();");
 request.resolve(response(200,{ok:true}));
 await loggingOut;
 assertPrivateStateCleared(app);
 assert.equal(app.evaluate('sessionToken'),'new-session');
 assert.equal(app.evaluate('authUser.id'),userB.id);
 assert.equal(JSON.parse(app.stored.get('laterAuth')).token,'new-session');
 assert.equal(app.document.body.classList.contains('auth-locked'),false);
});
