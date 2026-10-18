import {testnetConnection} from './rpc.mjs';
// Independent, read-only verifier: no protocol secret or app database required.
import {PublicKey} from '@solana/web3.js';
import {getMint,getTokenMetadata,getAccount,TOKEN_2022_PROGRAM_ID as PROGRAM} from '@solana/spl-token';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const GENESIS='4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';
const seed=s=>createHash('sha256').update(s).digest('hex').slice(0,32);
export async function verifyPublic(mintAddress,protocolAddress){
 const c=testnetConnection();
 if(await c.getGenesisHash()!==GENESIS)throw Error('Wrong Solana network');
 const protocol=new PublicKey(protocolAddress),address=new PublicKey(mintAddress);
 async function read(mint){const account=await getMint(c,mint,'finalized',PROGRAM),metadata=await getTokenMetadata(c,mint,'finalized',PROGRAM);if(!metadata)throw Error('Metadata missing');const fields=Object.fromEntries(metadata.additionalMetadata);if(account.supply!==1n||account.decimals!==0||account.mintAuthority!==null)throw Error('Supply is not permanently fixed at one');return{account,metadata,terms:JSON.parse(fields.terms),state:JSON.parse(fields.state)};}
 const nft=await read(address);if(nft.terms.kind!=='pass'||!Number.isInteger(nft.terms.edition))throw Error('Not a Mercatus price pass');
 const dropAddress=new PublicKey(nft.terms.drop),drop=await read(dropAddress);
 if(drop.metadata.updateAuthority||drop.account.freezeAuthority||drop.terms.kind!=='drop'||!Array.isArray(drop.terms.mints)||drop.terms.mints.length<1||drop.terms.mints.length>5||new Set(drop.terms.mints).size!==drop.terms.mints.length||drop.terms.mints[nft.terms.edition-1]!==mintAddress)throw Error('Drop cap or membership not verified');
 async function custody(mint,holder){const a=await PublicKey.createWithSeed(protocol,seed(mint.toBase58()+':'+holder),PROGRAM),token=await getAccount(c,a,'finalized',PROGRAM);if(!token.owner.equals(protocol)||!token.mint.equals(mint)||token.amount!==1n)throw Error('Protocol custody mismatch');return token;}
 const token=await custody(address,nft.state.holder),root=await custody(dropAddress,'protocol');if(!root.isFrozen)throw Error('Drop manifest is not frozen');
 if(!['active','shared','reserved','redeemed'].includes(nft.state.status))throw Error('Unknown pass state');
 if(nft.state.status==='redeemed'&&(!token.isFrozen||nft.metadata.updateAuthority||nft.account.freezeAuthority||!/^[a-f0-9]{64}$/.test(nft.state.receipt||'')))throw Error('Redemption is not permanently locked');
 return{verified:true,cluster:'testnet',genesis:GENESIS,mint:mintAddress,protocol:protocolAddress,kind:'Token-2022 NFT',name:nft.metadata.name,symbol:nft.metadata.symbol,dropName:drop.metadata.name,dropSymbol:drop.metadata.symbol,supply:1,decimals:0,mintAuthority:null,edition:nft.terms.edition,editionCount:drop.terms.mints.length,immutableDrop:dropAddress.toBase58(),terms:drop.terms,state:nft.state,tokenAccount:token.address.toBase58(),frozen:token.isFrozen,redeemedImmutable:nft.state.status==='redeemed',redeemable:nft.state.status==='active'&&!token.isFrozen&&Date.parse(drop.terms.expiresAt)>Date.now(),checkedAt:new Date().toISOString(),explorer:`https://explorer.solana.com/address/${mintAddress}?cluster=testnet`};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.argv[2]||!process.argv[3])throw Error('Usage: node verify-public.mjs <collectible-mint> <protocol-public-key>');console.log(JSON.stringify(await verifyPublic(process.argv[2],process.argv[3]),null,2));}
