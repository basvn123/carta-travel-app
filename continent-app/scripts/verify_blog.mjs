// T1178 (ROADMAP K14): DOM verify of the data blog at phone and desktop width.
//
//   node scripts/verify_blog.mjs [--shots DIR]
//
// Builds the blog with drafts into a temp dir, serves it, opens the index and
// the sample post at 390 and 1280 px and checks the page, not a picture:
// one h1, canonical, BlogPosting JSON-LD that parses, the table's ten rows
// matching the data file, the chart's ten bars, no horizontal page scroll, no
// console error, noindex on the draft, no dash in the text. CHROMIUM_PATH
// points at a browser when Playwright's own is not installed.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './blog/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const content = path.resolve(here, '..', '..', 'content', 'blog');
const shots = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : null;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'blogverify-'));
build({ content, out, drafts: true });

const TYPES = { '.html': 'text/html', '.json': 'application/json', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  else if (!path.extname(p)) p += '/index.html';
  if (p === '/favicon.svg' || p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const f = path.join(out, p);
  if (!f.startsWith(out) || !fs.existsSync(f)) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const post = fs.readdirSync(content).find((f) => f.endsWith('.md') && !/^(_|README)/.test(f));
const slug = post.replace(/\.md$/, '');
const data = JSON.parse(fs.readFileSync(path.join(content, 'data', `${slug}.json`), 'utf8'));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `: ${extra}` : ''}`); };

for (const [label, width, height] of [['phone', 390, 844], ['desktop', 1280, 900]]) {
  const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${base}/blog/${slug}`);
  const r = await page.evaluate(() => {
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
    const rows = [...document.querySelectorAll('.bl-table tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim()));
    return {
      h1: document.querySelectorAll('h1').length,
      canonical: document.querySelector('link[rel=canonical]')?.href,
      robots: document.querySelector('meta[name=robots]')?.content,
      graph: ld[0]['@graph'].map((n) => n['@type']),
      rows,
      bars: document.querySelectorAll('.bl-chart li').length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      text: document.body.innerText,
    };
  });
  check(`${label} post: one h1`, r.h1 === 1);
  check(`${label} post: canonical`, r.canonical === `https://www.carta-europetravel.com/blog/${slug}`, r.canonical);
  check(`${label} post: draft is noindex`, /noindex/.test(r.robots || ''));
  check(`${label} post: BlogPosting and breadcrumb JSON-LD`, r.graph.includes('BlogPosting') && r.graph.includes('BreadcrumbList'));
  check(`${label} post: table rows equal the data file`, r.rows.length === data.rows.length
    && r.rows.every((row, i) => row[0] === data.rows[i].place && row.includes(String(data.rows[i].day_eur))), `${r.rows.length} rows`);
  check(`${label} post: chart bars equal the data file`, r.bars === data.chart.bars.length, String(r.bars));
  check(`${label} post: no horizontal page scroll`, r.overflow <= 0, `${r.overflow}px`);
  check(`${label} post: no dash in the text`, !/[–—]/.test(r.text));
  if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `post-${label}.png`), fullPage: true }); }

  await page.goto(`${base}/blog/`);
  const idx = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, links: [...document.querySelectorAll('.bl-list a')].map((a) => a.getAttribute('href')), overflow: document.documentElement.scrollWidth - window.innerWidth }));
  check(`${label} index: lists the post and does not scroll sideways`, idx.h1 === 1 && idx.links.includes(`/blog/${slug}`) && idx.overflow <= 0);
  check(`${label}: no console errors`, errors.length === 0, errors.join(' | '));
  if (shots) await page.screenshot({ path: path.join(shots, `index-${label}.png`), fullPage: true });
  await page.context().close();
}
const rss = await (await fetch(`${base}/blog/rss.xml`)).text();
check('rss.xml is RSS 2.0 and holds no draft', /<rss version="2.0"/.test(rss) && !/<item>/.test(rss));
await browser.close();
server.close();
fs.rmSync(out, { recursive: true, force: true });
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
