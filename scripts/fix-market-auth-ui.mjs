import { readFile, writeFile, copyFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const extFonts = join(root, 'outputs/amazon-extension/assets/fonts');
const webAssets = join(root, 'outputs/committed-cart/assets');
const webFonts = join(webAssets, 'fonts');
const webBags = join(webAssets, 'bags');

await mkdir(webFonts, { recursive: true });
await mkdir(webBags, { recursive: true });

for (const name of await readdir(extFonts)) {
  if (!name.endsWith('.woff2')) continue;
  await copyFile(join(extFonts, name), join(webFonts, name));
}
await copyFile(
  join(root, 'outputs/amazon-extension/assets/bags/red-happy.svg'),
  join(webBags, 'red-happy.svg')
);

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
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuf]);
}

const webBag = await sharp(svg)
  .resize(400, 400, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const webBg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="96" fill="#fffdf9"/></svg>'
);
const web512 = await sharp(webBg).composite([{ input: webBag, left: 56, top: 56 }]).png().toBuffer();
await writeFile(join(webAssets, 'favicon-512.png'), web512);
await sharp(web512).resize(32, 32).png().toFile(join(webAssets, 'favicon-32.png'));
await sharp(web512).resize(32, 32).png().toFile(join(webAssets, 'icon-32.png'));
await sharp(web512).resize(180, 180).png().toFile(join(webAssets, 'icon-180.png'));
await sharp(web512).resize(192, 192).png().toFile(join(webAssets, 'icon-192.png'));
await sharp(web512).resize(512, 512).png().toFile(join(webAssets, 'icon-512.png'));

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#fffdf9"/>
<g transform="translate(76 76) scale(2.25)">${bagInner}</g>
</svg>`;
await writeFile(join(webAssets, 'favicon.svg'), faviconSvg);

const png32 = await sharp(web512).resize(32, 32).png().toBuffer();
await writeFile(join(webAssets, 'favicon.ico'), pngToIco(png32, 32));
console.log('icons + fonts synced');

// --- index.html: favicon order + auth markup ---
const indexPath = join(root, 'outputs/committed-cart/index.html');
let html = await readFile(indexPath, 'utf8');

const oldFav =
  '<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"><link rel="icon" href="/assets/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/assets/icon-32.png"><link rel="apple-touch-icon" sizes="180x180" href="/assets/icon-180.png">';
const newFav =
  '<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png"><link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"><link rel="shortcut icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/assets/icon-180.png">';
if (!html.includes(oldFav) && !html.includes('/assets/favicon-32.png')) {
  throw new Error('favicon link block not found');
}
if (html.includes(oldFav)) html = html.replace(oldFav, newFav);

const oldAuth =
  '<section id="authGate" class="auth-gate" aria-label="Sign in"><form class="auth-card" id="authForm"><a class="wordmark" href="/" aria-label="Mercatus home">mercatus<span class="brand-dot">.</span></a><h1 id="authTitle">Welcome to mercatus.</h1><p id="authHint">Name your price. Let the market come to you.</p><div id="authError" class="auth-error" role="alert"></div><label for="authEmail">Email</label><input class="form-control" id="authEmail" type="email" autocomplete="username" required maxlength="254"><label for="authPassword">Password</label><input class="form-control" id="authPassword" type="password" autocomplete="current-password" required minlength="8" maxlength="128"><button class="primary btn btn-primary" id="authSubmit" type="submit">Log in</button><button class="auth-toggle" id="authToggle" type="button">Need an account? Sign up</button></form></section>';
const newAuth =
  '<section id="authGate" class="auth-gate" aria-label="Sign in"><header class="auth-topbar"><a class="wordmark" href="/" aria-label="Mercatus home">mercatus<span class="brand-dot">.</span></a></header><div class="auth-shell"><img class="auth-bag" src="/assets/bags/red-happy.svg" width="64" height="64" alt="" aria-hidden="true"><form class="auth-card" id="authForm"><h1 id="authTitle">Welcome to mercatus.</h1><p id="authHint">Name your price. Let the market come to you.</p><div id="authError" class="auth-error" role="alert"></div><label for="authEmail">Email</label><input class="form-control" id="authEmail" type="email" autocomplete="username" required maxlength="254"><label for="authPassword">Password</label><input class="form-control" id="authPassword" type="password" autocomplete="current-password" required minlength="8" maxlength="128"><button class="primary btn btn-primary" id="authSubmit" type="submit">Log in</button><button class="auth-toggle" id="authToggle" type="button">Need an account? Sign up</button></form></div></section>';

if (!html.includes('auth-topbar')) {
  if (!html.includes(oldAuth)) throw new Error('auth gate markup not found');
  html = html.replace(oldAuth, newAuth);
}
await writeFile(indexPath, html);
console.log('index.html updated');

// --- brand.css: Nunito + Mercatus auth layout ---
const brandPath = join(root, 'outputs/committed-cart/brand.css');
let css = await readFile(brandPath, 'utf8');

const fontFace = `@font-face{font-family:"Nunito";font-style:normal;font-weight:400;font-display:swap;src:url("/assets/fonts/nunito-400.woff2") format("woff2")}
@font-face{font-family:"Nunito";font-style:normal;font-weight:700;font-display:swap;src:url("/assets/fonts/nunito-700.woff2") format("woff2")}
@font-face{font-family:"Nunito";font-style:normal;font-weight:800;font-display:swap;src:url("/assets/fonts/nunito-800.woff2") format("woff2")}
@font-face{font-family:"Nunito";font-style:normal;font-weight:900;font-display:swap;src:url("/assets/fonts/nunito-900.woff2") format("woff2")}
`;

const authStyles = `.auth-gate{min-height:100vh;display:flex;flex-direction:column;align-items:stretch;padding:0;background:#f7f1e7}
.auth-topbar{display:flex;align-items:center;justify-content:center;min-height:56px;padding:0 20px;background:rgba(255,253,249,.96);border-bottom:1px solid #ded9cf;flex:0 0 auto}
.auth-topbar .wordmark{font-size:28px;font-weight:900;letter-spacing:-1.4px;color:#17201f;text-decoration:none;line-height:1;pointer-events:none;font-family:"Nunito",sans-serif}
.auth-topbar .brand-dot{color:#2864e8}
.auth-shell{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:14px;padding:28px 20px 40px;width:100%;max-width:420px;margin:0 auto;box-sizing:border-box}
.auth-bag{width:64px;height:64px;margin:4px auto 0;flex:0 0 auto;animation:auth-wave 1.8s ease-in-out infinite;transform-origin:50% 100%}
@keyframes auth-wave{0%,100%{transform:rotate(0)}15%{transform:rotate(-6deg)}30%{transform:rotate(5deg)}45%{transform:rotate(-3deg)}60%{transform:rotate(0)}}
@media (prefers-reduced-motion:reduce){.auth-bag{animation:none}}
.auth-card{width:100%;background:#fff;border:1px solid #ded9cf;border-radius:14px;padding:18px 16px 16px;box-shadow:0 8px 22px rgba(46,39,29,.04);text-align:center;box-sizing:border-box}
.auth-card h1{margin:0;font-size:22px;font-weight:900;letter-spacing:-.04em;line-height:1.15;color:#17201f;font-family:"Nunito",sans-serif}
.auth-card>p{max-width:none;margin:8px 0 0;font-size:12px;line-height:1.45;color:#6f746e;font-weight:600}
.auth-card label{display:block;font-size:10px;font-weight:900;color:#585b56;margin:12px 0 7px;text-align:left;font-family:"Nunito",sans-serif}
.auth-card input,.auth-card .form-control{width:100%;min-height:44px;margin-bottom:0;padding:11px 13px;border:1px solid #c9c5bd;border-radius:12px;color:#17201f;background:#fff;font-family:"Nunito",sans-serif;font-size:14px;font-weight:700;box-shadow:none;box-sizing:border-box}
.auth-card input:focus,.auth-card .form-control:focus{border-color:#2864e8;box-shadow:0 0 0 3px rgba(40,100,232,.12);outline:none}
.auth-card .primary,.auth-card .btn-primary{margin-top:18px;padding:14px 16px;border-radius:12px;font-size:14px;font-weight:900;background:#2864e8;border:0;box-shadow:0 4px 10px rgba(40,100,232,.2);font-family:"Nunito",sans-serif}
.auth-card .primary:hover,.auth-card .btn-primary:hover{background:#1d54cd}
.auth-toggle{display:block;width:100%;margin-top:12px;padding:6px;border:0;background:transparent;color:#2864e8;font-size:11px;font-weight:800;text-align:center;text-decoration:underline;text-underline-offset:2px;font-family:"Nunito",sans-serif}
.auth-toggle:hover{color:#1d54cd}
.auth-error{display:none;margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#fff4ef;color:#923719;border:1px solid #f5d2c4;font-size:11px;font-weight:800;line-height:1.4;text-align:left}
.auth-error[data-open=true]{display:block}
body.auth-locked>header,body.auth-locked>#shopperView,body.auth-locked>#merchantView{display:none!important}
body.auth-locked .auth-gate{display:flex}
body:not(.auth-locked) .auth-gate{display:none}
body.auth-locked{background:#f7f1e7}
`;

const oldAuthBlockStart = '.auth-gate{';
const oldAuthBlockEnd = 'body:not(.auth-locked) .auth-gate{display:none}';
const start = css.indexOf(oldAuthBlockStart);
const end = css.indexOf(oldAuthBlockEnd);
if (start < 0 || end < 0) throw new Error('auth css block not found');
const endAt = end + oldAuthBlockEnd.length;
css = css.slice(0, start) + authStyles.trim() + css.slice(endAt);

if (!css.includes('@font-face{font-family:"Nunito"')) {
  css = fontFace + css;
}

// Prefer Nunito on body while keeping app layout otherwise
css = css.replace(
  "body{margin:0;background:#f7f8fc;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
  'body{margin:0;background:#f7f8fc;font-family:"Nunito",-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;'
);

// Align primary blue with Mercatus
css = css.replaceAll('#2456f5', '#2864e8');
css = css.replace(':root{--blue:#2864e8;', ':root{--blue:#2864e8;--ink:#17201f;--muted:#6f746e;--line:#ded9cf;');
// Avoid duplicating vars if already rewritten
css = css.replace(
  ':root{--blue:#2864e8;--ink:#17201f;--muted:#6f746e;--line:#ded9cf;--ink:#16171b;--muted:#646773;--line:#e3e5eb;--bs-primary:#2456f5;',
  ':root{--blue:#2864e8;--ink:#17201f;--muted:#6f746e;--line:#ded9cf;--bs-primary:#2864e8;'
);
css = css.replace('--bs-primary:#2456f5', '--bs-primary:#2864e8');
css = css.replace('--bs-primary:#2864e8;--bs-body-color:#16171b', '--bs-primary:#2864e8;--bs-body-color:#17201f');

await writeFile(brandPath, css);
console.log('brand.css updated');

// Expand server font allowlist for latin-ext filenames
const serverPath = join(root, 'outputs/committed-cart/server.mjs');
let server = await readFile(serverPath, 'utf8');
const oldAllow =
  '/^\\/assets\\/(favicon\\.(svg|ico|png)|favicon-(32|512)\\.png|icon-(32|180|192|512)\\.png|social-preview\\.png|bags\\/[a-z0-9-]+\\.svg|fonts\\/nunito-\\d+\\.woff2)$/';
const newAllow =
  '/^\\/assets\\/(favicon\\.(svg|ico|png)|favicon-(32|512)\\.png|icon-(32|180|192|512)\\.png|social-preview\\.png|bags\\/[a-z0-9-]+\\.svg|fonts\\/nunito-[a-z0-9-]+\\.woff2)$/';
if (server.includes(oldAllow.slice(1, -1).replace(/\\\\/g, '\\'))) {
  // handle literal in file
}
if (server.includes('fonts\\/nunito-\\d+\\.woff2')) {
  server = server.replace('fonts\\/nunito-\\d+\\.woff2', 'fonts\\/nunito-[a-z0-9-]+\\.woff2');
  await writeFile(serverPath, server);
  console.log('server.mjs font allowlist widened');
} else if (server.includes('fonts/nunito-\\d+\\.woff2') || server.includes("fonts\\/nunito-\\d+\\.woff2")) {
  server = server.replace(/fonts\\\/nunito-\\d\+\\.woff2/, 'fonts\\/nunito-[a-z0-9-]+\\.woff2');
  await writeFile(serverPath, server);
  console.log('server.mjs font allowlist widened');
} else {
  console.log('server allowlist already ok or pattern differs');
}

console.log('done');
