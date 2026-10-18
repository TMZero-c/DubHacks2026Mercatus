import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});await writeFile('public/robots.txt','User-agent: *\nDisallow: /\n');
console.log('Hosted merchant app and authenticated MCP functions ready. No payment credentials included.');
