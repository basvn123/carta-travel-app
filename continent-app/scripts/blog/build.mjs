#!/usr/bin/env node
/**
 * Builds the data blog (ROADMAP K14, T1178): Markdown posts in content/blog/
 * to static pages, an RSS feed and a sitemap file.
 *
 *   node scripts/blog/build.mjs                  published posts only, to dist-blog/
 *   node scripts/blog/build.mjs --drafts         also drafts, marked noindex (preview, never deployed)
 *   node scripts/blog/build.mjs --out DIR --content DIR
 *
 * Output (relative to the out dir, which build-pages.mjs copies into dist/):
 *   blog/index.html            the index
 *   blog/<slug>/index.html     one post: canonical, BlogPosting + breadcrumb JSON-LD, Open Graph
 *   blog/rss.xml               RSS 2.0, published posts, newest first
 *   sitemap-blog-en.xml        the blog group of the sitemap index (index, then posts)
 *   _blog.json                 counts, for the deploy log
 *
 * Pages are plain static files (no Function, no app shell): a complete HTML
 * document that carries the design tokens from src/styles/01-tokens.css inline,
 * so it looks like Carta and needs nothing else. Drafts never reach the feed or
 * the sitemap, and their pages say noindex. Publishing is the owner's: a post
 * goes live when its `status:` is changed from draft to published in a pull
 * request, after scripts/blog/check_draft.py passes.
 *
 * The page text (labels) is the app's English i18n catalogue, keys blog.*.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, escapeHtml as esc, chartHtml } from '../../src/blog/markdown.js';
import { rssFeed, blogSitemap, postGraph, indexGraph, byNewest, postPath, ORIGIN } from '../../src/blog/feed.js';
import { SITE_CARD, clean, fitDescription } from '../prerender/html.mjs';
import { stripDashes } from '../../src/lib/format.js';
import { en } from '../../src/i18n/en.js';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = path.resolve(APP, '..');

const t = (key, vars) => {
  const msg = en[key] ?? key;
  return vars ? msg.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : msg;
};

/** { fm, body } of a post file; flat `key: value` front matter. */
export function parsePost(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines[0] !== '---') throw new Error('no front matter');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('front matter not closed');
  const fm = {};
  for (const ln of lines.slice(1, end)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(ln);
    if (m) fm[m[1]] = m[2].trim();
  }
  return { fm, body: lines.slice(end + 1).join('\n') };
}

/** Every post in a content dir, with its data file. README and _files skipped. */
export function loadPosts(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !/^(_|README)/.test(f)).sort().map((f) => {
    const { fm, body } = parsePost(fs.readFileSync(path.join(dir, f), 'utf8'));
    const data = fm.data ? JSON.parse(fs.readFileSync(path.join(dir, fm.data), 'utf8')) : null;
    return { file: f, ...fm, body, data };
  });
}

const tokens = () => fs.readFileSync(path.join(APP, 'src/styles/01-tokens.css'), 'utf8');

// House style (G1 2026-11): the blog wears the app's look: the stone
// ground, Overpass for every word and figure, the wordmark slot (the blaze
// and the name in the plate face), data tables and bar charts on paper with
// hairlines, the bars in umber, one umber action at the end of a post. The
// sheet is a file (/blog/blog.css), not an inline <style>: the site's CSP
// allows only hashed inline styles, so an inline block would be refused.
const STYLE = `${''}
body{margin:0;background:var(--surface-page);color:var(--text);font-family:var(--ui);font-variant-numeric:tabular-nums lining-nums}
.bl{box-sizing:border-box;max-width:calc(var(--w-read) + 2 * var(--page-gutter));margin:0 auto;padding:var(--space-4) var(--page-gutter) var(--space-9);font-size:var(--text-lead);line-height:var(--leading-body)}
.bl *{box-sizing:border-box}
.bl a{color:var(--action-hover);font-weight:600;text-decoration:underline;text-decoration-color:var(--border);text-decoration-thickness:2px;text-underline-offset:3px;transition:text-decoration-color var(--dur-2) var(--ease-out)}
.bl a:hover{text-decoration-color:var(--action)}
.bl a:focus-visible{outline:var(--stroke-focus) solid var(--focus);outline-offset:2px;border-radius:var(--radius-sm)}
.bl-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-2) var(--space-4);min-height:var(--tap);margin-bottom:var(--space-7);padding-bottom:var(--space-3);border-bottom:1px solid var(--border);font-size:var(--text-body)}
.bl-top a{display:inline-flex;align-items:center;min-height:var(--tap)}
.bl .bl-brand{gap:var(--space-2);color:var(--text);text-decoration:none;font-family:var(--plate-face);font-size:var(--text-plate);font-weight:700;line-height:1}
.bl-nav{display:flex;gap:var(--space-4)}
.bl-blaze{position:relative;display:inline-block;flex:none;width:24px;height:14px;border-radius:2px;background:var(--surface);outline:1px solid var(--blaze-edge)}
.bl-blaze::before{content:'';position:absolute;left:14%;right:14%;top:20%;height:36%;background:var(--action)}
.bl-blaze::after{content:'';position:absolute;right:14%;width:34%;bottom:14%;height:max(1.5px,11%);background:var(--text)}
.bl h1{font-weight:800;font-size:var(--text-headline);line-height:var(--leading-tight);letter-spacing:-0.018em;margin:0 0 var(--space-3);overflow-wrap:anywhere;text-wrap:balance}
.bl h2{font-size:var(--text-title);font-weight:800;line-height:var(--leading-tight);margin:var(--space-8) 0 var(--space-3);text-wrap:balance}
.bl p{margin:0 0 var(--space-4)}
.bl-meta{font-size:var(--text-body);color:var(--text-2);margin-bottom:var(--space-6)}
.bl-draft{border:1px solid var(--select-border);background:var(--select-bg);color:var(--select-ink);border-radius:var(--radius-control);padding:var(--space-3) var(--space-4);margin:0 0 var(--space-5);font-size:var(--text-body);font-weight:600}
.bl .n,.bl td.n{font-variant-numeric:tabular-nums lining-nums}
.bl-table{overflow-x:auto;margin:var(--space-5) 0;border:1px solid var(--border);border-radius:var(--radius-panel);background:var(--surface)}
.bl-table table{width:100%;border-collapse:collapse;font-size:var(--text-body)}
.bl-table th,.bl-table td{padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--border-soft);text-align:left;font-weight:400;white-space:nowrap}
.bl-table thead th{background:var(--surface-sunken);font-weight:700;font-size:var(--text-label);color:var(--text-2)}
.bl-table tbody th{font-weight:700}
.bl-table td.n{text-align:right;font-weight:700}
.bl-table tr:last-child th,.bl-table tr:last-child td{border-bottom:0}
.bl-chart{margin:var(--space-5) 0;padding:var(--space-4);border:1px solid var(--border);border-radius:var(--radius-panel);background:var(--surface)}
.bl-chart figcaption{font-weight:800;margin-bottom:var(--space-3)}
.bl-chart ol{list-style:none;margin:0;padding:0}
.bl-chart li{display:grid;grid-template-columns:minmax(80px,30%) 1fr auto;gap:var(--space-3);align-items:center;min-height:32px;font-size:var(--text-body)}
.bl-bar{display:block;width:100%;height:12px;background:var(--surface-sunken);border-radius:var(--radius-pill)}
.bl-bar rect{fill:var(--action)}
.bl-val{color:var(--text);font-weight:800;white-space:nowrap}
.bl-fig{margin:var(--space-5) 0}.bl-fig img{display:block;max-width:100%;height:auto;border-radius:var(--radius-card)}
.bl-fig figcaption{margin-top:var(--space-2);font-size:var(--text-label);color:var(--text-2)}
.bl-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}
.bl-list li{padding:var(--space-4) 0;border-bottom:1px solid var(--border)}
.bl-list a{font-weight:800;font-size:var(--text-title);color:var(--text);text-decoration:none}
.bl-list a:hover{text-decoration:underline;text-decoration-color:var(--action)}
.bl-list p{margin:var(--space-1) 0 0;color:var(--text-2);font-size:var(--text-body)}
.bl-foot{margin-top:var(--space-7);font-size:var(--text-label);color:var(--text-2)}
.bl article{margin-bottom:var(--space-6)}
.bl .bl-cta{display:inline-flex;align-items:center;justify-content:center;min-height:var(--tap-main);padding:0 var(--space-5);margin-top:var(--space-6);border-radius:var(--radius-control);background:var(--action);color:var(--on-plate);font-weight:700;text-decoration:none;transition:background-color var(--dur-2) var(--ease-out),scale var(--dur-1) var(--ease-out)}
.bl .bl-cta:hover{background:var(--action-hover)}
.bl .bl-cta:active{scale:.97}
@media (prefers-reduced-motion:reduce){.bl a,.bl .bl-cta{transition:none}.bl .bl-cta:active{scale:none}}
@media (max-width:479px){.bl-chart li{grid-template-columns:1fr auto;row-gap:var(--space-1);padding:var(--space-2) 0 var(--space-3);border-bottom:1px solid var(--border-soft)}.bl-chart li:last-child{border-bottom:0}.bl-chart .bl-bar{grid-column:1 / -1;order:3}.bl .bl-cta{display:flex}}`;

/** The font files the blog's sheet names (the house faces), copied beside it. */
const FONT_FILES = ['Overpass-latin.woff2', 'Overpass-latin-ext.woff2', 'SofiaSansExtraCondensed-latin.woff2', 'SofiaSansExtraCondensed-latin-ext.woff2'];
/** The screens' own @font-face blocks, pointed at the copies in /blog/fonts/. */
const fontFaces = () => (fs.readFileSync(path.join(APP, 'src/styles/00-fonts.css'), 'utf8').match(/@font-face\s*{[^}]*}/g) || [])
  .map((b) => b.replace(/url\([^)]*?([\w-]+\.woff2)\)/g, 'url(/blog/fonts/$1)')).join('\n');
export const blogCss = () => `${fontFaces()}\n${tokens()}\n${STYLE}\n`;

const doc = ({ title, description, canonical, noindex, graph, body, card = SITE_CARD, type = 'website', extraHead = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<link rel="alternate" type="application/rss+xml" title="Carta blog" href="${ORIGIN}/blog/rss.xml">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(card.src)}">
<meta property="og:image:width" content="${card.w}">
<meta property="og:image:height" content="${card.h}">
<meta property="og:image:alt" content="${esc(card.alt)}">
<meta name="twitter:card" content="summary_large_image">
${extraHead}<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>
<link rel="stylesheet" href="/blog/blog.css">
</head>
<body>
${body}
</body>
</html>
`;

const dateText = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const top = () => `<div class="bl-top"><a class="bl-brand" href="/"><span class="bl-blaze" aria-hidden="true"></span>Carta</a><span class="bl-nav"><a href="/blog/">${esc(t('blog.title'))}</a><a href="/blog/rss.xml">${esc(t('blog.rss'))}</a></span></div>`;

export function postPage(p, { draft }) {
  const html = renderMarkdown(p.body, { data: p.data, resolveSrc: (s) => (/^https:\/\//.test(s) ? s : `/blog/${p.slug}/${s.replace(/^\.?\//, '')}`) });
  const first = (p.data?.images || [])[0];
  const rec = { ...p, image: first ? { src: first.src.startsWith('https://') ? first.src : `${ORIGIN}/blog/${p.slug}/${first.src}` } : null };
  const body = `<main class="bl">
${top()}
<article>
${draft ? `<p class="bl-draft">${esc(t('blog.draft'))}</p>\n` : ''}<h1>${esc(clean(p.title))}</h1>
<p class="bl-meta">${esc(t('blog.by', { author: p.author }))}, ${esc(t('blog.published', { date: dateText(p.date) }))}</p>
${html}
<p class="bl-foot">${esc(t('blog.source', { date: (p.snapshot || '').slice(0, 10) }))} <a href="/blog/${esc(p.slug)}/data.json">${esc(t('blog.data'))}</a></p>
<a class="bl-cta" href="/">${esc(t('blog.cta'))}</a>
</article>
<p class="bl-foot"><a href="/blog/">${esc(t('blog.all'))}</a></p>
</main>`;
  return doc({
    title: `${clean(p.title)} | Carta`.length <= 70 ? `${clean(p.title)} | Carta` : clean(p.title),
    description: fitDescription([p.description]),
    canonical: `${ORIGIN}${postPath(p.slug)}`,
    noindex: draft,
    type: 'article',
    graph: postGraph(rec),
    body,
    card: first ? { src: rec.image.src, w: first.w || 1200, h: first.h || 630, alt: first.alt } : SITE_CARD,
  });
}

export function indexPage(posts) {
  const list = byNewest(posts);
  const items = list.map((p) => `<li><a href="${postPath(p.slug)}">${esc(clean(p.title))}</a><p>${esc(clean(p.description))}</p><p class="n">${esc(dateText(p.date))}</p></li>`).join('');
  const body = `<main class="bl">
${top()}
<h1>${esc(t('blog.title'))}</h1>
<p class="bl-meta">${esc(t('blog.lead'))}</p>
${list.length ? `<ul class="bl-list">${items}</ul>` : `<p>${esc(t('blog.empty'))}</p>`}
</main>`;
  return doc({
    title: `${t('blog.title')} | Carta`,
    description: t('blog.lead'),
    canonical: `${ORIGIN}/blog/`,
    noindex: !list.some((p) => p.status === 'published'),
    graph: indexGraph(list),
    body,
  });
}

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8'); };

export function build({ content, out, drafts = false }) {
  const all = loadPosts(content);
  const shown = all.filter((p) => p.status === 'published' || (drafts && p.status === 'draft'));
  const published = shown.filter((p) => p.status === 'published');
  fs.rmSync(out, { recursive: true, force: true });
  for (const p of shown) {
    const dir = path.join(out, 'blog', p.slug);
    write(path.join(dir, 'index.html'), postPage(p, { draft: p.status !== 'published' }));
    if (p.data) write(path.join(dir, 'data.json'), `${JSON.stringify(p.data, null, 2)}\n`);
    for (const img of p.data?.images || []) {
      const src = path.join(content, img.src);
      if (!/^https:/.test(img.src) && fs.existsSync(src)) fs.copyFileSync(src, (fs.mkdirSync(path.dirname(path.join(dir, img.src)), { recursive: true }), path.join(dir, img.src)));
    }
  }
  write(path.join(out, 'blog', 'index.html'), indexPage(shown));
  write(path.join(out, 'blog', 'blog.css'), blogCss());
  for (const f of FONT_FILES) {
    fs.mkdirSync(path.join(out, 'blog', 'fonts'), { recursive: true });
    fs.copyFileSync(path.join(APP, 'src', 'assets', 'fonts', f), path.join(out, 'blog', 'fonts', f));
  }
  const feedPosts = published.map((p) => ({ slug: p.slug, title: stripDashes(p.title), description: stripDashes(p.description), date: p.date }));
  write(path.join(out, 'blog', 'rss.xml'), rssFeed(feedPosts, { title: 'Carta blog', description: t('blog.lead') }));
  if (published.length) write(path.join(out, 'sitemap-blog-en.xml'), blogSitemap(feedPosts));
  const report = { posts: all.length, shown: shown.length, published: published.length, drafts: shown.length - published.length, sitemap: published.length > 0 };
  write(path.join(out, '_blog.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const arg = (k, d) => (a.includes(k) ? path.resolve(a[a.indexOf(k) + 1]) : d);
  const r = build({ content: arg('--content', path.join(ROOT, 'content', 'blog')), out: arg('--out', path.join(APP, 'dist-blog')), drafts: a.includes('--drafts') });
  console.log(`[blog] ${r.published} published, ${r.drafts} drafts shown, of ${r.posts} posts${r.sitemap ? ', sitemap-blog-en.xml written' : ', no sitemap (nothing published)'}`);
}
