// Checks lib/urlScheme.js and lib/pathBoot.js (T223). Plain node, no browser.
// With a dossier directory argument it also checks every real slug:
//   node scripts/verify_url_scheme.mjs [path/to/public/dossier]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  paths, parsePath, pathToLegacyHash, legacyHashToPath, canonicalFor,
  alternates, reservedCollisions, slugify, SECTION_WORDS, COUNTRY_SLUGS,
} from '../src/lib/urlScheme.js';
import { bootPaths } from '../src/lib/pathBoot.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };

// Round trips, one per entity type.
const trail = paths.trail('ES', 176172, 'Estels del Sud');
eq(trail, '/spain/trails/176172-estels-del-sud');
eq(parsePath(trail), { kind: 'trail', id: 176172, cc: 'ES', lang: 'en' });
eq(legacyHashToPath('#trail=176172&tc=ES'), '/spain/trails/176172');
eq(pathToLegacyHash(parsePath('/spain/trails/176172')), '#trail=176172&tc=ES');
const beach = paths.beach('AL', 'al-beach-of-durres-Q3302169');
eq(beach, '/albania/beaches/al-beach-of-durres-q3302169');
eq(parsePath(beach).id, 'al-beach-of-durres-Q3302169', 'Q restored');
eq(parsePath(paths.beach('AL', 'al-vlore-al705')).id, 'al-vlore-al705');
eq(parsePath(paths.lake('AT', 'at-x-w221975449')).kind, 'lake');
eq(parsePath(paths.mountain('AD', 'ad-pic-osmn9127648546')).kind, 'mountain');
eq(parsePath(paths.cycle('ES', 56578, 'Galisteo - Cáceres')).kind, 'cycle');
eq(parsePath(paths.tour('DE', 'de-ammer-amper-radweg-balanced')).slug, 'de-ammer-amper-radweg-balanced');
eq(legacyHashToPath('#tour=de-ammer-amper-radweg-balanced'), '/germany/cycling/tours/de-ammer-amper-radweg-balanced');
eq(parsePath(paths.region('AT', 'AT11', 'Burgenland')), { kind: 'region', id: 'AT11', cc: 'AT', lang: 'en' });
eq(parsePath('/albania/regions/coast_al-al035-4').id, 'COAST_AL-AL035-4');
eq(legacyHashToPath('#region=COAST_AL-AL015'), '/albania/regions/coast_al-al015');
eq(parsePath(paths.trip('ad-andorra-la-vella-barcelona-chain-5d')).kind, 'trip');
eq(legacyHashToPath('#itin=ad-x-5d'), '/trips/ad-x-5d');
eq(parsePath('/spain/malaga'), { kind: 'dest', slug: 'spain/malaga', cc: 'ES', lang: 'en' });
eq(parsePath('/spain/malaga/cost').kind, 'cost');
eq(parsePath('/spain/trails/2'), { kind: 'section', section: 'trails', page: 2, cc: 'ES', lang: 'en' });
eq(parsePath('/spain/trails').page, 1);
eq(parsePath('/spain/4-days/under-60'), { kind: 'days', days: 4, band: 60, cc: 'ES', lang: 'en' });
eq(parsePath('/nl/spain/malaga').lang, 'nl');
eq(paths.dest('spain/malaga', 'nl'), '/nl/spain/malaga');
eq(parsePath('/spain'), { kind: 'country', cc: 'ES', lang: 'en' });

// Things that must not parse.
for (const bad of ['/', '/spain/trails/2/3', '/spain/nowhere/x/y', '/mars', '/spain/trails/abc', '/Spain', '/spain/trails/1-a/extra', '/assets/index.js']) {
  eq(parsePath(bad), null, bad);
}
eq(paths.trail('ZZ', 1, 'x'), null);
eq(paths.section('ES', 'cost'), null);

// Reserved words: every section word is rejected as a place word.
for (const w of SECTION_WORDS) ok(reservedCollisions([`spain/${w}`]).length === 1, w);
ok(reservedCollisions(['spain/4-days']).length === 1);
ok(reservedCollisions(['spain/malaga']).length === 0);
eq(Object.keys(COUNTRY_SLUGS).length, 43);

// Slugs fold diacritics and cap length on a word boundary.
eq(slugify('Galisteo – Cáceres'), 'galisteo-caceres');
eq(slugify('Gårdsø Straße'), 'gardso-strasse');
ok(slugify('a '.repeat(60)).length <= 48);

// Canonicals.
const base = { kind: 'trail', cc: 'ES', id: 9, title: 'Stage Three', lang: 'en' };
eq(canonicalFor({ ...base, cls: 'stage' }), { canonical: '/spain/trails/9-stage-three', indexable: true, sitemap: true });
eq(canonicalFor({ ...base, cls: 'parent' }).canonical, '/spain/trails/9-stage-three');
const v = canonicalFor({ ...base, cls: 'variant', of: { cc: 'ES', id: 4, title: 'Main Line' } });
eq(v, { canonical: '/spain/trails/4-main-line', indexable: true, sitemap: false });
eq(canonicalFor({ ...base, belowFloor: true }), { canonical: '/spain/trails/9-stage-three', indexable: false, sitemap: false });
eq(canonicalFor({ ...base, lang: 'de', cls: 'stage' }).canonical, '/de/spain/trails/9-stage-three');
eq(canonicalFor({ kind: 'cycle', cc: 'ES', id: 5, title: 'A', dupOf: { cc: 'ES', id: 6, title: 'B' } }).canonical, '/spain/cycling/6-b');

// hreflang: reciprocal and self-including.
const alt = alternates('/de/spain/trails/9-x');
eq(alt.length, 7);
ok(alt.some((a) => a.hreflang === 'de' && a.path === '/de/spain/trails/9-x'));
ok(alt.some((a) => a.hreflang === 'x-default' && a.path === '/spain/trails/9-x'));

// pathBoot: path in, hash out; flag off leaves hashes alone; flag on redirects.
const fake = (pathname, hash = '', search = '') => {
  const calls = { replaced: null, state: null };
  return {
    calls,
    loc: { pathname, hash, search, replace: (u) => { calls.replaced = u; } },
    hist: { replaceState: (_a, _b, u) => { calls.state = u; } },
  };
};
let f = fake('/spain/trails/176172-estels-del-sud');
eq(bootPaths(f.loc, f.hist, false), 'path-to-hash');
eq(f.calls.state, '/#trail=176172&tc=ES');
f = fake('/spain/malaga');
eq(bootPaths(f.loc, f.hist, false), 'none');
f = fake('/', '#trail=176172&tc=ES');
eq(bootPaths(f.loc, f.hist, false), 'none');
eq(f.calls.replaced, null);
eq(bootPaths(f.loc, f.hist, true), 'hash-to-path');
eq(f.calls.replaced, '/spain/trails/176172');
f = fake('/', '#access_token=abc&type=recovery');
eq(bootPaths(f.loc, f.hist, true), 'none', 'auth hashes untouched');

// Real data, when a dossier directory is given.
const dir = process.argv[2];
if (dir) {
  const slugs = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const d = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (d.slug) slugs.push(d.slug);
  }
  eq(new Set(slugs).size, slugs.length, 'slugs unique');
  eq(reservedCollisions(slugs), [], 'no dossier slug collides');
  ok(slugs.length > 3000, 'minimum count, not a vacuous pass');
  for (const s of slugs) assert.equal(paths.dest(s), `/${s}`);
  console.log(`checked ${slugs.length} dossier slugs`);
}
console.log(`url scheme: ${n} checks passed`);
