#!/usr/bin/env node
/**
 * verify_prerender.mjs, checks a prerender build and the Function that serves
 * it (T221). Read-only: it reads the build directory and never writes.
 *
 *   node scripts/verify_prerender.mjs <dist-prerender dir> [--shell dist/index.html]
 *
 * Over every page: both markers, one h1, a title and description inside the
 * docs/SEO.md limits, an absolute canonical on www, a JSON-LD graph that
 * parses and carries no AggregateRating and no Offer, no em dash, en dash or
 * middot anywhere, and every internal content link pointing at a page that
 * exists in the same build. Then public/_routes.json against routesJson(),
 * and the Function itself against a fake bucket made of this directory and a
 * fake static server, for every page kind: rendered HTML with the page's
 * title, the shell's security headers carried over, a stale slug answered
 * with the same page, and every miss handed to the static deploy.
 *
 * The T224 families: every cost page's receipt adds up (the printed lines sum
 * to the printed total, to the cent), names no flight, and sits under a
 * destination page of the same build; every trip-length page lists at least
 * DAYS_MIN_PLACES places, and no two of them list the same places.
 *
 * Prints a per-kind table (pages, median bytes, median words a crawler reads
 * without JavaScript, median internal links) and exits non-zero on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  prerenderKey, cardKey, spliceShell, routesJson, HEAD_OPEN, HEAD_CLOSE, BODY_OPEN, BODY_CLOSE,
} from '../src/lib/prerenderShell.js';
import { parsePath } from '../src/lib/urlScheme.js';
import { DAYS_MIN_PLACES } from './prerender/floor.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dir = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(APP, 'dist-prerender'));
const shellArg = argv.includes('--shell') ? argv[argv.indexOf('--shell') + 1] : null;
const failures = [];
const fail = (msg) => { if (failures.length < 200) failures.push(msg); else failures.length += 0; };
let checks = 0;
const ok = (cond, msg) => { checks += 1; if (!cond) fail(msg); return cond; };

const manifest = JSON.parse(fs.readFileSync(path.join(dir, '_manifest.json'), 'utf8'));
const keys = new Set(manifest.pages.map((p) => p.key));
// Em dash, en dash, bullet, and a middot unless it sits between two letters
// (the Catalan geminated l in Millenari is a letter, not a separator).
const BANNED = /[\u2014\u2013\u2022]|(?<!\p{L})\u00b7|\u00b7(?!\p{L})/u;
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i); return i < 0 || j < 0 ? null : s.slice(i + a.length, j); };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();

const euros = (s) => Number(String(s).replace(/[^0-9.]/g, ''));
function checkCost(pg, body) {
  const lines = [...body.matchAll(/<tr class="l"><th scope="row">[^<]*<\/th><td class="n">([^<]+)<\/td><\/tr>/g)].map((m) => euros(m[1]));
  const total = /<tr class="t"><th scope="row">[^<]*<\/th><td class="n">([^<]+)<\/td>/.exec(body)?.[1];
  ok(lines.length >= 2 && total != null, `${pg.key}: cost page without a receipt`);
  const sum = Math.round(lines.reduce((a, v) => a + v, 0) * 100);
  ok(total != null && sum === Math.round(euros(total) * 100), `${pg.key}: receipt lines sum to ${sum / 100}, total says ${total}`);
  ok(/Flights are not/.test(body) && !/flight from|airfare|fare of/i.test(body), `${pg.key}: no-flights sentence missing or a flight priced`);
  ok(keys.has(pg.key.replace(/\/cost\.html$/, '.html')), `${pg.key}: no destination page beside it`);
}
// T225: a receipt page adds up to the cent, prices no flight, and sits under
// a trip page and links the destination pages it prices.
function checkReceipt(pg, body) {
  const lines = [...body.matchAll(/<tr class="l"><th scope="row">[^<]*<\/th><td class="n">([^<]+)<\/td><\/tr>/g)].map((m) => euros(m[1]));
  const total = /<tr class="t"><th scope="row">[^<]*<\/th><td class="n">([^<]+)<\/td>/.exec(body)?.[1];
  ok(lines.length >= 4 && total != null, `${pg.key}: receipt page without a receipt`);
  const sum = Math.round(lines.reduce((a, v) => a + v, 0) * 100);
  ok(total != null && sum === Math.round(euros(total) * 100), `${pg.key}: receipt lines sum to ${sum / 100}, total says ${total}`);
  ok(/Flights are not/.test(body) && !/flight from|airfare|fare of/i.test(body), `${pg.key}: no-flights sentence missing or a flight priced`);
  ok(keys.has(pg.key.replace(/\/receipt\.html$/, '.html')), `${pg.key}: no trip page above it`);
  const stops = new Set([...body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => parsePath(h)?.kind === 'dest'));
  ok(stops.size >= 2, `${pg.key}: links ${stops.size} destination pages, a week has at least two stops`);
}
const daysLists = new Map();
function checkDays(pg, body) {
  const first = /<ul class="pr-list">([\s\S]*?)<\/ul>/.exec(body)?.[1] || '';
  const items = [...first.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  ok(items.length >= DAYS_MIN_PLACES, `${pg.key}: lists ${items.length} places, the floor is ${DAYS_MIN_PLACES}`);
  ok(items.every((h) => parsePath(h)?.kind === 'cost'), `${pg.key}: the place list links something other than cost pages`);
  // The same set of places on two budget pages of one length is a copy.
  const p = parsePath(pg.path);
  const sig = `${p.cc}|${p.days}|${[...items].sort().join(" ")}`;
  ok(!daysLists.has(sig), `${pg.key}: lists the same places as ${daysLists.get(sig)}`);
  daysLists.set(sig, pg.key);
}

const stats = {};
const dangling = new Map();
let overTitle = 0;
for (const pg of manifest.pages) {
  const html = fs.readFileSync(path.join(dir, pg.key), 'utf8');
  const head = between(html, HEAD_OPEN, HEAD_CLOSE);
  const body = between(html, BODY_OPEN, BODY_CLOSE);
  if (!ok(head != null && body != null, `${pg.key}: markers missing`)) continue;
  const title = /<title>([^<]*)<\/title>/.exec(head)?.[1] || '';
  const desc = /<meta name="description" content="([^"]*)"/.exec(head)?.[1] || '';
  ok(title.length > 0, `${pg.key}: empty title`);
  if (title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").length > 60) overTitle += 1;
  ok(desc.length > 0 && desc.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').length <= 156, `${pg.key}: description length ${desc.length}`);
  ok((body.match(/<h1>/g) || []).length === 1, `${pg.key}: not exactly one h1`);
  const canon = /<link rel="canonical" href="([^"]+)"/.exec(head)?.[1] || '';
  ok(canon.startsWith('https://www.carta-europetravel.com/'), `${pg.key}: canonical ${canon}`);
  ok(prerenderKey(new URL(canon).pathname) != null, `${pg.key}: canonical has no page key`);
  ok(!BANNED.test(textOf(html)) && !BANNED.test(title) && !BANNED.test(desc), `${pg.key}: em dash, en dash, middot or bullet in text`);
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head)?.[1];
  let graph = null;
  try { graph = JSON.parse(ld); } catch { /* reported below */ }
  if (ok(graph && Array.isArray(graph['@graph']), `${pg.key}: JSON-LD does not parse`)) {
    const s = JSON.stringify(graph);
    ok(!/AggregateRating|"Offer"|"offers"/.test(s), `${pg.key}: rating or offer markup`);
    ok(graph['@graph'].some((n) => n['@type'] === 'BreadcrumbList'), `${pg.key}: no BreadcrumbList`);
  }
  const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.startsWith('/'));
  let internal = 0;
  for (const h of hrefs) {
    if (h === '/') continue;
    const k = prerenderKey(h);
    if (k && keys.has(k)) internal += 1;
    else if (parsePath(h)) dangling.set(h, pg.key);
  }
  if (pg.kind === 'cost') checkCost(pg, body);
  if (pg.kind === 'days') checkDays(pg, body);
  if (pg.kind === 'receipt') checkReceipt(pg, body);
  const s = (stats[pg.kind] ||= { n: 0, bytes: [], words: [], links: [] });
  s.n += 1;
  s.bytes.push(Buffer.byteLength(html));
  s.words.push(textOf(body).split(' ').length);
  s.links.push(internal);
}
ok(dangling.size === 0, `${dangling.size} internal links point at a page this build does not have, e.g. ${[...dangling].slice(0, 3).map(([h, k]) => `${h} on ${k}`).join(', ')}`);

// _routes.json in public/ must be the one the module computes.
const routes = JSON.parse(fs.readFileSync(path.join(APP, 'public', '_routes.json'), 'utf8'));
ok(JSON.stringify(routes) === JSON.stringify(routesJson()), 'public/_routes.json differs from routesJson()');
ok(routes.include.length + routes.exclude.length <= 100 && routes.include.every((r) => r.length <= 100), '_routes.json over the Pages limits');
const covered = (p) => routes.include.some((r) => (r.endsWith('*') ? p.startsWith(r.slice(0, -1)) : p === r));
for (const pg of manifest.pages) ok(covered(pg.path), `${pg.path}: not covered by _routes.json, the Function would never see it`);
ok(!covered('/') && !covered('/assets/index.js') && !covered('/boot.json') && !covered('/og/site.png'), '_routes.json catches static paths');

// The Function, against this directory as the bucket and a fake static server.
const shellHtml = shellArg ? fs.readFileSync(shellArg, 'utf8') : fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const CSP = "default-src 'self'";
const bucket = {
  async get(key) {
    const f = path.join(dir, key);
    if (key.includes('..') || !fs.existsSync(f)) return null;
    const buf = fs.readFileSync(f);
    return { text: async () => buf.toString('utf8'), body: buf };
  },
};
const assets = { fetch: async () => new Response(shellHtml, { status: 200, headers: { 'content-type': 'text/html', 'content-security-policy': CSP, 'x-frame-options': 'DENY' } }) };
const { onRequest } = await import(pathToFileURL(path.join(APP, 'functions', '[[path]].js')).href);
const NEXT = new Response('static', { status: 404, headers: { 'x-from': 'next' } });
const call = (p, { method = 'GET', env = { PRERENDER: bucket, ASSETS: assets } } = {}) => onRequest({
  request: new Request(`https://www.carta-europetravel.com${p}`, { method }), env, next: async () => NEXT,
});

const firstOf = {};
for (const pg of manifest.pages) firstOf[pg.kind] ||= pg;
for (const [kind, pg] of Object.entries(firstOf)) {
  const res = await call(pg.path);
  const html = await res.text();
  const want = /<title>([^<]*)<\/title>/.exec(fs.readFileSync(path.join(dir, pg.key), 'utf8'))[1];
  ok(res.status === 200 && res.headers.get('x-carta-prerender') === pg.key, `Function ${kind}: status ${res.status} for ${pg.path}`);
  ok(html.includes(`<title>${want}</title>`) && (html.match(/<title>/g) || []).length === 1, `Function ${kind}: title not the page's, or two titles`);
  ok(res.headers.get('content-security-policy') === CSP && res.headers.get('x-frame-options') === 'DENY', `Function ${kind}: security headers not carried over`);
  ok(/<div id="root"><!--carta:body-->/.test(html) && html.includes('<script type="module"'), `Function ${kind}: page not inside the shell, or the app script missing`);
  ok(spliceShell(shellHtml, fs.readFileSync(path.join(dir, pg.key), 'utf8')) === html, `Function ${kind}: response differs from spliceShell`);
}
const trail = firstOf.trail;
if (trail) {
  const stale = trail.path.replace(/-[a-z0-9-]+$/, '-an-old-title');
  const r1 = await call(stale);
  ok(r1.status === 200 && (await r1.text()).includes(`href="https://www.carta-europetravel.com${trail.canonical}"`), 'stale slug not answered with the page and its canonical');
  const r2 = await call(trail.path, { method: 'HEAD' });
  ok(r2.status === 200 && (await r2.text()) === '', 'HEAD not answered without a body');
  const r3 = await call(trail.path, { env: { ASSETS: assets } });
  ok(r3.headers.get('x-from') === 'next', 'no binding did not fall through to the static deploy');
  const noCsp = { fetch: async () => new Response(shellHtml, { status: 200 }) };
  const r4 = await call(trail.path, { env: { PRERENDER: bucket, ASSETS: noCsp } });
  ok(r4.headers.get('x-from') === 'next', 'a shell without a CSP was served from');
}
for (const p of ['/spain/trails/999999999-nope', '/guides/abc', '/spain/no-such-town/cost', '/spain/9-days', '/spain/4-days/under-5', '/nl/spain', '/trips/AT.json', '/Spain', '/x']) {
  const r = await call(p);
  ok(r.headers.get('x-from') === 'next', `Function: ${p} should fall through, got ${r.status}`);
}
ok((await call('/spain', { method: 'POST' })).headers.get('x-from') === 'next', 'POST not handed on');
ok(cardKey('/og/p/en/austria.png') === 'og/en/austria.png' && cardKey('/og/site.png') === null && cardKey('/og/p/../x.png') === null, 'cardKey');

// The sitemaps (T222): well formed, inside the protocol limits, every loc an
// absolute www URL that is a manifest page's own canonical and met the floor,
// nothing eligible left out, and the Function serves them from the bucket.
const SM = path.join(dir, 'sitemaps');
const WWW = 'https://www.carta-europetravel.com';
if (ok(fs.existsSync(path.join(SM, 'sitemap.xml')), 'sitemaps/sitemap.xml missing: run build.mjs or sitemap.mjs')) {
  const byPath = new Map(manifest.pages.map((p) => [p.path, p]));
  const indexXml = fs.readFileSync(path.join(SM, 'sitemap.xml'), 'utf8');
  ok(indexXml.startsWith('<?xml') && /<sitemapindex /.test(indexXml) && indexXml.trimEnd().endsWith('</sitemapindex>'), 'sitemap index malformed');
  const named = [...indexXml.matchAll(/<sitemap><loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(named.length > 0 && named.length <= 50000, 'sitemap index lists no files or too many');
  const seen = new Set();
  let urls = 0;
  for (const loc of named) {
    const name = loc.slice(WWW.length + 1);
    ok(loc.startsWith(WWW + '/sitemap-') && /^sitemap-[a-z]+-en(-[0-9]+)?\.xml$/.test(name), `index loc not a sitemap file: ${loc}`);
    const f = path.join(SM, name);
    if (!ok(fs.existsSync(f), `${name}: listed in the index but missing`)) continue;
    const xml = fs.readFileSync(f, 'utf8');
    const locs = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>)?<\/url>/g)];
    ok(xml.startsWith('<?xml') && xml.trimEnd().endsWith('</urlset>') && locs.length === (xml.match(/<url>/g) || []).length, `${name}: malformed`);
    ok(locs.length > 0 && locs.length <= 50000 && Buffer.byteLength(xml) <= 50 * 1024 * 1024, `${name}: ${locs.length} URLs, ${Buffer.byteLength(xml)} bytes`);
    urls += locs.length;
    for (const m of locs) {
      ok(m[1].startsWith(WWW + '/') && !/[?#\s]/.test(m[1]) && !seen.has(m[1]), `${name}: bad or repeated loc ${m[1]}`);
      seen.add(m[1]);
      const p = m[1].slice(WWW.length);
      const pg = byPath.get(p);
      if (pg) {
        ok(pg.indexable && pg.canonical === p && (!pg.floor || pg.floor.ok), `${name}: ${p} is noindex, below the floor or not its own canonical`);
        ok(!m[2] || (pg.lastmod || '').startsWith(m[2]), `${name}: ${p} lastmod is not the record's own`);
      } else ok(p === '/' || p === '/about/numbers', `${name}: ${p} is not a manifest page or a known site page`);
    }
  }
  const eligible = manifest.pages.filter((p) => p.indexable && p.canonical === p.path && (!p.floor || p.floor.ok)).length;
  ok(urls === eligible + 2 && seen.size === urls, `sitemaps hold ${urls} URLs, expected ${eligible} manifest pages plus 2 site pages`);
  const r1 = await call('/sitemap.xml');
  ok(r1.status === 200 && /^application\/xml/.test(r1.headers.get('content-type')) && (await r1.text()) === indexXml, 'Function does not serve the sitemap index from the bucket');
  const r2 = await call(`/${named[0].slice(WWW.length + 1)}`, { method: 'HEAD' });
  ok(r2.status === 200 && (await r2.text()) === '', 'sitemap HEAD not answered without a body');
  ok((await call('/sitemap-nope-en.xml')).headers.get('x-from') === 'next', 'a missing sitemap did not fall through to the static deploy');
  ok((await call('/sitemap.xml', { env: { ASSETS: assets } })).headers.get('x-from') === 'next', 'sitemap without a binding did not fall through');
  console.log(`sitemaps: ${named.length} files, ${urls} URLs`);
}

console.log('kind       pages  median bytes  median words  median links');
for (const [k, s] of Object.entries(stats).sort()) {
  console.log(`${k.padEnd(10)} ${String(s.n).padStart(5)}  ${String(median(s.bytes)).padStart(12)}  ${String(median(s.words)).padStart(12)}  ${String(median(s.links)).padStart(12)}`);
}
const total = manifest.pages.length;
const bytes = Object.values(stats).reduce((a, s) => a + s.bytes.reduce((x, y) => x + y, 0), 0);
console.log(`${total} pages, ${(bytes / 1048576).toFixed(1)} MiB; titles over 60 characters: ${overTitle} (long names that cannot be cut, docs/SEO.md)`);
if (failures.length) {
  console.error(`verify_prerender: ${failures.length} failures of ${checks} checks`);
  for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`verify_prerender: ${checks} checks passed`);
