import {Keypair} from '@solana/web3.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const directory=new URL('../committed-cart/.local/collectibles/',import.meta.url),file=new URL('protocol.json',directory);await mkdir(directory,{recursive:true,mode:0o700});let signer;try{signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(file,'utf8'))));}catch(e){if(e.code!=='ENOENT')throw e;signer=Keypair.generate();await writeFile(file,JSON.stringify([...signer.secretKey]),{flag:'wx',mode:0o600});}
console.log(JSON.stringify({cluster:'testnet',protocolAddress:signer.publicKey.toBase58(),faucet:'https://faucet.solana.com/',userWalletsCreated:0},null,2));
