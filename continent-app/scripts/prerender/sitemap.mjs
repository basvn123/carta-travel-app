#!/usr/bin/env node
/**
 * sitemap.mjs, the sitemap generator (T222).
 *
 * Runs as the last step of scripts/prerender/build.mjs, so the sitemaps are
 * rebuilt with every prerender and can never disagree with the pages. It can
 * also be run alone over an existing build:
 *
 *   node scripts/prerender/sitemap.mjs [--manifest dist-prerender/_manifest.json]
 *
 * Output goes to <build dir>/sitemaps/ (never into public/: generated files
 * stay out of git, and 32,000 URLs do not belong in the 20,000-file Pages
 * deploy). push.mjs uploads that folder with the pages, and the Pages
 * Function serves /sitemap.xml and /sitemap-*.xml from it (src/lib/
 * prerenderShell.js sitemapKey). Beside it, <build dir>/_sitemap.json holds
 * the counts, and its floor_line is the page-floor line that opens the
 * monthly sheet (docs/SEO.md, register T205-d).
 *
 * What goes in. A manifest page is listed only when it is indexable, is its
 * own canonical (variants and duplicates point elsewhere and stay out) and,
 * for the six catalogue kinds, met the page floor when the build ran
 * (floor.mjs). English only: hreflang wave one. lastmod is the record's own
 * generated_at (the data vintage), never the build time; a page without one
 * gets no lastmod rather than a made-up date.
 *
 * Layout: an index at /sitemap.xml over one file per page type, so Search
 * Console reports indexation per type: destinations, costs (the T224 week
 * pages), trails, cycling, beaches, lakes, mountains, trips, journeys,
 * countries (countries, their section lists, the NUTS2 regions and the T224
 * trip-length pages) and site (the home page and
 * /about/numbers). A file that would pass 50,000 URLs or 45 MB is split into
 * -2, -3 and so on; today none does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN } from './html.mjs';

export const MAX_URLS = 50000;
export const MAX_BYTES = 45 * 1024 * 1024; // the limit is 50 MB; keep headroom

export const GROUP_OF = Object.freeze({
  dest: 'destinations', trail: 'trails', cycle: 'cycling', tour: 'cycling',
  beach: 'beaches', lake: 'lakes', mountain: 'mountains', trip: 'trips', journey: 'journeys',
  country: 'countries', section: 'countries', region: 'countries',
  // T224: the trip-length pages are country pages; the cost pages get their
  // own file, so Search Console reports their indexation apart from the
  // destination pages they sit under.
  days: 'countries', cost: 'costs',
});
const GROUP_ORDER = ['site', 'countries', 'destinations', 'costs', 'trails', 'cycling', 'beaches', 'lakes', 'mountains', 'trips', 'journeys'];

/** Pages that are not in the manifest: the home page and the T318 explainer. */
export function sitePages(coverageDate) {
  return [
    { path: '/', lastmod: null },
    { path: '/about/numbers', lastmod: day(coverageDate) },
  ];
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

/** Decides, for each manifest page, in or out and why. */
export function select(pages) {
  const groups = new Map();
  const out = { total: pages.length, listed: 0, excluded: {} };
  const skip = (kind, why) => {
    out.excluded[kind] ||= {};
    out.excluded[kind][why] = (out.excluded[kind][why] || 0) + 1;
  };
  for (const p of pages) {
    if (p.floor && !p.floor.ok) { skip(p.kind, 'below the page floor'); continue; }
    if (!p.indexable) { skip(p.kind, 'noindex'); continue; }
    if ((p.canonical || p.path) !== p.path) { skip(p.kind, 'canonical is another page'); continue; }
    const g = GROUP_OF[p.kind];
    if (!g) { skip(p.kind, 'no sitemap group'); continue; }
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ path: p.path, lastmod: day(p.lastmod), kind: p.kind });
    out.listed += 1;
  }
  return { groups, summary: out };
}

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
const entryXml = (e) => `  <url><loc>${esc(ORIGIN + e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>\n`;
const urlset = (entries) => `${HEAD}${entries.map(entryXml).join('')}</urlset>\n`;

/** Splits entries into files under both limits. */
export function chunk(entries) {
  const files = [];
  let cur = [];
  let bytes = Buffer.byteLength(HEAD) + 12;
  for (const e of entries) {
    const n = Buffer.byteLength(entryXml(e));
    if (cur.length >= MAX_URLS || bytes + n > MAX_BYTES) { files.push(cur); cur = []; bytes = Buffer.byteLength(HEAD) + 12; }
    cur.push(e);
    bytes += n;
  }
  if (cur.length) files.push(cur);
  return files;
}

const sumOf = (o, k) => Object.values(o).reduce((s, v) => s + (v[k] || 0), 0);
const n = (v) => v.toLocaleString('en-GB');

/**
 * Writes sitemaps/ and _sitemap.json under `buildDir` from a manifest object.
 * Returns the report (also written to _sitemap.json).
 */
export function writeSitemaps(manifest, buildDir, { coverageDate = null } = {}) {
  const dir = path.join(buildDir, 'sitemaps');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { groups, summary } = select(manifest.pages);
  groups.set('site', sitePages(coverageDate).map((p) => ({ ...p, kind: 'site' })));
  summary.listed += groups.get('site').length;

  const files = [];
  for (const g of GROUP_ORDER) {
    const entries = (groups.get(g) || []).sort((a, b) => a.path.localeCompare(b.path));
    if (!entries.length) continue;
    chunk(entries).forEach((part, i) => {
      const name = `sitemap-${g}-en${i ? `-${i + 1}` : ''}.xml`;
      const xml = urlset(part);
      fs.writeFileSync(path.join(dir, name), xml, 'utf8');
      const lastmods = part.map((e) => e.lastmod).filter(Boolean).sort();
      files.push({ name, group: g, urls: part.length, bytes: Buffer.byteLength(xml), lastmod: lastmods.at(-1) || null });
    });
  }
  const index = ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const f of files) index.push(`  <sitemap><loc>${ORIGIN}/${f.name}</loc>${f.lastmod ? `<lastmod>${f.lastmod}</lastmod>` : ''}</sitemap>`);
  index.push('</sitemapindex>', '');
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), index.join('\n'), 'utf8');

  // The page floor, counted. `floored` is judged from the build's own page
  // models; `listed_rows` (rows with no page) comes from the wire in pass one.
  const floored = {};
  for (const p of manifest.pages) {
    if (!p.floor) continue;
    const k = (floored[p.kind] ||= { pages: 0, ok: 0, title: 0, coords: 0, image: 0, facts: 0, imageOnlyMiss: 0 });
    k.pages += 1;
    for (const c of ['title', 'coords', 'image', 'facts']) if (p.floor[c]) k[c] += 1;
    if ('measured' in p.floor) k.measured = (k.measured || 0) + (p.floor.measured ? 1 : 0);
    if (p.floor.ok) k.ok += 1;
    if (!p.floor.image && p.floor.title && p.floor.coords && p.floor.facts) k.imageOnlyMiss += 1;
  }
  const listed = manifest.floor_listed || null;
  const unpaged = listed ? sumOf(listed.rows, 'total') + (listed.regions?.total || 0) : null;
  const unpagedOk = listed ? sumOf(listed.rows, 'ok') : null;
  // The cost pages (T224) are counted on their own clause, so the catalogue
  // figure keeps the meaning it had in T222's first line.
  const { cost: costFloor, ...catalogue } = floored;
  const floorLine = `Page floor ${day(manifest.generated_at)}: ${n(sumOf(catalogue, 'ok'))} of ${n(sumOf(catalogue, 'pages'))} catalogue pages meet it and are in the sitemap`
    + (listed ? `; ${n(unpaged)} listed-only rows and coast or range regions have no page, of which ${n(unpagedOk)} would clear it` : '')
    + (costFloor ? `; ${n(costFloor.ok)} of ${n(costFloor.pages)} week cost pages have a figure measured in or near the town and are in the sitemap` : '')
    + `; ${n(summary.listed)} URLs in all.`;
  const report = {
    generated_at: manifest.generated_at, floor_line: floorLine, urls: summary.listed, files, floored,
    excluded: summary.excluded, listed_rows: listed,
  };
  fs.writeFileSync(path.join(buildDir, '_sitemap.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function main() {
  const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--manifest');
  const manifestPath = path.resolve(APP, i >= 0 ? argv[i + 1] : path.join('dist-prerender', '_manifest.json'));
  if (!fs.existsSync(manifestPath)) { console.error(`[sitemap] no manifest at ${manifestPath}; run build.mjs first`); process.exit(1); }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const r = writeSitemaps(manifest, path.dirname(manifestPath), { coverageDate: manifest.coverage_date || null });
  for (const f of r.files) console.log(`[sitemap] ${f.name}: ${f.urls} URLs, ${f.bytes} bytes`);
  console.log(`[sitemap] ${r.floor_line}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
