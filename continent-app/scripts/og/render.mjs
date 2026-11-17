/**
 * render.mjs, rasterises a card to a PNG in headless Chromium.
 *
 * Why a browser and not a Node SVG library: the fonts are the brand, and the
 * only reliable way to set Overpass and Sofia Sans Extra Condensed with real
 * hinting and real measurement is the engine the product itself is drawn
 * in. Playwright is already a devDependency (the verify scripts use it), so
 * this adds nothing to package.json.
 *
 * Two passes happen inside the page before the screenshot. Text marked
 * data-fit shrinks until it fits its box, and the header (kind, title,
 * subtitle) is wrapped to its line budget with the title anchored to its
 * bottom line. Anything that still does not fit at the smallest allowed size
 * is cut with an ellipsis and listed in the returned report, so a long name
 * is visible to the caller instead of silently clipped.
 *
 * Usage (from continent-app/):
 *   node scripts/og/render.mjs --type destination --id "Lisbon" --out out.png
 *   node scripts/og/render.mjs --type beach --id es-es-trenc-Q11919677 --format square --out out.png
 *   node scripts/og/render.mjs --type trail --id CH/5134 --out out.png
 *   node scripts/og/render.mjs --type site --out out.png
 *   node scripts/og/render.mjs --samples ./out-dir        one card of each type, both formats
 * Options: --data <dir> reads the wire from another directory than public/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { APP_ROOT, F } from './tokens.mjs';
import { drawCard } from './cards.mjs';
import {
  destinationSpec, beachSpec, lakeSpec, mountainSpec, trailSpec, siteSpec,
} from './specs.mjs';
import {
  DEFAULT_DATA, findDestination, findLayerRow, findTrail, siteCounts,
} from './data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const b64 = (file) => fs.readFileSync(file).toString('base64');

/** The screens' own @font-face blocks (src/styles/00-fonts.css), with each
 *  woff2 inlined, so the cards are set in the very files the app loads:
 *  Overpass and Sofia Sans Extra Condensed, latin and latin-ext. */
function fontCss() {
  const css = fs.readFileSync(path.join(APP_ROOT, 'src', 'styles', '00-fonts.css'), 'utf8');
  return (css.match(/@font-face\s*{[^}]*}/g) || []).map((block) => block.replace(/url\(([^)]+\.woff2)\)/g, (_, rel) => {
    const file = path.resolve(APP_ROOT, 'src', 'styles', rel.replace(/['"]/g, ''));
    return `url(data:font/woff2;base64,${b64(file)})`;
  })).join('\n');
}

// Runs in the page. Returns { truncated: [...], titleSize, titleLines, subLines, subBottom }.
/* eslint-disable no-undef */
function layoutInPage() {
  const report = { truncated: [], titleSize: null, titleLines: 0, subLines: 0, subBottom: 0, fitted: 0 };
  const len = (el) => el.getComputedTextLength();
  const ellipsize = (el, maxW, label) => {
    let s = el.textContent;
    while (s.length > 1 && len(el) > maxW) { s = s.slice(0, -1); el.textContent = `${s.trimEnd()}…`; }
    report.truncated.push(label);
  };
  document.querySelectorAll('[data-fit]').forEach((el) => {
    const maxW = Number(el.dataset.maxw);
    const min = Number(el.dataset.min);
    let size = Number(el.getAttribute('font-size'));
    while (len(el) > maxW && size > min) { size -= 1; el.setAttribute('font-size', size); report.fitted += 1; }
    if (len(el) > maxW) ellipsize(el, maxW, el.textContent);
  });

  const g = document.getElementById('header');
  const cfg = JSON.parse(g.dataset.cfg);
  const title = g.querySelector('[data-role=title]');
  const kind = g.querySelector('[data-role=kind]');
  const sub = g.querySelector('[data-role=sub]');
  const NS = 'http://www.w3.org/2000/svg';

  const wrap = (el, text, maxW) => {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      el.textContent = next;
      if (len(el) <= maxW || !cur) cur = next; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const setLines = (el, lines, firstY, pitch) => {
    el.textContent = '';
    lines.forEach((ln, i) => {
      const t = document.createElementNS(NS, 'tspan');
      t.setAttribute('x', cfg.x);
      t.setAttribute('y', firstY + i * pitch);
      t.textContent = ln;
      el.appendChild(t);
    });
  };

  // title: largest size that wraps into the line budget, anchored by its last baseline
  const titleText = title.textContent;
  let size = cfg.titleSize;
  let lines;
  for (;;) {
    title.setAttribute('font-size', size);
    lines = wrap(title, titleText, cfg.maxW);
    if (lines.length <= cfg.titleLines || size <= cfg.titleMin) break;
    size -= 2;
  }
  const pitch = size * 1.08;
  if (lines.length > cfg.titleLines) {
    lines = lines.slice(0, cfg.titleLines);
    const last = lines[lines.length - 1];
    title.textContent = last;
    let s = last;
    while (s.length > 1 && len(title) > cfg.maxW - 20) { s = s.slice(0, -1); title.textContent = `${s.trimEnd()}…`; }
    lines[lines.length - 1] = `${s.trimEnd()}…`;
    report.truncated.push(titleText);
  }
  const firstY = cfg.titleBottom - (lines.length - 1) * pitch;
  setLines(title, lines, firstY, pitch);
  report.titleSize = size;
  report.titleLines = lines.length;
  if (!cfg.kindFixed) kind.setAttribute('y', firstY - size * 0.74 - cfg.kindGap);

  // subtitle: fixed size, as many lines as fit above subMaxBottom
  const subText = sub.textContent;
  sub.setAttribute('font-size', cfg.subSize);
  const subFirst = cfg.titleBottom + cfg.subGap;
  const subPitch = cfg.subSize * 1.35;
  const budget = Math.max(1, Math.floor((cfg.subMaxBottom - subFirst) / subPitch) + 1);
  let sl = wrap(sub, subText, cfg.maxW);
  if (sl.length > budget) {
    sl = sl.slice(0, budget);
    sub.textContent = sl[budget - 1];
    let s = sl[budget - 1];
    while (s.length > 1 && len(sub) > cfg.maxW - 20) { s = s.slice(0, -1); sub.textContent = `${s.trimEnd()}…`; }
    sl[budget - 1] = `${s.trimEnd()}…`;
    report.truncated.push(subText);
  }
  setLines(sub, sl, subFirst, subPitch);
  report.subLines = sl.length;
  report.subBottom = subFirst + (sl.length - 1) * subPitch;
  // On a plate the name and its line sit centred in the plate's height.
  if (cfg.plateTop != null && subText) {
    const capH = size * 0.7;
    const block = capH + (lines.length - 1) * pitch + cfg.subGap + cfg.subSize * 0.22;
    const want = cfg.plateTop + (cfg.plateH - block) / 2 + capH;
    const dy = want - firstY;
    for (const t of [...title.children, ...sub.children]) t.setAttribute('y', Number(t.getAttribute('y')) + dy);
    report.subBottom += dy;
  } else if (cfg.plateTop != null) {
    const capH = size * 0.7;
    const block = capH + (lines.length - 1) * pitch;
    const dy = cfg.plateTop + (cfg.plateH - block) / 2 + capH - firstY;
    for (const t of title.children) t.setAttribute('y', Number(t.getAttribute('y')) + dy);
  }
  return report;
}
/* eslint-enable no-undef */

let browserPromise = null;
const getBrowser = () => (browserPromise ||= chromium.launch());
export async function closeBrowser() {
  if (browserPromise) { const b = await browserPromise; await b.close(); browserPromise = null; }
}

/** Rasterise any HTML/SVG body at a size. Returns { png, report }. */
export async function rasterise(svg, width, height, { layout = true, transparent = false } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${fontCss()}html,body{margin:0;background:${transparent ? 'transparent' : '#fff'}}svg{display:block}</style>${svg}`);
    await page.evaluate(async () => {
      await Promise.all(['400 20px "Overpass"', '600 20px "Overpass"', '800 20px "Overpass"', '700 20px "Sofia Sans Extra Condensed"']
        .map((f) => document.fonts.load(f, 'AaÉéČŠő0123€')));
      await document.fonts.ready;
    });
    const report = layout ? await page.evaluate(layoutInPage) : null;
    const png = await page.screenshot({ type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
    return { png, report };
  } finally {
    await page.close();
  }
}

/** One card, built from a wire record. Resolves { png, report, spec, fellBack }. */
export async function renderCard({ type, id, format = 'og', data = DEFAULT_DATA, siteSample = null }) {
  let spec = null;
  if (type === 'destination') {
    const hit = findDestination(id, data);
    spec = hit ? destinationSpec(hit.key, hit.dest) : null;
  } else if (type === 'beach' || type === 'lake' || type === 'mountain') {
    const row = findLayerRow(type, id, data);
    spec = row ? { beach: beachSpec, lake: lakeSpec, mountain: mountainSpec }[type](row) : null;
  } else if (type === 'trail') {
    spec = trailSpec(findTrail(id, data));
  }
  let fellBack = false;
  if (!spec) {
    fellBack = true;
    let sample = null;
    if (siteSample) {
      const hit = findDestination(siteSample, data);
      sample = hit ? destinationSpec(hit.key, hit.dest) : null;
    }
    spec = siteSpec(siteCounts(data), sample);
  }
  const { svg, width, height } = drawCard(spec, format);
  const { png, report } = await rasterise(svg, width, height);
  return { png, report, spec, fellBack, width, height };
}

/** The standard sample set, one of each type, used by check.mjs and the report. */
export const SAMPLES = [
  { name: 'site', type: 'site', siteSample: 'Lisbon' },
  { name: 'destination-brussels', type: 'destination', id: 'Brussels' },
  { name: 'beach-es-trenc', type: 'beach', id: 'es-es-trenc-Q11919677' },
  { name: 'lake-attersee', type: 'lake', id: 'at-attersee-Q698516' },
  { name: 'mountain-dachstein', type: 'mountain', id: 'at-hoher-dachstein-Q686841' },
  { name: 'trail-mythenweg', type: 'trail', id: 'CH/5134' },
];

async function main() {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  try {
    if (a.samples) {
      fs.mkdirSync(a.samples, { recursive: true });
      for (const s of SAMPLES) {
        for (const format of ['og', 'square']) {
          const r = await renderCard({ ...s, format, data: a.data || DEFAULT_DATA });
          const out = path.join(a.samples, `${s.name}-${format}.png`);
          fs.writeFileSync(out, r.png);
          console.log(out, r.png.length, JSON.stringify(r.report));
        }
      }
    } else {
      const r = await renderCard({ type: a.type || 'site', id: a.id, format: a.format || 'og', data: a.data || DEFAULT_DATA, siteSample: a.sample || 'Lisbon' });
      fs.writeFileSync(a.out || `${a.type || 'site'}.png`, r.png);
      console.log(a.out, r.png.length, r.fellBack ? 'fell back to the site card' : '', JSON.stringify(r.report));
    }
  } finally {
    await closeBrowser();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
