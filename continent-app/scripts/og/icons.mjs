/**
 * icons.mjs, builds the favicon, the app icon set and the store masters from
 * the one compass mark, on the product's own tokens.
 *
 * Served from public/ (paths unchanged, so sw.js, the manifest and index.html
 * keep working): favicon.svg, favicon.ico, icon-192.png, icon-512.png,
 * icon-maskable-512.png, icon-maskable.svg, apple-touch-icon.png.
 *
 * Not served, kept in brand/store/ for the Android TWA and the iOS wrapper
 * (T272): the five Android launcher densities, the Play Store 512, the
 * adaptive icon foreground and its background colour, and every iOS AppIcon
 * size including the 1024 App Store master. App Store masters carry no alpha
 * channel (Chromium writes 8-bit RGB when the page is opaque, which check.mjs
 * asserts) and no rounded corners, because both platforms round them.
 *
 * Maskable and adaptive icons put the mark inside the central 80 percent
 * circle, the safe zone both Android and the W3C manifest spec define, so no
 * launcher mask can cut the needle.
 *
 * Run from continent-app/:  node scripts/og/icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ROOT, C } from './tokens.mjs';
import { markShapes } from './cards.mjs';
import { rasterise, closeBrowser } from './render.mjs';

const PUB = path.join(APP_ROOT, 'public');
const STORE = path.join(APP_ROOT, 'brand', 'store');

/** A square icon: paper ground, mark centred and sized as a share of the side. */
function iconSvg(size, share, { ground = true } = {}) {
  const m = size * share;
  const o = (size - m) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + (ground ? `<rect width="${size}" height="${size}" fill="${C.paper}"/>` : '')
    + `<g transform="translate(${o} ${o}) scale(${m / 32})">${markShapes()}</g></svg>`;
}

/** The favicon: a paper tile with the mark, so it reads on a dark tab strip too. */
export function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">`
    + `<rect width="32" height="32" rx="7" fill="${C.paper}"/>`
    + `<g transform="translate(1.5 1.5) scale(0.9375)">${markShapes()}</g></svg>\n`;
}

/** An .ico holding PNG frames (supported since Vista and by every browser). */
function ico(frames) {
  const head = Buffer.alloc(6 + frames.length * 16);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(frames.length, 4);
  let offset = head.length;
  frames.forEach((f, i) => {
    const e = 6 + i * 16;
    head[e] = f.size === 256 ? 0 : f.size; head[e + 1] = head[e];
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(f.png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += f.png.length;
  });
  return Buffer.concat([head, ...frames.map((f) => f.png)]);
}

const png = async (svg, size, opts) => (await rasterise(svg, size, size, { layout: false, ...opts })).png;
const write = (file, buf) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); };

export const ANY_SHARE = 0.86;      // ring is 0.70 of the side
export const SAFE_SHARE = 0.78;     // ring is 0.63 of the side, inside the 0.80 safe circle
export const ADAPTIVE_SHARE = 0.56; // foreground is 108 units, the mark sits in the central 66

export const IOS_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
export const ANDROID_DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

export async function buildIcons() {
  const made = [];
  const put = (file, buf) => { write(file, buf); made.push(path.relative(APP_ROOT, file).split(path.sep).join('/')); };

  put(path.join(PUB, 'favicon.svg'), Buffer.from(faviconSvg()));
  const fav = [];
  for (const size of [16, 32, 48]) fav.push({ size, png: await png(faviconSvg(), size) });
  put(path.join(PUB, 'favicon.ico'), ico(fav));

  put(path.join(PUB, 'icon-192.png'), await png(iconSvg(192, ANY_SHARE), 192));
  put(path.join(PUB, 'icon-512.png'), await png(iconSvg(512, ANY_SHARE), 512));
  put(path.join(PUB, 'icon-maskable-512.png'), await png(iconSvg(512, SAFE_SHARE), 512));
  put(path.join(PUB, 'icon-maskable.svg'), Buffer.from(`${iconSvg(512, SAFE_SHARE)}\n`));
  put(path.join(PUB, 'apple-touch-icon.png'), await png(iconSvg(180, ANY_SHARE), 180));

  for (const [name, size] of Object.entries(ANDROID_DENSITIES)) {
    put(path.join(STORE, 'android', `ic_launcher-${name}-${size}.png`), await png(iconSvg(size, ANY_SHARE), size));
  }
  put(path.join(STORE, 'android', 'playstore-512.png'), await png(iconSvg(512, ANY_SHARE), 512));
  put(path.join(STORE, 'android', 'adaptive-foreground-432.png'), await png(iconSvg(432, ADAPTIVE_SHARE, { ground: false }), 432, { transparent: true }));
  put(path.join(STORE, 'android', 'adaptive-background-colour.txt'), Buffer.from(`${C.paper}\n`));
  for (const size of IOS_SIZES) {
    put(path.join(STORE, 'ios', `AppIcon-${size}.png`), await png(iconSvg(size, ANY_SHARE), size));
  }
  return made;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildIcons().then((m) => { console.log(m.join('\n')); }).finally(closeBrowser);
}
