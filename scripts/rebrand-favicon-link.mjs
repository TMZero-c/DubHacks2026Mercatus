import { readFile, writeFile } from 'node:fs/promises';

const path = 'outputs/committed-cart/index.html';
let s = await readFile(path, 'utf8');
s = s.replace(
  'id="authTitle">Log in</h1>',
  'id="authTitle">Welcome to mercatus.</h1>'
);
if (!s.includes('favicon.ico')) {
  s = s.replace(
    'href="/assets/favicon.svg">',
    'href="/assets/favicon.svg"><link rel="icon" href="/assets/favicon.ico" sizes="any">'
  );
}
await writeFile(path, s);
console.log('index auth title + favicon.ico link updated');

const secure = 'outputs/committed-cart/secure-card.html';
let sc = await readFile(secure, 'utf8');
if (!sc.includes('favicon.ico')) {
  sc = sc.replace(
    'href="/assets/favicon.svg">',
    'href="/assets/favicon.svg"><link rel="icon" href="/assets/favicon.ico" sizes="any">'
  );
  await writeFile(secure, sc);
  console.log('secure-card favicon.ico link updated');
}
