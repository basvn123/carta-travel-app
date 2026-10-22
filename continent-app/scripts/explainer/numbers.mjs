/**
 * "Where the numbers come from" (T318, register rows T226-b and T207-c).
 *
 * One static page, assembled at build time from files, never typed:
 *   - the positioning sentence of PRODUCT.md (owner, T471-b, 21 October 2026;
 *     the app repo cannot read the root PRODUCT.md, so it is typed here and
 *     must match it), with its two counts read
 *     from public/boot.json meta.n_destinations and src/lib/urlScheme.js
 *     COUNTRY_SLUGS, so the sentence cannot go stale;
 *   - the provenance sentences of the cost receipt, from src/i18n/en.js
 *     (cost.bed* and cost.food*, T098);
 *   - the food accuracy figure, from src/lib/accuracy.js (T097);
 *   - the per-layer counts and status split, from public/coverage.json;
 *   - the credits, from src/data/attribution.js, the same list the Account
 *     panel prints under Data sources.
 *
 * It needs no sign-in and no script. It is English only on purpose (credit
 * lines are licence notices and the page has no hreflang siblings yet).
 * Served at /about/numbers: Cloudflare Pages and Vercel both serve
 * about/numbers.html at that clean path.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const NUMBERS_PATH = '/about/numbers';

const LAYERS = [
  ['trail', 'Walking routes'],
  ['cycling', 'Cycling rows'],
  ['beach', 'Beaches'],
  ['lake', 'Lakes'],
  ['mountain', 'Summits'],
];
const BED_KEYS = ['cost.bedCity', 'cost.bedCountry', 'cost.bedScaled', 'cost.bedRepaired'];
const FOOD_KEYS = ['cost.foodCity', 'cost.foodRegion', 'cost.foodCountry', 'cost.foodScaled'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => Number(n).toLocaleString('en-GB');
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const dateOf = (iso) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));

/** Reads every input. Throws when one is missing or empty, so a build never
 *  ships a page with a hole in it. */
export async function readFacts(appRoot) {
  const imp = (p) => import(pathToFileURL(resolve(appRoot, p)).href);
  const boot = JSON.parse(readFileSync(resolve(appRoot, 'public/boot.json'), 'utf8'));
  const coverage = JSON.parse(readFileSync(resolve(appRoot, 'public/coverage.json'), 'utf8'));
  const { en } = await imp('src/i18n/en.js');
  const { ATTRIBUTIONS } = await imp('src/data/attribution.js');
  const { FOOD_ACCURACY, accuracyVars } = await imp('src/lib/accuracy.js');
  const { COUNTRY_SLUGS } = await imp('src/lib/urlScheme.js');

  const layers = LAYERS.map(([key, label]) => {
    const st = { ok: 0, thin: 0, empty: 0, na: 0 };
    let published = 0;
    let listed = 0;
    for (const reg of Object.values(coverage.regions)) {
      const row = reg[key];
      if (!row) continue;
      st[row.status] += 1;
      published += row.r || 0;
      listed += row.l || 0;
    }
    return { key, label, published, listed, ...st };
  });
  const facts = {
    destinations: boot.meta.n_destinations,
    countries: Object.keys(COUNTRY_SLUGS).length,
    regions: Object.keys(coverage.regions).length,
    coverageDate: coverage.generated_at,
    layers,
    credits: ATTRIBUTIONS,
    en,
    accuracy: { ...FOOD_ACCURACY, vars: accuracyVars('en') },
  };
  if (!facts.destinations || !facts.regions || !layers.some((l) => l.published) || !facts.credits.length) {
    throw new Error('explainer: an input is empty (boot.json, coverage.json or attribution.js)');
  }
  for (const k of [...BED_KEYS, ...FOOD_KEYS, 'cost.accuracy', 'cost.accuracyMethod']) {
    if (!en[k]) throw new Error(`explainer: en.js has no ${k}`);
  }
  return facts;
}

/* The Lagoon roles (T503, register T421-b), copied from
   src/styles/01-tokens.css: this page is static HTML outside the app and
   cannot read the built stylesheet, so it carries the values it uses, as
   src/map/tokenColors.js does for the map. Figtree comes from the site's own
   /fonts/: the CSP (public/_headers) allows no font host, which is why the
   old Google Fonts link never loaded. */
const CSS = `
@font-face{font-family:'Figtree';font-style:normal;font-weight:300 900;font-display:swap;src:url(/fonts/Figtree-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Figtree';font-style:normal;font-weight:300 900;font-display:swap;src:url(/fonts/Figtree-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
:root{--surface-page:#f6f5f2;--surface:#ffffff;--text:#1f2a33;--text-2:#44515c;--border:#dcdfdd;--border-soft:#e9eae7;--action:#8c5a2b;--action-hover:#744820;--action-text:#ffffff;--focus:#8c5a2b;
--ui:'Figtree',system-ui,-apple-system,'Segoe UI',sans-serif;--text-caption:12px;--text-label:13px;--text-body:14px;--text-lead:16px;--text-title:20px;--text-display:40px;
--space-2:8px;--space-3:12px;--space-4:16px;--space-5:24px;--space-6:32px;--space-7:40px;--space-8:56px;--tap:44px;--radius-sm:6px;--radius-control:10px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--surface-page);color:var(--text);font-family:var(--ui);font-size:var(--text-lead);line-height:1.5;font-variant-numeric:tabular-nums}
::selection{background:#f6e7d3;color:var(--text)}
main{max-width:720px;margin:0 auto;padding:var(--space-4) var(--space-4) var(--space-8)}
.top{display:flex;justify-content:space-between;align-items:center;gap:var(--space-4);padding-bottom:var(--space-2);border-bottom:1px solid var(--border)}
.top a{color:var(--text);text-decoration:none;font-weight:600;min-height:var(--tap);display:inline-flex;align-items:center}
h1{font-weight:700;font-size:clamp(28px,6vw,var(--text-display));line-height:1.2;letter-spacing:-0.02em;margin:var(--space-6) 0 var(--space-4);text-wrap:balance}
h2{font-weight:600;font-size:var(--text-title);line-height:1.25;margin:var(--space-7) 0 var(--space-3)}
p{margin:0 0 var(--space-3);max-width:68ch}
.lede{font-size:18px;color:var(--text-2)}
.n{font-variant-numeric:tabular-nums}
.meta{font-size:var(--text-label);color:var(--text-2)}
ul.rules{list-style:none;margin:0;padding:0}
ul.rules li{padding:var(--space-3) 0;border-top:1px solid var(--border-soft)}
ul.rules li:last-child{border-bottom:1px solid var(--border-soft)}
.tablewrap{overflow-x:auto;padding:var(--space-2);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-control)}
table{border-collapse:collapse;width:100%;min-width:460px;font-size:var(--text-body)}
th,td{padding:var(--space-2) var(--space-3);text-align:right;border-top:1px solid var(--border-soft);white-space:nowrap}
th:first-child,td:first-child{text-align:left}
thead th{border-top:0;font-weight:600;color:var(--text-2);font-size:var(--text-label)}
td.n{font-size:var(--text-label)}
.credits li{font-size:var(--text-body)}
.credits b{font-weight:600}
.cta{display:inline-flex;align-items:center;min-height:var(--tap);padding:0 var(--space-5);background:var(--action);color:var(--action-text);border-radius:var(--radius-control);text-decoration:none;font-weight:600;margin-top:var(--space-3)}
.cta:hover{background:var(--action-hover)}
a{color:var(--action);text-underline-offset:2px}
a:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:var(--radius-sm)}
footer{margin-top:var(--space-8);padding-top:var(--space-4);border-top:1px solid var(--border);font-size:var(--text-label);color:var(--text-2)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

/** Builds the page. Pure: facts in, HTML out. */
export function renderNumbersPage(f) {
  const { en } = f;
  const sentence = `Stop stitching trips together from five apps. Carta plans the whole trip in one place, with what each day costs: a bed plus food and drink, per person, in ${fmt(f.destinations)} places across ${f.countries} countries, with every figure labelled for where it came from.`;
  const li = (keys) => keys.map((k) => `<li>${esc(en[k])}</li>`).join('');
  const rows = f.layers.map((l) => `<tr><td>${esc(l.label)}</td><td class="n">${fmt(l.published)}</td><td class="n">${fmt(l.listed)}</td><td class="n">${fmt(l.ok)}</td><td class="n">${fmt(l.thin)}</td><td class="n">${fmt(l.empty)}</td></tr>`).join('');
  const accuracy = fill(en['cost.accuracyMethod'], f.accuracy.vars);
  const accuracyHead = fill(en['cost.accuracy'], f.accuracy.vars).replace(/ How we measured it\.$/, '');
  const credits = f.credits.map((a) => `<li><b>${esc(a.source)}</b>, ${esc(a.license)}. ${esc(a.credit)}</li>`).join('');
  const title = 'Where the numbers come from | Carta';
  const desc = `How Carta prices a day in ${fmt(f.destinations)} places, how accurate the food figure is, where coverage is thin, and the ${f.credits.length} sources it credits.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://www.carta-europetravel.com${NUMBERS_PATH}">
<meta property="og:site_name" content="Carta">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="https://www.carta-europetravel.com${NUMBERS_PATH}">
<meta name="theme-color" content="#f6f5f2">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preload" href="/fonts/Figtree-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="top"><a href="/">Carta</a><a href="/">Open the app</a></div>
<h1>Where the numbers come from</h1>
<p class="lede">${esc(sentence)}</p>
<p>This page is built from the same files the app reads. Nothing on it is typed by hand, and it needs no account.</p>

<h2>What a day price is made of</h2>
<p>Carta prices the ground: a bed plus food and drink, per person per day. Local transport and tickets are not in that figure. It does not price flights and it takes no bookings. A traveller who has a fare types in what they paid, and only then does a trip total include the flight, as their own figure.</p>
<p>Under every day price the receipt says which kind of figure it is. For the bed, one of these:</p>
<ul class="rules">${li(BED_KEYS)}</ul>
<p style="margin-top:var(--space-4)">For food, one of these:</p>
<ul class="rules">${li(FOOD_KEYS)}</ul>

<h2>How accurate the food figure is</h2>
<p>${esc(accuracyHead)}</p>
<p>${esc(accuracy)}</p>

<h2>Where coverage is thin</h2>
<p>Every region has a status for each of five layers. A thin or empty region says so on its page instead of showing a blank grid. Published rows are the ones Carta rates and shows. Listed rows are known to exist and are shown without a rating. Region counts are statuses across ${fmt(f.regions)} regions; a layer that does not apply to a region, such as beaches inland, is left out.</p>
<div class="tablewrap"><table>
<thead><tr><th scope="col">Layer</th><th scope="col">Published</th><th scope="col">Listed</th><th scope="col">Regions ok</th><th scope="col">Thin</th><th scope="col">Empty</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p class="meta" style="margin-top:var(--space-3)">Counts as of ${esc(dateOf(f.coverageDate))}, the date of the coverage file.</p>

<h2>The ${f.credits.length} sources Carta credits</h2>
<p>Every source whose licence asks for a visible credit. The same list is in the app under Account, then Imprint. Not every credit is open data: the basemap is under its provider's own terms.</p>
<ul class="rules credits">${credits}</ul>

<p><a class="cta" href="/">Open Explore</a></p>
<footer>carta-europetravel.com. Prices are estimates unless a line says measured.</footer>
</main>
</body>
</html>
`;
}

export async function buildNumbersPage(appRoot) {
  return renderNumbersPage(await readFacts(appRoot));
}

export function dataPresent(appRoot) {
  return existsSync(resolve(appRoot, 'public/boot.json')) && existsSync(resolve(appRoot, 'public/coverage.json'));
}
