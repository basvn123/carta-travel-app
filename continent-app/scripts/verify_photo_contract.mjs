// Data-side verify for the photo engine (02-PHOTO-ENGINE.md section 5).
//
//   node scripts/verify_photo_contract.mjs
//
// No browser: every check here is a statement about the wire files and the
// rich caches, so it reads them directly. The Playwright harnesses
// (verify_beaches.mjs and friends) keep checking what a reader SEES; this
// checks what the engine PROMISED:
//
//   hard fails (exit 1):
//     every published image carries author, licence, licence URL and a
//       source page. The author may be empty only on a licence that owes
//       no attribution (public domain, CC0).
//     no hero rides on geo-tier or street-tier evidence
//     no two images on one row share a pHash bucket (measured on the
//       caches, where the hashes live)
//
//   reported, not yet enforced (they harden when the layer re-harvests
//   with the wider funnel and its index.json says so):
//     photos per rated row against the four-photo target
//     hero months inside the category's preferred set (bar: 80 per cent
//       of beach and lake heroes once months are known at scale)
//
// ASCII clean, no em dashes, per project convention.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const ROOT = path.resolve(APP, '..');

const LAYERS = [
  { name: 'beaches', dir: 'beaches', key: 'beaches', ev: 'ev',
    cacheDir: 'beaches', cacheKey: 'beaches', category: 'beach' },
  { name: 'lakes', dir: 'lakes', key: 'lakes', ev: 'why',
    cacheDir: 'lakes', cacheKey: 'lakes', category: 'lake' },
  { name: 'mountains', dir: 'mountains', key: 'mountains', ev: 'ev',
    cacheDir: 'mountains', cacheKey: 'peaks', category: 'mountain' },
];
const NEVER_HERO = new Set(['geo', 'street']);
const NO_CREDIT_LIC = /public domain|^pd\b|cc0|no restrictions/i;
// Licences that are real and simply have no canonical URL on Commons:
// the bare "Attribution" template and "Copyrighted free use". The author
// requirement still applies to them in full.
const NO_URL_LIC = /^attribution$|copyrighted free use/i;
const PREFERRED = {
  beach: new Set([5, 6, 7, 8, 9]),
  lake: new Set([5, 6, 7, 8, 9, 10]),
};

const failures = [];
const notes = [];
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));

const hamming = (a, b) => {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
};

for (const layer of LAYERS) {
  const wireDir = path.join(APP, 'public', layer.dir);
  if (!existsSync(wireDir)) continue;
  let nImages = 0; let nRows = 0; let underFour = 0;
  let monthKnown = 0; let monthGood = 0;

  for (const file of readdirSync(wireDir)) {
    if (!/^[A-Z]{2}\.json$/.test(file)) continue;
    const data = readJson(path.join(wireDir, file));
    for (const row of data[layer.key] || []) {
      const images = row.images || [];
      if (!images.length) continue;
      nRows += 1;
      if (images.length < 4) underFour += 1;

      const hero = images[0];
      const heroEv = hero[layer.ev] || '';
      if (NEVER_HERO.has(heroEv)) {
        failures.push(`${layer.name} ${file} ${row.name}: hero rides on `
          + `${heroEv} evidence`);
      }
      for (const img of images) {
        nImages += 1;
        const where = `${layer.name} ${file} ${row.name}`;
        if (!img.u && !img.big) failures.push(`${where}: image without a URL`);
        if (!(img.lic || '').trim()) failures.push(`${where}: no licence`);
        if (!(img.by || '').trim() && !NO_CREDIT_LIC.test(img.lic || '')) {
          failures.push(`${where}: ${img.lic} with nobody named`);
        }
        if (!(img.licUrl || '').trim() && !NO_CREDIT_LIC.test(img.lic || '')
            && !NO_URL_LIC.test((img.lic || '').trim())) {
          failures.push(`${where}: no licence URL`);
        }
        if (!(img.page || '').trim()) {
          failures.push(`${where}: no source page`);
        }
      }
    }
  }

  // pHash distinctness and hero months live in the caches.
  const cacheDir = path.join(ROOT, 'cache', layer.cacheDir);
  if (existsSync(cacheDir)) {
    for (const file of readdirSync(cacheDir)) {
      if (!/^rich_[A-Z]{2}\.json$/.test(file)) continue;
      const data = readJson(path.join(cacheDir, file));
      for (const row of data[layer.cacheKey] || []) {
        const images = row.images || [];
        const hashes = images
          .map((i) => i.phash)
          .filter((h) => typeof h === 'string' && h.length === 16);
        for (let i = 0; i < hashes.length; i += 1) {
          for (let j = i + 1; j < hashes.length; j += 1) {
            if (hamming(hashes[i], hashes[j]) <= 6) {
              failures.push(`${layer.name} ${file} ${row.name}: two `
                + `published images share a pHash bucket`);
            }
          }
        }
        const month = images[0] && images[0].month;
        if (PREFERRED[layer.category] && month) {
          monthKnown += 1;
          if (PREFERRED[layer.category].has(month)) monthGood += 1;
        }
      }
    }
  }

  notes.push(`${layer.name}: ${nRows} rows, ${nImages} images, `
    + `${nRows - underFour} rows at the 4-photo target `
    + `(target hardens with the funnel re-harvest)`);
  if (monthKnown >= 30) {
    const pct = Math.round((100 * monthGood) / monthKnown);
    const line = `${layer.name}: hero month preferred for ${pct}% of the `
      + `${monthKnown} heroes with a known month (bar: 80%)`;
    if (pct < 80) failures.push(line); else notes.push(line);
  } else if (monthKnown) {
    notes.push(`${layer.name}: only ${monthKnown} hero months known, `
      + `season bar not yet measurable`);
  }
}

for (const note of notes) console.log('  note  ' + note);
if (failures.length) {
  for (const f of failures.slice(0, 40)) console.log('  FAIL  ' + f);
  if (failures.length > 40) {
    console.log(`  ... and ${failures.length - 40} more`);
  }
  console.log(`\n${failures.length} photo contract failures`);
  process.exit(1);
}
console.log('\nphoto contract holds');
