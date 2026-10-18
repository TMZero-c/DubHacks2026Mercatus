// Compile public Rust source using Solana Playground. Private keys never leave this process.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {createKeyPairSignerFromPrivateKeyBytes,createKeyPairSignerFromBytes,getAddressEncoder} from '@solana/kit';
const directory=new URL('../../.local/solana-market/',import.meta.url);await mkdir(directory,{recursive:true,mode:0o700});
for(const name of ['merchant','attestor','program']){const file=new URL(name+'-keypair.json',directory);try{await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;const seed=randomBytes(32),signer=await createKeyPairSignerFromPrivateKeyBytes(seed);const bytes=Buffer.concat([seed,Buffer.from(getAddressEncoder().encode(signer.address))]);await writeFile(file,JSON.stringify([...bytes]),{mode:0o600,flag:'wx'});}}
const signer=await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(await readFile(new URL('attestor-keypair.json',directory),'utf8'))));
const original=await readFile(new URL('program/src/lib.rs',import.meta.url),'utf8'),source=original.replaceAll('env!("LATER_ATTESTOR")',JSON.stringify(signer.address));
let previous;try{previous=JSON.parse(await readFile(new URL('build.json',directory),'utf8'))}catch{}
const response=await fetch('https://api.solpg.io/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:[['/src/lib.rs',source]],...(previous?.uuid?{uuid:previous.uuid}:{})}),signal:AbortSignal.timeout(120000)});
if(!response.ok)throw new Error('Public program compiler returned HTTP '+response.status);
const result=await response.json(),uuid=result.uuid||previous?.uuid;
await writeFile(new URL('build.json',directory),JSON.stringify({uuid,sourceHash:createHash('sha256').update(source).digest('hex'),attestor:signer.address,compiler:'https://api.solpg.io/build',stderr:result.stderr},null,2),{mode:0o600});
if(/error(?:\[|:)/.test(result.stderr||'')||!result.stderr?.includes('Finished')){console.error(result.stderr);process.exit(1);}
const binary=await fetch('https://api.solpg.io/deploy/'+uuid);if(!binary.ok)throw new Error('Compiled program unavailable');const data=Buffer.from(await binary.arrayBuffer());if(!data.subarray(0,4).equals(Buffer.from([127,69,76,70])))throw new Error('Invalid ELF response');await writeFile(new URL('program.so',directory),data);
console.log(JSON.stringify({compiler:'Solana Playground',binaryBytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),privateKeysUploaded:false}));
