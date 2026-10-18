import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function patch(rel, pairs) {
  const path = join(root, rel);
  let s = await readFile(path, 'utf8');
  let n = 0;
  for (const [a, b] of pairs) {
    const c = s.split(a).length - 1;
    if (c) {
      s = s.split(a).join(b);
      n += c;
    }
  }
  await writeFile(path, s);
  console.log(rel, n, 'replacements');
}

await patch('outputs/committed-cart/index.html', [
  ['og:image:alt" content="Later. Good things come to those who wait."', 'og:image:alt" content="Mercatus. Name your price. Let the market come to you."'],
  ['aria-label="Later home"', 'aria-label="Mercatus home"'],
  ['href="/">later.</a>', 'href="/">mercatus<span class="brand-dot">.</span></a>'],
  ["$('#authTitle').textContent=authMode==='signup'?'Welcome to mercatus.':'Welcome to mercatus.';", "$('#authTitle').textContent='Welcome to mercatus.';"],
]);

await patch('outputs/committed-cart/server.mjs', [
  ['Open card entry from Later.', 'Open card entry from Mercatus.'],
  ['Open sandbox card entry from Later.', 'Open sandbox card entry from Mercatus.'],
]);

await patch('outputs/committed-cart/merchant-mcp.mjs', [
  ['Start the Later local server before connecting MCP.', 'Start the Mercatus local server before connecting MCP.'],
]);

await patch('api/app.js', [
  ['Later home', 'Mercatus home'],
  ['>later<span', '>mercatus<span'],
  ['later<span class="brand-dot">', 'mercatus<span class="brand-dot">'],
]);

const icon32 = join(root, 'outputs/committed-cart/assets/icon-32.png');
if (!existsSync(icon32)) {
  await copyFile(join(root, 'outputs/committed-cart/assets/favicon-32.png'), icon32);
  console.log('copied icon-32.png');
}
