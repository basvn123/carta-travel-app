// T1178 (K14): the data blog's Markdown renderer, feed, sitemap, structured
// data and build. Published posts reach the feed and the sitemap; drafts never.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderMarkdown, chartHtml } from '../src/blog/markdown.js';
import { rssFeed, blogSitemap, postGraph, byNewest } from '../src/blog/feed.js';
import { build, parsePost } from '../scripts/blog/build.mjs';
import { en } from '../src/i18n/en.js';
import { nl } from '../src/i18n/nl.js';
import { de } from '../src/i18n/de.js';
import { fr } from '../src/i18n/fr.js';
import { es } from '../src/i18n/es.js';
import { it as itLang } from '../src/i18n/it.js';

test('markdown escapes raw HTML and refuses unsafe links', () => {
  const h = renderMarkdown('## Hi <script>alert(1)</script>\n\nA [bad](javascript:alert(1)) and a [good](https://example.com) and [path](/blog/x).');
  assert.doesNotMatch(h, /<script/);
  assert.doesNotMatch(h, /javascript:/);
  assert.match(h, /href="https:\/\/example.com"/);
  assert.match(h, /href="\/blog\/x"/);
});

test('markdown renders a table with numeric cells marked and a chart from data', () => {
  const h = renderMarkdown('| Place | Day EUR |\n|---|---|\n| Merida | 65 |\n\n{{chart}}', {
    data: { chart: { title: 'Day', unit: 'EUR', bars: [{ label: 'Merida', value: 65 }, { label: 'Gozo', value: 90 }] } },
  });
  assert.match(h, /<th scope="row">Merida<\/th><td class="n">65<\/td>/);
  assert.match(h, /class="bl-chart"/);
  assert.match(h, /width:100%/);
  assert.equal(chartHtml(null), '');
});

const posts = [
  { slug: 'a', title: 'A & B', description: 'First <post>', date: '2026-11-01' },
  { slug: 'b', title: 'Second', description: 'Second post', date: '2026-12-01' },
];

test('the feed lists newest first and escapes; the sitemap lists the index and each post', () => {
  assert.deepEqual(byNewest(posts).map((p) => p.slug), ['b', 'a']);
  const rss = rssFeed(posts, { title: 'Carta blog', description: 'd' });
  assert.match(rss, /<rss version="2.0"/);
  assert.ok(rss.indexOf('/blog/b') < rss.indexOf('/blog/a'));
  assert.match(rss, /A &amp; B/);
  assert.match(rss, /First &lt;post&gt;/);
  const sm = blogSitemap(posts);
  assert.match(sm, /<loc>https:\/\/www.carta-europetravel.com\/blog\/<\/loc><lastmod>2026-12-01/);
  assert.equal((sm.match(/<url>/g) || []).length, 3);
});

test('BlogPosting structured data has author, dates and breadcrumb', () => {
  const g = postGraph({ ...posts[0], author: 'Carta' })['@graph'];
  const bp = g.find((n) => n['@type'] === 'BlogPosting');
  assert.equal(bp.datePublished, '2026-11-01');
  assert.equal(bp.author.name, 'Carta');
  assert.equal(bp.url, 'https://www.carta-europetravel.com/blog/a');
  assert.equal(g.find((n) => n['@type'] === 'BreadcrumbList').itemListElement.length, 3);
});

function fixture(status) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-'));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data', 'x.json'), JSON.stringify({ chart: { title: 'T', unit: 'EUR', bars: [{ label: 'A', value: 5 }] }, images: [] }));
  fs.writeFileSync(path.join(dir, 'x.md'), `---\ntitle: Where to go\nslug: x\ntype: where-to-go\nquestion: q\ndescription: A test post.\nstatus: ${status}\ndate: 2026-11-07\ndata: data/x.json\nsnapshot: 2026-06-07T00:00:00+00:00\nauthor: Carta\n---\n\n# Where\n\nBody **text**.\n\n{{chart}}\n`);
  return dir;
}

test('build: a published post gets a page, a feed item and a sitemap; a draft gets none of the last two', () => {
  const pub = fixture('published');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'blogout-'));
  const r = build({ content: pub, out });
  assert.equal(r.published, 1);
  const page = fs.readFileSync(path.join(out, 'blog/x/index.html'), 'utf8');
  assert.match(page, /rel="canonical" href="https:\/\/www.carta-europetravel.com\/blog\/x"/);
  assert.match(page, /"@type":"BlogPosting"/);
  assert.doesNotMatch(page, /noindex/);
  assert.match(fs.readFileSync(path.join(out, 'blog/rss.xml'), 'utf8'), /<item>/);
  assert.match(fs.readFileSync(path.join(out, 'sitemap-blog-en.xml'), 'utf8'), /\/blog\/x</);

  const draft = fixture('draft');
  const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'blogout-'));
  assert.equal(build({ content: draft, out: out2 }).shown, 0);
  assert.equal(fs.existsSync(path.join(out2, 'blog/x/index.html')), false);
  const r3 = build({ content: draft, out: out2, drafts: true });
  assert.equal(r3.drafts, 1);
  assert.match(fs.readFileSync(path.join(out2, 'blog/x/index.html'), 'utf8'), /noindex/);
  assert.doesNotMatch(fs.readFileSync(path.join(out2, 'blog/rss.xml'), 'utf8'), /<item>/);
  assert.equal(fs.existsSync(path.join(out2, 'sitemap-blog-en.xml')), false);
});

test('parsePost refuses a post without front matter', () => {
  assert.throws(() => parsePost('# no header'));
});

test('blog.* keys exist in all six languages and the English has no dashes', () => {
  const keys = Object.keys(en).filter((k) => k.startsWith('blog.'));
  assert.ok(keys.length >= 10);
  for (const [name, l] of Object.entries({ nl, de, fr, es, it: itLang })) {
    for (const k of keys) assert.ok(l[k], `${name} lacks ${k}`);
  }
  for (const k of keys) assert.doesNotMatch(en[k], /[–—]/);
});
