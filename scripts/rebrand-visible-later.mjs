import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function replaceVisible(html) {
  return html
    .replaceAll('Later — Good things come to those who wait.', 'Mercatus — Name your price. Let the market come to you.')
    .replaceAll('Later lets you review your cart, set your budget, and compare merchant offers. Good things come to those who wait.', 'Mercatus lets you name your price and let merchants compete for your cart.')
    .replaceAll('content="Later"', 'content="Mercatus"')
    .replaceAll('og:site_name" content="Later"', 'og:site_name" content="Mercatus"')
    .replaceAll('twitter:title" content="Later', 'twitter:title" content="Mercatus')
    .replaceAll('application-name" content="Later"', 'application-name" content="Mercatus"')
    .replaceAll('<title>Later · Visa</title>', '<title>Mercatus · Visa</title>')
    .replaceAll('>later<span>.</span>', '>mercatus<span>.</span>')
    .replaceAll('>later<span class="brand-dot">.</span>', '>mercatus<span class="brand-dot">.</span>')
    .replaceAll('class="wordmark">later<span>', 'class="wordmark">mercatus<span>')
    .replaceAll('Later API', 'Mercatus API')
    .replaceAll('Save waits to your Later account.', 'Name your price. Let the market come to you.')
    .replaceAll('Sign in to use Later on the web.', 'Name your price. Let the market come to you.')
    .replaceAll("'Create account':'Log in'", "'Welcome to mercatus.':'Welcome to mercatus.'")
    .replaceAll('Later is offline. Start the local app (npm start), then refresh.', 'Mercatus is offline. Start the local app (npm start), then refresh.')
    .replaceAll('retry from Later.', 'retry from Mercatus.')
    .replaceAll('hold in Later before', 'hold in Mercatus before')
    .replaceAll('Open card entry from Later.', 'Open card entry from Mercatus.')
    .replaceAll('Later · Merchant access', 'Mercatus · Merchant access')
    .replaceAll('theme-color" content="#2456f5"', 'theme-color" content="#2864e8"');
}

const files = [
  'outputs/committed-cart/index.html',
  'outputs/committed-cart/secure-card.html',
  'api/app.js',
];

for (const rel of files) {
  const path = join(root, rel);
  const before = await readFile(path, 'utf8');
  const after = replaceVisible(before);
  if (before === after) {
    console.log('no changes', rel);
  } else {
    await writeFile(path, after);
    console.log('updated', rel);
  }
}

const manifestPath = join(root, 'outputs/committed-cart/manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.name = 'Mercatus';
manifest.short_name = 'Mercatus';
manifest.description = 'Name your price and let merchants compete for your cart.';
manifest.theme_color = '#2864e8';
manifest.background_color = '#f7f1e7';
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('updated webmanifest');
