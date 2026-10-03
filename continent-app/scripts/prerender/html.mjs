/**
 * html.mjs, turns one page model (pages.mjs) into the stored document.
 *
 * The document is complete and opens on its own in a browser, which is how a
 * page is checked by eye, but only the two marked parts are ever served: the
 * Pages Function lays HEAD and BODY into the current app shell
 * (src/lib/prerenderShell.js spliceShell).
 *
 * The reading column is styled with the tokens from the :root of
 * src/styles.css, which the shell already loads, so no colour, font or space
 * is typed here. It is a plain document on purpose: what a crawler reads and
 * what a person sees for the moment before the app takes over, and the whole
 * page for anyone without JavaScript. Lists get hairlines, measured numbers
 * are set in --mono, prose in --ui, the name in --display (DESIGN.md).
 */
import { stripDashes } from '../../src/lib/format.js';
import {
  HEAD_OPEN, HEAD_CLOSE, BODY_OPEN, BODY_CLOSE,
} from '../../src/lib/prerenderShell.js';

export const ORIGIN = 'https://www.carta-europetravel.com';
export const SITE_CARD = {
  src: `${ORIGIN}/og/site.png`,
  w: 1200,
  h: 630,
  alt: 'A Carta receipt: the bed, the food and the total for one person for one day in a European town.',
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** House style first (no dashes, no markdown bold), then HTML escaping. */
export const clean = (s) => stripDashes(String(s ?? ''))
  .replace(/\*\*/g, '')
  // Commons credits arrive as "Name (talk, middot, contribs)"; those links are
  // not ours to print.
  .replace(/\s*\(talk\s*\u00b7\s*contribs\)/gi, '')
  // A spaced middot is a separator, which house style bans. A middot between
  // two letters is the Catalan geminated l (Mil-middot-lenari) and stays.
  .replace(/\s+\u00b7\s+/g, ', ')
  .replace(/\s+/g, ' ')
  .trim();
export const esc = (s) => clean(s).replace(/[&<>"']/g, (c) => ESC[c]);
const attr = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);

/** Cut on a word boundary, never mid-word, with an ellipsis for the cut. */
export function cap(text, max) {
  const s = clean(text);
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > 40 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/** Sentences of a text, kept whole; a description is built from whole ones. */
const sentences = (text) => clean(text).split(/(?<!\b(?:St|Ste|Mt|Dr|Nr|ca)\.)(?<=[a-z0-9)][.!?])\s+(?=[A-Z0-9€"(])/u).map((x) => x.trim()).filter(Boolean);

/**
 * The search-result title: "{name}, {headline}, {qualifier} | Carta". Over 60
 * characters the qualifier goes first and the " | Carta" second (docs/SEO.md).
 */
export function fitTitle(name, headline, qualifier) {
  const parts = [name, headline, qualifier].map((p) => clean(p)).filter(Boolean);
  const tries = [
    `${parts.join(', ')} | Carta`,
    `${parts.slice(0, 2).join(', ')} | Carta`,
    parts.slice(0, 2).join(', '),
    parts[0],
  ];
  return tries.find((s) => s.length <= 60) || cap(parts[0], 60).replace(/\.$/, '');
}

/** One description: whole sentences until 155 characters (docs/SEO.md). Only
 *  a first sentence longer than that is cut, on a word, with an ellipsis. */
export function fitDescription(texts) {
  let out = '';
  for (const s of texts.flatMap(sentences)) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > 155) {
      if (!out) out = cap(s, 154);
      if (out.length > 110) break;
      continue;
    }
    out = next;
  }
  return out;
}

const STYLE = `.pr{box-sizing:border-box;max-width:760px;margin:0 auto;padding:var(--space-6) var(--space-4) var(--space-8);font-family:var(--ui);font-size:16px;line-height:1.5;color:var(--ink);background:var(--paper)}
.pr *{box-sizing:border-box}
.pr a{color:var(--ink);text-decoration:underline;text-decoration-color:var(--rule);text-underline-offset:3px}
.pr a:hover{text-decoration-color:var(--accent)}
.pr a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pr-crumbs ol{display:flex;flex-wrap:wrap;gap:var(--space-2);list-style:none;margin:0 0 var(--space-4);padding:0;font-size:13px;color:var(--ink-soft)}
.pr-crumbs li+li::before{content:"/";margin-right:var(--space-2);color:var(--rule)}
.pr h1{font-family:var(--display);font-weight:600;font-size:clamp(30px,6vw,44px);line-height:1.1;letter-spacing:-0.02em;margin:0 0 var(--space-3);overflow-wrap:anywhere}
.pr h2{font-family:var(--ui);font-size:20px;font-weight:600;letter-spacing:-0.01em;margin:var(--space-7) 0 var(--space-3)}
.pr p{margin:0 0 var(--space-3)}
.pr-lead{font-size:18px;color:var(--ink-soft)}
.pr-hero{margin:var(--space-5) 0}
.pr-hero img{display:block;width:100%;height:auto;max-height:420px;object-fit:cover;border-radius:10px;background:var(--paper-dim)}
.pr-hero figcaption,.pr-note{font-size:13px;color:var(--ink-mute);margin-top:var(--space-2)}
.pr-facts{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);margin:var(--space-5) 0;border-top:1px solid var(--rule-soft)}
.pr-facts dt,.pr-facts dd{margin:0;padding:var(--space-2) 0;border-bottom:1px solid var(--rule-soft)}
.pr-facts dt{color:var(--ink-soft);padding-right:var(--space-4)}
.pr .n{font-family:var(--mono);font-variant-numeric:tabular-nums}
.pr-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule-soft)}
.pr-list li{display:flex;flex-wrap:wrap;justify-content:space-between;gap:var(--space-1) var(--space-4);padding:var(--space-2) 0;border-bottom:1px solid var(--rule-soft)}
.pr-list .m{color:var(--ink-soft);font-size:14px}
.pr-pages{display:flex;flex-wrap:wrap;gap:var(--space-4);margin-top:var(--space-4)}
.pr-credits{margin-top:var(--space-7);font-size:13px;color:var(--ink-soft)}`;

/** A fact value: numbers in mono, words in the body face. */
const factValue = (f) => (f.num ? `<span class="n">${esc(f.value)}</span>` : esc(f.value));

function links(items) {
  if (!items?.length) return '';
  const li = items.map((l) => {
    const name = l.path ? `<a href="${attr(l.path)}">${esc(l.name)}</a>` : `<span>${esc(l.name)}</span>`;
    const meta = l.meta ? ` <span class="m${l.metaNum ? ' n' : ''}">${esc(l.meta)}</span>` : '';
    return `<li>${name}${meta}</li>`;
  });
  return `<ul class="pr-list">${li.join('')}</ul>`;
}

function section(s) {
  const parts = [`<section><h2>${esc(s.h2)}</h2>`];
  for (const p of s.paras || []) parts.push(`<p>${esc(p)}</p>`);
  if (s.facts?.length) parts.push(facts(s.facts));
  parts.push(links(s.links));
  if (s.note) parts.push(`<p class="pr-note">${esc(s.note)}</p>`);
  parts.push('</section>');
  return parts.join('');
}

function facts(list) {
  const rows = list.filter((f) => f && f.value != null && f.value !== '');
  if (!rows.length) return '';
  return `<dl class="pr-facts">${rows.map((f) => `<dt>${esc(f.label)}</dt><dd>${factValue(f)}</dd>`).join('')}</dl>`;
}

/** Escapes a JSON-LD graph so no string inside it can close the script tag. */
const ldJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/** The JSON-LD graph: WebPage, BreadcrumbList and the subject node. */
function graph(pg) {
  const url = `${ORIGIN}${pg.path}`;
  const nodes = [
    { '@type': 'WebSite', '@id': `${ORIGIN}/#site`, url: `${ORIGIN}/`, name: 'Carta' },
    {
      '@type': 'WebPage',
      '@id': `${url}#page`,
      url,
      name: clean(pg.h1),
      inLanguage: 'en',
      isPartOf: { '@id': `${ORIGIN}/#site` },
      ...(pg.lastmod ? { dateModified: pg.lastmod } : {}),
      breadcrumb: { '@id': `${url}#crumbs` },
      ...(pg.subject ? { mainEntity: { '@id': `${url}#subject` } } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#crumbs`,
      itemListElement: [...pg.crumbs, { name: pg.h1, path: pg.path }].map((c, i) => ({
        '@type': 'ListItem', position: i + 1, name: clean(c.name), item: `${ORIGIN}${c.path}`,
      })),
    },
  ];
  if (pg.subject) nodes.push({ '@id': `${url}#subject`, url, ...pg.subject });
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/** The stored document for one page model. */
export function renderPage(pg) {
  const url = `${ORIGIN}${pg.canonical || pg.path}`;
  const card = pg.card || SITE_CARD;
  const head = [
    `<title>${esc(pg.title)}</title>`,
    `<meta name="description" content="${esc(pg.description)}">`,
    `<link rel="canonical" href="${attr(url)}">`,
    pg.noindex ? '<meta name="robots" content="noindex">' : '',
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${attr(url)}">`,
    `<meta property="og:title" content="${esc(pg.title)}">`,
    `<meta property="og:description" content="${esc(pg.description)}">`,
    `<meta property="og:image" content="${attr(card.src)}">`,
    '<meta property="og:image:type" content="image/png">',
    `<meta property="og:image:width" content="${card.w}">`,
    `<meta property="og:image:height" content="${card.h}">`,
    `<meta property="og:image:alt" content="${esc(card.alt)}">`,
    '<meta property="og:locale" content="en">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(pg.title)}">`,
    `<meta name="twitter:description" content="${esc(pg.description)}">`,
    `<meta name="twitter:image" content="${attr(card.src)}">`,
    `<meta name="twitter:image:alt" content="${esc(card.alt)}">`,
    pg.boot ? `<meta name="carta:boot" content="${attr(pg.boot)}">` : '',
    `<script type="application/ld+json">${ldJson(graph(pg))}</script>`,
    `<style>${STYLE}</style>`,
  ].filter(Boolean).join('\n');

  const crumbs = `<nav class="pr-crumbs" aria-label="Breadcrumb"><ol>${pg.crumbs
    .map((c) => `<li><a href="${attr(c.path)}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
  const hero = pg.image
    ? `<figure class="pr-hero"><img src="${attr(pg.image.src)}" alt="${esc(pg.image.alt)}"${pg.image.w ? ` width="${pg.image.w}" height="${pg.image.h}"` : ''} loading="lazy" decoding="async">${pg.image.credit ? `<figcaption>${esc(pg.image.credit)}</figcaption>` : ''}</figure>`
    : '';
  const body = [
    '<main class="pr">',
    crumbs,
    `<h1>${esc(pg.h1)}</h1>`,
    ...(pg.lead || []).map((p, i) => `<p${i === 0 ? ' class="pr-lead"' : ''}>${esc(p)}</p>`),
    facts(pg.facts),
    hero,
    ...(pg.sections || []).filter((s) => s && (s.links?.length || s.paras?.length || s.facts?.length)).map(section),
    pg.pager ? `<nav class="pr-pages" aria-label="Pages">${pg.pager.map((l) => `<a href="${attr(l.path)}">${esc(l.name)}</a>`).join('')}</nav>` : '',
    pg.coverage ? `<p class="pr-note">${esc(pg.coverage)}</p>` : '',
    pg.credits?.length ? `<p class="pr-credits">${esc(`Sources: ${pg.credits.join('; ')}.`)}</p>` : '',
    '</main>',
  ].filter(Boolean).join('\n');

  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${HEAD_OPEN}\n${head}\n${HEAD_CLOSE}\n</head>\n<body>\n${BODY_OPEN}\n${body}\n${BODY_CLOSE}\n</body>\n</html>\n`;
}
