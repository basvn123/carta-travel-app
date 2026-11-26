/**
 * icons.mjs, builds the favicon, the app icon set and the store masters from
 * the one mark, on the product's own tokens.
 *
 * The mark (house style G1, 2026-11): the blaze, the waymark painted on a
 * rock, white halo, square umber stripe, short ink heel, on an umber 600
 * tile. It carries no letters, so it does not depend on the app's name
 * (DESIGN.md "Shell": the wordmark slot takes any name). At 16 and 32 px the
 * heel and the halo's hairline would be under a pixel, so those frames draw
 * the halo and the stripe with a heavier heel.
 *
 * `--out <dir>` writes the whole set under <dir>/public and
 * <dir>/brand/store instead of the live folders: public/ is protected, so a
 * new set is staged first and copied in when the owner agrees.
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
 * launcher mask can cut a corner of the blaze (check.mjs measures it from the
 * blaze's own box, BLAZE_HALF_DIAGONAL).
 *
 * Run from continent-app/:  node scripts/og/icons.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ROOT, C } from './tokens.mjs';
import { blazeShapes } from './cards.mjs';
import { rasterise, closeBrowser } from './render.mjs';

const outArg = process.argv.indexOf('--out');
const ROOT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : APP_ROOT;
const PUB = path.join(ROOT, 'public');
const STORE = path.join(ROOT, 'brand', 'store');

/* Owner 2026-10-21 had brought back the T212 compass on a cream tile. The
   house style (owner 2026-11-13: a full custom house style; DESIGN.md bans a
   compass rose) makes the blaze the mark, on the umber the owner kept. The
   new set is staged with --out; the owner's copy into public/ is the switch. */
const ICON_GROUND = C.accent;

/** Half the blaze box's diagonal as a share of its width (24 x 14 units). */
export const BLAZE_HALF_DIAGONAL = Math.hypot(12, 7) / 24;

/** A square icon: umber ground, the blaze centred, `share` of the side wide. */
function iconSvg(size, share, { ground = true } = {}) {
  const bw = size * share;
  const bh = (bw * 14) / 24;
  const ox = (size - bw) / 2;
  const oy = (size - bh) / 2;
  const simple = size <= 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + (ground ? `<rect width="${size}" height="${size}" fill="${ICON_GROUND}"/>` : '')
    + `<g transform="translate(${ox} ${oy}) scale(${bw / 24})">${blazeShapes({ simple, edge: C.card })}</g></svg>`;
}

/** The favicon: an umber tile with the blaze; it reads on a light and a dark tab strip. */
export function faviconSvg({ simple = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">`
    + `<rect width="32" height="32" rx="7" fill="${ICON_GROUND}"/>`
    + `<g transform="translate(3 8.4) scale(${26 / 24})">${blazeShapes({ simple, edge: C.card })}</g></svg>\n`;
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

// The blaze's width as a share of the side. Its corners reach
// share x BLAZE_HALF_DIAGONAL from the centre (0.58 of its width).
export const ANY_SHARE = 0.74;      // corners at 0.43 of the side: a margin round the mark
export const SAFE_SHARE = 0.6;      // corners at 0.35, inside the 0.40 safe circle
export const ADAPTIVE_SHARE = 0.5;  // foreground is 108 units, corners inside the central 66

export const IOS_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
export const ANDROID_DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

export async function buildIcons() {
  const made = [];
  const put = (file, buf) => { write(file, buf); made.push(path.relative(APP_ROOT, file).split(path.sep).join('/')); };

  put(path.join(PUB, 'favicon.svg'), Buffer.from(faviconSvg()));
  const fav = [];
  for (const size of [16, 32, 48]) fav.push({ size, png: await png(faviconSvg({ simple: size <= 32 }), size) });
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
  put(path.join(STORE, 'android', 'adaptive-background-colour.txt'), Buffer.from(`${ICON_GROUND}\n`));
  for (const size of IOS_SIZES) {
    put(path.join(STORE, 'ios', `AppIcon-${size}.png`), await png(iconSvg(size, ANY_SHARE), size));
  }
  return made;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // K1 (decision 0018, 2026-11-26): the icons are the Viantra arch from the
  // signed-off kit in brand/viantra/. This script draws the old blaze, so a
  // plain run would put the old mark back next to the new name.
  if (!process.argv.includes('--legacy-blaze')) {
    console.error('icons.mjs draws the retired blaze. The icons come from brand/viantra/ (see its README). Pass --legacy-blaze to run it anyway.');
    process.exit(1);
  }
  buildIcons().then((m) => { console.log(m.join('\n')); }).finally(closeBrowser);
}
