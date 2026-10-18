import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'outputs/amazon-extension/assets/bags/red-happy.svg');
const svg = await readFile(svgPath);
const bagInner = (await readFile(svgPath, 'utf8'))
  .replace(/^[\s\S]*?<svg[^>]*>/i, '')
  .replace(/<\/svg>\s*$/i, '');

async function renderIcon(size, outPath, padRatio = 0.12) {
  const pad = Math.max(1, Math.round(size * padRatio));
  const inner = Math.max(1, size - pad * 2);
  const radius = Math.max(2, Math.round(size * 0.18));
  const bag = await sharp(svg)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fffdf9"/></svg>`
  );
  await sharp(bg).composite([{ input: bag, left: pad, top: pad }]).png().toFile(outPath);
}

function pngToIco(pngBuf, size = 32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = size;
  entry[1] = size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuf]);
}

const iconDir = join(root, 'outputs/amazon-extension/icons');
await mkdir(iconDir, { recursive: true });
await mkdir(join(root, 'outputs/committed-cart/assets'), { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const padRatio = size <= 16 ? 0.05 : size <= 32 ? 0.08 : 0.12;
  await renderIcon(size, join(iconDir, `icon-${size}.png`), padRatio);
  console.log('icon', size);
}

await renderIcon(32, join(root, 'outputs/amazon-extension/icon-32.png'), 0.08);
await renderIcon(128, join(root, 'outputs/amazon-extension/icon-128.png'));
await renderIcon(192, join(root, 'outputs/amazon-extension/icon-192.png'));

const webBag = await sharp(svg)
  .resize(400, 400, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const webBg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="96" fill="#fffdf9"/></svg>'
);
const web512 = await sharp(webBg).composite([{ input: webBag, left: 56, top: 56 }]).png().toBuffer();
await writeFile(join(root, 'outputs/committed-cart/assets/favicon-512.png'), web512);
await sharp(web512).resize(32, 32).png().toFile(join(root, 'outputs/committed-cart/assets/favicon-32.png'));
await sharp(web512).resize(180, 180).png().toFile(join(root, 'outputs/committed-cart/assets/icon-180.png'));
await sharp(web512).resize(192, 192).png().toFile(join(root, 'outputs/committed-cart/assets/icon-192.png'));

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#fffdf9"/>
<g transform="translate(76 76) scale(2.25)">${bagInner}</g>
</svg>`;
await writeFile(join(root, 'outputs/committed-cart/assets/favicon.svg'), faviconSvg);

const png32 = await sharp(web512).resize(32, 32).png().toBuffer();
await writeFile(join(root, 'outputs/committed-cart/assets/favicon.ico'), pngToIco(png32, 32));
console.log('web favicons done');
