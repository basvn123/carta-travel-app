#!/usr/bin/env node
/**
 * measure_link_depth.mjs (T225)
 *
 * Internal link depth over a prerender build, from the pages alone.
 *
 *   node scripts/measure_link_depth.mjs <prerender dir> [--json out.json]
 *
 * Method. Read _manifest.json, then every page's HTML, and keep each href
 * that is a path of another page in the manifest (a link to anything else,
 * the app shell included, is not a link a crawler can follow to a page).
 * The roots are the country pages: the home page is the app shell and links
 * none of them yet (T221-c), so a country page is the nearest thing to the
 * front door. Depth is the fewest clicks from any root; a root is depth 0.
 * Reported: pages, indexable pages, median and mean outbound links, pages
 * with fewer than six outbound links, pages nothing links to (orphans),
 * pages no root reaches, the depth histogram, mean depth, and the share
 * within three clicks. The same script runs on the before and after builds.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, '_manifest.json'))) { console.error('usage: measure_link_depth.mjs <prerender dir> [--json out]'); process.exit(1); }
const man = JSON.parse(fs.readFileSync(path.join(dir, '_manifest.json'), 'utf8'));
const pages = man.pages.filter((p) => !p.path.startsWith('/nl/'));
const known = new Map(pages.map((p) => [p.path, p]));
const out = new Map();
const inn = new Map(pages.map((p) => [p.path, 0]));
for (const p of pages) {
  const html = fs.readFileSync(path.join(dir, p.key), 'utf8');
  const set = new Set();
  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const h = m[1].replace(/\/+$/, '') || '/';
    if (h !== p.path && known.has(h)) set.add(h);
  }
  out.set(p.path, set);
  for (const h of set) inn.set(h, inn.get(h) + 1);
}
const roots = pages.filter((p) => p.kind === 'country').map((p) => p.path);
const depth = new Map(roots.map((r) => [r, 0]));
let q = [...roots];
while (q.length) {
  const next = [];
  for (const u of q) for (const v of out.get(u)) if (!depth.has(v)) { depth.set(v, depth.get(u) + 1); next.push(v); }
  q = next;
}
const outs = pages.map((p) => out.get(p.path).size).sort((a, b) => a - b);
const median = outs[outs.length >> 1];
const hist = {};
let sum = 0; let reach = 0; let within3 = 0;
for (const d of depth.values()) { hist[d] = (hist[d] || 0) + 1; sum += d; reach += 1; if (d <= 3) within3 += 1; }
const byKind = {};
for (const p of pages) {
  const k = (byKind[p.kind] ||= { pages: 0, orphans: 0, unreached: 0, depthSum: 0, reached: 0 });
  k.pages += 1;
  if (inn.get(p.path) === 0) k.orphans += 1;
  if (!depth.has(p.path)) k.unreached += 1; else { k.depthSum += depth.get(p.path); k.reached += 1; }
}
for (const k of Object.values(byKind)) { k.meanDepth = k.reached ? +(k.depthSum / k.reached).toFixed(2) : null; delete k.depthSum; delete k.reached; }
const res = {
  pages: pages.length, indexable: pages.filter((p) => p.indexable).length,
  outbound: { median, mean: +(outs.reduce((a, b) => a + b, 0) / outs.length).toFixed(2), under6: outs.filter((n) => n < 6).length },
  orphans: [...inn.values()].filter((n) => n === 0).length,
  unreached: pages.length - reach,
  meanDepth: +(sum / reach).toFixed(3), withinThree: +(100 * within3 / pages.length).toFixed(1),
  histogram: hist, byKind,
};
console.log(JSON.stringify(res, null, 1));
const j = process.argv.indexOf('--json');
if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(res, null, 1));
