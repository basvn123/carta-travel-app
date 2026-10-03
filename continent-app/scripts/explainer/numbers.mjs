/**
 * "Where the numbers come from" (T318, register rows T226-b and T207-c).
 *
 * One static page, assembled at build time from files, never typed:
 *   - the positioning sentence of PRODUCT.md (T201), with its two counts read
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
const FOOD_KEYS = ['cost.foodCity', 'cost.foodCountry', 'cost.foodScaled'];

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

const CSS = `
:root{--paper:#f8f6f0;--paper-dim:#efece2;--ink:#0f172a;--ink-soft:#414b5e;--ink-mute:#7d8393;--rule:#ccc7b8;--rule-soft:#e2ded1;--accent:#e05a47;--ink-fill:#2b3446;
--display:'Fraunces','Iowan Old Style',Georgia,serif;--ui:'Plus Jakarta Sans','Inter Tight',system-ui,-apple-system,sans-serif;--mono:'JetBrains Mono','SF Mono',Menlo,monospace;
--space-2:8px;--space-3:12px;--space-4:16px;--space-5:22px;--space-6:30px;--space-7:40px;--space-8:56px;--tap:44px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--ui);font-size:16px;line-height:1.55}
main{max-width:720px;margin:0 auto;padding:var(--space-4) var(--space-4) var(--space-8)}
.top{display:flex;justify-content:space-between;align-items:center;gap:var(--space-4);border-bottom:1px solid var(--rule)}
.top a{color:var(--ink);text-decoration:none;font-weight:600;min-height:var(--tap);display:inline-flex;align-items:center}
h1{font-family:var(--display);font-weight:600;font-size:clamp(30px,6vw,44px);line-height:1.1;letter-spacing:-0.02em;margin:var(--space-6) 0 var(--space-4)}
h2{font-family:var(--ui);font-weight:600;font-size:20px;line-height:1.25;margin:var(--space-7) 0 var(--space-3)}
p{margin:0 0 var(--space-3)}
.lede{font-size:18px;color:var(--ink-soft)}
.n{font-family:var(--mono);font-variant-numeric:tabular-nums}
.meta{font-size:13px;color:var(--ink-soft)}
ul.rules{list-style:none;margin:0;padding:0}
ul.rules li{padding:var(--space-3) 0;border-top:1px solid var(--rule-soft)}
ul.rules li:last-child{border-bottom:1px solid var(--rule-soft)}
.tablewrap{overflow-x:auto;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
table{border-collapse:collapse;width:100%;min-width:460px;font-size:14px}
th,td{padding:var(--space-2) var(--space-3);text-align:right;border-top:1px solid var(--rule-soft);white-space:nowrap}
th:first-child,td:first-child{text-align:left;padding-left:0}
thead th{border-top:0;font-weight:600;color:var(--ink-soft);font-size:13px}
td.n{font-size:13px}
.credits li{font-size:14px}
.credits b{font-weight:600}
.cta{display:inline-flex;align-items:center;min-height:var(--tap);padding:0 var(--space-5);background:var(--ink-fill);color:#fff;border-radius:6px;text-decoration:none;font-weight:600;margin-top:var(--space-3)}
a{color:var(--ink)}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
footer{margin-top:var(--space-8);padding-top:var(--space-4);border-top:1px solid var(--rule);font-size:13px;color:var(--ink-soft)}
`;

/** Builds the page. Pure: facts in, HTML out. */
export function renderNumbersPage(f) {
  const { en } = f;
  const sentence = `Carta is a price transparency tool for budget travel in Europe: for people who start from "what can I afford", it says what a day costs, per person, in ${fmt(f.destinations)} places across ${f.countries} countries, and labels every figure for where it came from.`;
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
<meta name="theme-color" content="#f8f6f0">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Plus+Jakarta+Sans:wght@400;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<main>
<div class="top"><a href="/">Carta</a><a href="/">Open the app</a></div>
<h1>Where the numbers come from</h1>
<p class="lede">${esc(sentence)}</p>
<p>This page is built from the same files the app reads. Nothing on it is typed by hand, and it needs no account.</p>

<h2>What a day price is made of</h2>
<p>Carta prices the ground: the bed, food and local transport, per person per day. It does not price flights and it takes no bookings. A traveller who has a fare types in what they paid, and only then does a trip total include the flight, as their own figure.</p>
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
<p>Every source whose licence asks for a visible credit. The same list is in the app under Account, then Data sources. Not every credit is open data: the basemap is under its provider's own terms.</p>
<ul class="rules credits">${credits}</ul>

<p><a class="cta" href="/">Open the map</a></p>
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
