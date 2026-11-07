#!/usr/bin/env node
/**
 * T1175 (ROADMAP K7): Carta's shareable assets, built from the shipped data.
 *
 *   1. "Europe on 100 EUR a day": every priced place on a map of Europe, a
 *      filled dot where one person's day (a bed and food, the app's default
 *      request) fits the budget, a hollow one where it does not.
 *   2. "The cheapest week": per place with a measured month curve, the 52
 *      weeks of a year priced at their own dates, the cheapest marked.
 *   3. A sample trip receipt (the app draws the real one from a saved trip,
 *      continent-app/src/lib/share/receipt.js); here only as a preview.
 *
 * Every figure comes from the app's own price engine
 * (continent-app/src/lib/price/priceDay.js), so a number on an image is the
 * number the Explore card shows. Each image is a list of draw.js ops; every
 * text op that prints a figure names it, and the numbers check
 * (checkFigures plus the invariants below) fails the run when a printed
 * figure does not match the data. Credits are printed on every image.
 *
 * Run from the repo root (needs continent-app/node_modules):
 *   node scripts/share/share_assets.mjs                     map + sample receipt
 *   node scripts/share/share_assets.mjs --stays DIR         also the calendars,
 *        from a folder of stays wire files ({cc}.json, as on the data host
 *        under data/stays-live/v1/); without it no place has a month curve
 *   node scripts/share/share_assets.mjs --places LIS,OPO    calendars for these only
 *   node scripts/share/share_assets.mjs --budget 100 --year 2027 --png
 *   --check   recompute and compare with the files in out/, write nothing
 * Outputs (gitignored): scripts/share/out/ map_{budget}.svg, map_{budget}.json,
 * calendar/{id}.svg, calendars.json, receipt_sample.svg, and .png with --png.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = process.env.CARTA_APP || join(ROOT, 'continent-app');
const OUT = process.env.SHARE_OUT || join(ROOT, 'scripts', 'share', 'out');

if (!existsSync(join(APP, 'node_modules'))) {
  console.error(`No node_modules in ${APP}: run \`npm ci\` there first (the price engine imports app modules).`);
  process.exit(2);
}
const lib = async (p) => import(join(APP, 'src', p));
const { priceDays, priceDay } = await lib('lib/price/priceDay.js');
const { DEFAULT_PRICE_REQUEST, atDates } = await lib('lib/price/request.js');
const { setStayRecords, mergeStayFiles } = await lib('lib/staysData.js');
const { seasonCurve } = await lib('lib/stayPrice.js');
const { formatMoney } = await lib('lib/money.js');
const { opsToSvg, paletteFromTokensCss, checkFigures, wrapText } = await lib('lib/share/draw.js');
const { receiptModel, receiptOps, checkReceipt, RECEIPT_W, RECEIPT_H } = await lib('lib/share/receipt.js');

export const W = 1080;
export const H = 1350;
const money = (v) => formatMoney(v, { locale: 'en' });
const count = (n) => new Intl.NumberFormat('en-GB').format(n);
const fmt = (f) => (f.money ? money(f.value) : count(f.value));
const r0 = (x) => Math.round(x);

/** The credits every image carries (docs/tos/data_licenses.md rows). */
export const CREDITS = {
  map: 'Map: Natural Earth (public domain).',
  places: 'Places: GeoNames (CC BY 4.0), © OpenStreetMap contributors (ODbL).',
  prices: "Prices: Carta's own samples of list prices, Inside Airbnb (CC BY 4.0), Eurostat, Open Food Facts Open Prices (ODbL).",
  site: 'carta-europetravel.com',
};

// The Your Europe projection (pipeline/oneoff/build_europe_map.py, the
// constants TripTrace.jsx carries): Lambert azimuthal equal-area, 52N 10E.
const LON0 = (10 * Math.PI) / 180;
const LAT0 = (52 * Math.PI) / 180;
const MINX = -1758.481338462631;
const MAXY = 2288.2574054579854;
const SCALE = 0.24931956659572943;
export function project(lat, lon) {
  const lam = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const k = Math.sqrt(2 / (1 + Math.sin(LAT0) * Math.sin(phi) + Math.cos(LAT0) * Math.cos(phi) * Math.cos(lam - LON0)));
  const x = 6371 * k * Math.cos(phi) * Math.sin(lam - LON0);
  const y = 6371 * k * (Math.cos(LAT0) * Math.sin(phi) - Math.sin(LAT0) * Math.cos(phi) * Math.cos(lam - LON0));
  return [(x - MINX) * SCALE, (MAXY - y) * SCALE];
}

const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function credits(ops, y, { withMap = true } = {}) {
  const text = [withMap ? CREDITS.map : '', CREDITS.places, CREDITS.prices].filter(Boolean).join(' ');
  wrapText(text, 112).forEach((line, i) => ops.push({ t: 'text', x: 60, y: y + i * 24, text: line, size: 17, weight: 500, fill: 'neutral-600', plain: true }));
}

// ---------------------------------------------------------------- the map
/** The map's figures from the bulk engine (priceDays). */
export function mapModel(app, { budget = 100 } = {}) {
  const dests = app.destinations || {};
  const prices = priceDays(dests, DEFAULT_PRICE_REQUEST);
  const dots = [];
  for (const [id, d] of Object.entries(dests)) {
    const day = prices.get(id)?.dayEur;
    const lat = d.city_lat ?? d.lat;
    const lon = d.city_lon ?? d.lon;
    if (day == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    dots.push({ id, iso2: d.iso2, country: d.country, day, fits: day <= budget, xy: project(lat, lon) });
  }
  dots.sort((a, b) => a.id.localeCompare(b.id));
  const byCountry = new Map();
  for (const p of dots.filter((x) => x.fits)) byCountry.set(p.country, (byCountry.get(p.country) || 0) + 1);
  const top = [...byCountry].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([country, n]) => ({ country, n }));
  const caps = Object.values(dests).map((d) => d.accommodation?.captured).filter(Boolean).sort();
  const meta = app.meta || {};
  return {
    budget,
    places: Object.keys(dests).length,
    priced: dots.length,
    fits: dots.filter((p) => p.fits).length,
    over: dots.filter((p) => !p.fits).length,
    top,
    dots,
    asOf: {
      catalogue: String(meta.generated_at || '').slice(0, 10) || null,
      beds_from: caps[0] || null,
      beds_to: caps.at(-1) || null,
      food: meta.food_model?.asof || null,
    },
  };
}

/** The same figures by a second path: one priceDay per place. */
export function mapExpected(app, { budget = 100 } = {}) {
  const dests = app.destinations || {};
  let priced = 0, fits = 0;
  const byCountry = new Map();
  for (const d of Object.values(dests)) {
    const lat = d.city_lat ?? d.lat;
    const lon = d.city_lon ?? d.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const day = priceDay(d, DEFAULT_PRICE_REQUEST, dests)?.dayEur;
    if (day == null) continue;
    priced += 1;
    if (day <= budget) { fits += 1; byCountry.set(d.country, (byCountry.get(d.country) || 0) + 1); }
  }
  const out = { budget, priced, fits, over: priced - fits };
  [...byCountry].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
    .forEach(([, n], i) => { out[`top${i}`] = n; });
  return out;
}

export function mapOps(m, geo) {
  const ops = [];
  const B = { key: 'budget', value: m.budget, money: true };
  ops.push({ t: 'text', x: 60, y: 104, text: `Europe on ${money(m.budget)} a day`, size: 60, weight: 800, fill: 'neutral-900', fig: B });
  ops.push({
    t: 'text', x: 60, y: 152, text: `${count(m.fits)} of ${count(m.priced)} places: a bed and food for one person, under ${money(m.budget)}`,
    size: 28, weight: 600, fill: 'neutral-700', fig: [{ key: 'fits', value: m.fits }, { key: 'priced', value: m.priced }, B],
  });
  if (m.top.length) {
    ops.push({
      t: 'text', x: 60, y: 192, text: `Most of them: ${m.top.map((c) => `${c.country} ${count(c.n)}`).join(', ')}`,
      size: 24, weight: 500, fill: 'lagoon-700', fig: m.top.map((c, i) => ({ key: `top${i}`, value: c.n })),
    });
  }
  // The map: 0.92 of the Your Europe frame, under the heading.
  const S = 0.92, TX = (W - 1000 * S) / 2, TY = 214;
  ops.push({ t: 'path', d: geo.context, fill: 'neutral-100', tx: TX, ty: TY, scale: S });
  for (const c of geo.countries) ops.push({ t: 'path', d: c.d, fill: 'umber-100', stroke: 'neutral-0', sw: 1, tx: TX, ty: TY, scale: S });
  const at = (p) => [Math.round((TX + p.xy[0] * S) * 10) / 10, Math.round((TY + p.xy[1] * S) * 10) / 10];
  for (const p of m.dots.filter((x) => !x.fits)) { const [cx, cy] = at(p); ops.push({ t: 'circle', cx, cy, r: 3, fill: 'neutral-0', stroke: 'umber-500', sw: 1, dot: 'over' }); }
  for (const p of m.dots.filter((x) => x.fits)) { const [cx, cy] = at(p); ops.push({ t: 'circle', cx, cy, r: 4.2, fill: 'lagoon-600', stroke: 'neutral-0', sw: 1, dot: 'fits' }); }
  // Legend, method, date, credits.
  let y = 214 + 1034.5 * S - 6;
  ops.push({ t: 'rect', x: 0, y: y - 34, w: W, h: H - y + 34, fill: 'umber-50' });
  ops.push({ t: 'circle', cx: 70, cy: y - 8, r: 8, fill: 'lagoon-600' });
  ops.push({ t: 'text', x: 88, y, text: `Under ${money(m.budget)} (${count(m.fits)})`, size: 22, weight: 700, fill: 'neutral-900', fig: [B, { key: 'fits', value: m.fits }] });
  ops.push({ t: 'circle', cx: 340, cy: y - 8, r: 7, fill: 'neutral-0', stroke: 'umber-500', sw: 2 });
  ops.push({ t: 'text', x: 358, y, text: `Over (${count(m.over)})`, size: 22, weight: 700, fill: 'neutral-900', fig: { key: 'over', value: m.over } });
  y += 30;
  ops.push({ t: 'text', x: 60, y, text: 'One person a day: a bed in an entire place for two (yearly median, fees in) and food and drink, Easygoing. Not the way there.', size: 17, weight: 500, fill: 'neutral-700' });
  y += 24;
  const as = m.asOf;
  ops.push({ t: 'text', x: 60, y, text: `Carta data of ${as.catalogue ? longDate(as.catalogue) : 'n/a'}; beds sampled ${as.beds_from ? longDate(as.beds_from) : 'n/a'} to ${as.beds_to ? longDate(as.beds_to) : 'n/a'}; food prices ${as.food || 'n/a'}.`, size: 17, weight: 500, fill: 'neutral-700', date: true });
  credits(ops, y + 24);
  return ops;
}

/** The map's own invariants on top of checkFigures: the dots drawn are the
 *  places counted. */
export function checkMap(ops, m, expected) {
  const problems = checkFigures(ops, { expected, format: fmt });
  const fitsDots = ops.filter((o) => o.dot === 'fits').length;
  const overDots = ops.filter((o) => o.dot === 'over').length;
  if (fitsDots !== expected.fits) problems.push(`${fitsDots} filled dots drawn, ${expected.fits} places fit`);
  if (overDots !== expected.over) problems.push(`${overDots} hollow dots drawn, ${expected.over} places are over`);
  return problems;
}

// ----------------------------------------------------------- the calendar
/** The 52 weeks (Monday to Monday) starting in `year`. */
export function weeksOf(year) {
  let d = `${year}-01-01`;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return Array.from({ length: 52 }, (_, i) => addDays(d, i * 7));
}

/** One place's 52 weeks, a person a week (a bed and food, 7 nights), at
 *  each week's own dates; null without a measured month curve. */
export function calendarModel(dest, dests, { year = 2027 } = {}) {
  if (!seasonCurve(dest)) return null;
  const weeks = [];
  for (const start of weeksOf(year)) {
    const p = priceDay(dest, atDates(DEFAULT_PRICE_REQUEST, start, addDays(start, 7)), dests);
    if (p?.dayEur == null) return null;
    weeks.push({ start, week: r0(p.dayEur * 7) });
  }
  const vals = weeks.map((w) => w.week);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = r0(vals.reduce((a, b) => a + b, 0) / vals.length);
  return {
    id: dest.id, city: dest.city, country: dest.country, year, weeks, mean,
    cheapest: weeks.find((w) => w.week === min), dearest: weeks.find((w) => w.week === max),
    captured: dest.accommodation?.captured || null,
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function calendarOps(c) {
  const ops = [];
  ops.push({ t: 'text', x: 60, y: 100, text: c.city, size: 58, weight: 800, fill: 'neutral-900' });
  ops.push({ t: 'text', x: 60, y: 146, text: `The cheapest week to go in ${c.year}`, size: 30, weight: 600, fill: 'umber-700', date: true });
  ops.push({ t: 'text', x: 60, y: 196, text: `Week of ${longDate(c.cheapest.start)}`, size: 28, weight: 700, fill: 'neutral-900', date: true });
  ops.push({ t: 'text', x: W - 60, y: 196, text: `${money(c.cheapest.week)} a person`, size: 34, weight: 800, fill: 'neutral-900', anchor: 'end', fig: { key: 'cheapest', value: c.cheapest.week, money: true } });
  ops.push({ t: 'text', x: 60, y: 234, text: `Dearest, week of ${longDate(c.dearest.start)}`, size: 22, weight: 500, fill: 'neutral-700', date: true });
  ops.push({ t: 'text', x: W - 60, y: 234, text: money(c.dearest.week), size: 22, weight: 700, fill: 'neutral-700', anchor: 'end', fig: { key: 'dearest', value: c.dearest.week, money: true } });
  ops.push({ t: 'text', x: 60, y: 266, text: 'A week on average', size: 22, weight: 500, fill: 'neutral-700' });
  ops.push({ t: 'text', x: W - 60, y: 266, text: money(c.mean), size: 22, weight: 700, fill: 'neutral-700', anchor: 'end', fig: { key: 'mean', value: c.mean, money: true } });
  // One row a month, a cell a week (by its Monday).
  const top = 292, rowH = 68, labelW = 150, cellW = (W - 120 - labelW) / 5;
  const byMonth = MONTHS.map(() => []);
  for (const w of c.weeks) byMonth[Number(w.start.slice(5, 7)) - 1].push(w);
  byMonth.forEach((ws, m) => {
    const y = top + m * rowH;
    ops.push({ t: 'text', x: 60, y: y + 42, text: MONTHS[m], size: 22, weight: 600, fill: 'neutral-700' });
    ws.forEach((w, i) => {
      const x = 60 + labelW + i * cellW;
      const r = w.week / c.mean;
      const best = w.week === c.cheapest.week;
      const tone = best ? ['sun-400', 'sun-800'] : r <= 0.92 ? ['lagoon-100', 'lagoon-700'] : r >= 1.08 ? ['umber-200', 'umber-800'] : ['neutral-100', 'neutral-700'];
      ops.push({ t: 'rect', x: Math.round(x + 3), y: y + 4, w: Math.round(cellW - 6), h: rowH - 8, r: 12, fill: tone[0], cell: true });
      ops.push({ t: 'text', x: Math.round(x + 16), y: y + 28, text: shortDate(w.start), size: 15, weight: 500, fill: tone[1], date: true });
      ops.push({ t: 'text', x: Math.round(x + 16), y: y + 53, text: money(w.week), size: 22, weight: 800, fill: tone[1], fig: { key: `w.${w.start}`, value: w.week, money: true } });
    });
  });
  let y = top + 12 * rowH + 34;
  const key = [['sun-400', 'Cheapest'], ['lagoon-100', '8% or more under the average'], ['umber-200', '8% or more over']];
  let x = 60;
  for (const [fill, label] of key) {
    ops.push({ t: 'rect', x, y: y - 18, w: 22, h: 22, r: 6, fill });
    ops.push({ t: 'text', x: x + 32, y, text: label, size: 19, weight: 600, fill: 'neutral-700', ...(/\d/.test(label) ? { plain: true } : {}) });
    x += 64 + label.length * 9.5;
  }
  y += 34;
  for (const line of wrapText('One person, seven nights from the Monday: a bed in an entire place for two at that week\'s prices (fees in) and food and drink, Easygoing.', 112)) {
    ops.push({ t: 'text', x: 60, y, text: line, size: 17, weight: 500, fill: 'neutral-700' });
    y += 24;
  }
  ops.push({ t: 'text', x: 60, y, text: `Beds sampled ${c.captured ? longDate(c.captured) : 'n/a'}; prices before booking, not a promise. ${CREDITS.site}`, size: 17, weight: 500, fill: 'neutral-700', date: true });
  credits(ops, y + 24, { withMap: false });
  return ops;
}

/** The calendar's figures by a second path: each week's bed and food lines
 *  summed again from the engine's line items, and the extremes re-derived. */
export function calendarExpected(c, dest, dests) {
  const out = {};
  const vals = [];
  for (const w of c.weeks) {
    const p = priceDay(dest, atDates(DEFAULT_PRICE_REQUEST, w.start, addDays(w.start, 7)), dests);
    const lines = (p?.lines || []).filter((l) => l.status === 'included');
    const day = lines.reduce((s, l) => s + (l.eur ?? NaN), 0);
    const v = r0(day * 7);
    out[`w.${w.start}`] = v;
    vals.push(v);
  }
  out.cheapest = Math.min(...vals);
  out.dearest = Math.max(...vals);
  out.mean = r0(vals.reduce((a, b) => a + b, 0) / vals.length);
  return out;
}

export function checkCalendar(ops, c, expected) {
  const problems = checkFigures(ops, { expected, format: fmt });
  const cells = ops.filter((o) => o.cell).length;
  if (cells !== 52) problems.push(`${cells} week cells drawn, a year has 52`);
  if (c.weeks.some((w) => w.week < c.cheapest.week)) problems.push('a week is cheaper than the one marked cheapest');
  return problems;
}

// ---------------------------------------------------------------- the run
export const SAMPLE_PLAN = {
  stops: [
    { destination_id: 'LIS', arrive_date: '2027-05-10', depart_date: '2027-05-14', choices: { groupSize: 2 } },
    { destination_id: 'OPO', arrive_date: '2027-05-14', depart_date: '2027-05-17' },
  ],
};

export function loadStaysDir(dir) {
  const files = readdirSync(dir).filter((f) => /^[A-Z]{2}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const recs = mergeStayFiles(files);
  setStayRecords(recs);
  return Object.keys(recs).length;
}

export function buildAll(app, { budget = 100, year = 2027, places = null, geo, pal }) {
  const files = new Map();
  const problems = [];
  const svg = (ops, w = W, h = H, bg = 'umber-50') => opsToSvg(ops, { w, h, pal, family: 'Figtree, sans-serif', bg });

  const m = mapModel(app, { budget });
  const mOps = mapOps(m, geo);
  problems.push(...checkMap(mOps, m, mapExpected(app, { budget })).map((p) => `map: ${p}`));
  files.set(`map_${budget}.svg`, svg(mOps));
  const { dots, ...mapFigures } = m;
  files.set(`map_${budget}.json`, `${JSON.stringify({ task: 'T1175', roadmap: 'K7', ...mapFigures, dots: dots.length }, null, 2)}\n`);

  const dests = app.destinations || {};
  const ids = places || Object.keys(dests).sort();
  const cals = [];
  for (const id of ids) {
    const d = dests[id];
    if (!d) { problems.push(`calendar: no place ${id}`); continue; }
    const c = calendarModel(d, dests, { year });
    if (!c) continue;
    const ops = calendarOps(c);
    problems.push(...checkCalendar(ops, c, calendarExpected(c, d, dests)).map((p) => `calendar ${id}: ${p}`));
    files.set(`calendar/${id}.svg`, svg(ops));
    cals.push({ id, city: c.city, country: c.country, cheapest: c.cheapest, dearest: c.dearest, mean: c.mean });
  }
  files.set('calendars.json', `${JSON.stringify({ task: 'T1175', year, n: cals.length, calendars: cals }, null, 2)}\n`);

  return { files, problems, map: m, calendars: cals };
}

export function sampleReceipt(app, { pal, t }) {
  const opts = { data: app };
  const model = receiptModel(SAMPLE_PLAN, opts);
  if (!model) return { svg: null, problems: ['receipt: the sample trip cannot be priced'] };
  const pricedOn = longDate(String(app.meta?.generated_at || '').slice(0, 10) || '2026-01-01');
  const ops = receiptOps(model, { t, money, dateText: (a, b) => `${shortDate(a)} to ${longDate(b)}`, pricedOn });
  const problems = checkReceipt(ops, model, SAMPLE_PLAN, opts, money).map((p) => `receipt: ${p}`);
  return { svg: opsToSvg(ops, { w: RECEIPT_W, h: RECEIPT_H, pal, family: 'Figtree, sans-serif', bg: 'umber-800' }), problems };
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const budget = Number(arg('--budget', 100));
  const year = Number(arg('--year', 2027));
  const places = arg('--places') ? arg('--places').split(',').map((s) => s.trim()).filter(Boolean) : null;
  const staysDir = arg('--stays');
  const check = args.includes('--check');

  const app = JSON.parse(readFileSync(join(APP, 'public', 'app_data.json'), 'utf8'));
  const geo = JSON.parse(readFileSync(join(APP, 'public', 'europe_map.json'), 'utf8'));
  const pal = paletteFromTokensCss(readFileSync(join(APP, 'src', 'styles', '01-tokens.css'), 'utf8'));
  const { en } = await lib('i18n/en.js');
  const t = (k, v = {}) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v[n] ?? `{${n}}`));
  const stays = staysDir ? loadStaysDir(staysDir) : 0;

  const { files, problems, map, calendars } = buildAll(app, { budget, year, places, geo, pal });
  const rec = sampleReceipt(app, { pal, t });
  problems.push(...rec.problems);
  if (rec.svg) files.set('receipt_sample.svg', rec.svg);

  if (problems.length) {
    console.error(`numbers check failed (${problems.length}):\n  ${problems.slice(0, 40).join('\n  ')}`);
    process.exit(1);
  }
  if (check) {
    const drift = [...files].filter(([f, body]) => !existsSync(join(OUT, f)) || readFileSync(join(OUT, f), 'utf8') !== body).map(([f]) => f);
    if (drift.length) { console.error(`out/ drifts from the data: ${drift.slice(0, 10).join(', ')}${drift.length > 10 ? ' ...' : ''}`); process.exit(1); }
    console.log(`numbers check passed; ${files.size} files match the data.`);
    return;
  }
  for (const [f, body] of files) {
    mkdirSync(dirname(join(OUT, f)), { recursive: true });
    writeFileSync(join(OUT, f), body);
  }
  console.log(`numbers check passed. map: ${map.fits} of ${map.priced} places under ${money(budget)} a day; ${calendars.length} calendars (${stays} stay records); ${files.size} files in ${OUT}`);
  if (args.includes('--png')) {
    const { renderPngs } = await import('./render_png.mjs');
    const svgs = [...files.keys()].filter((f) => f.endsWith('.svg')).map((f) => join(OUT, f));
    const done = await renderPngs(svgs);
    console.log(`wrote ${done.length} PNG`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
