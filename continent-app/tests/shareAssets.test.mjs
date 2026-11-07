// T1175 (ROADMAP K7): the shareable assets. The draw ops, the trip receipt's
// numbers check, the flag, and the offline map and calendar generator
// (scripts/share/share_assets.mjs) on the shipped catalogue and a fixture
// month curve. Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { opsToSvg, checkFigures, paletteFromTokensCss, wrapText, SHARE_TOKENS } from '../src/lib/share/draw.js';
import { receiptModel, receiptOps, checkReceipt, RECEIPT_LINE_KEY } from '../src/lib/share/receipt.js';
import { shareReceiptOn, SHARE_RECEIPT_KEY } from '../src/lib/share/flag.js';
import { formatMoney } from '../src/lib/money.js';
import { en } from '../src/i18n/en.js';

const DATA = new URL('../public/app_data.json', import.meta.url);
const have = existsSync(DATA);
const data = have ? JSON.parse(readFileSync(DATA, 'utf8')) : null;
const tokensCss = readFileSync(new URL('../src/styles/01-tokens.css', import.meta.url), 'utf8');
const t = (k, v = {}) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v[n] ?? `{${n}}`));
const money = (v) => formatMoney(v, { locale: 'en' });
const PLAN = {
  stops: [
    { destination_id: 'LIS', arrive_date: '2027-05-10', depart_date: '2027-05-14', choices: { groupSize: 2 } },
    { destination_id: 'OPO', arrive_date: '2027-05-14', depart_date: '2027-05-17' },
  ],
};

test('every share colour is a token in 01-tokens.css', () => {
  const pal = paletteFromTokensCss(tokensCss);
  for (const k of SHARE_TOKENS) assert.match(pal[k] || '', /^#|^var\(/, k);
});

test('opsToSvg draws each op, escapes text and resolves token names', () => {
  const svg = opsToSvg([
    { t: 'rect', x: 0, y: 0, w: 10, h: 10, r: 2, fill: 'umber-600' },
    { t: 'circle', cx: 5, cy: 5, r: 2, fill: 'lagoon-600', stroke: 'neutral-0' },
    { t: 'text', x: 1, y: 2, text: 'A & B <c>', size: 12, anchor: 'end' },
  ], { w: 10, h: 10, pal: { 'umber-600': '#8c5a2b' } });
  assert.match(svg, /fill="#8c5a2b"/);
  assert.match(svg, /fill="lagoon-600"/, 'an unresolved name is left as is');
  assert.match(svg, /A &amp; B &lt;c&gt;/);
  assert.match(svg, /text-anchor="end"/);
  assert.deepEqual(wrapText('one two three four', 9), ['one two', 'three', 'four']);
});

test('checkFigures: a printed number needs its figure, and the figure the data', () => {
  const fmt = (f) => (f.money ? money(f.value) : String(f.value));
  const ok = [{ t: 'text', text: `${money(140)} a day`, fig: { key: 'd', value: 140, money: true } }];
  assert.deepEqual(checkFigures(ok, { expected: { d: 140 }, format: fmt }), []);
  assert.equal(checkFigures(ok, { expected: { d: 141 }, format: fmt }).length, 1, 'the data disagrees');
  assert.equal(checkFigures([{ t: 'text', text: '3 nights' }], { format: fmt }).length, 1, 'a bare number');
  assert.equal(checkFigures([{ t: 'text', text: '10 May 2027', date: true }], { format: fmt }).length, 0, 'a date is the caller\'s');
  assert.equal(checkFigures([{ t: 'text', text: 'CC BY 4.0', plain: true }], { format: fmt }).length, 0);
  const wrong = [{ t: 'text', text: `${money(150)} a day`, fig: { key: 'd', value: 140, money: true } }];
  assert.equal(checkFigures(wrong, { expected: { d: 140 }, format: fmt }).length, 1, 'printed not what it claims');
});

test('every receipt line key has an English label', () => {
  for (const k of Object.values(RECEIPT_LINE_KEY)) assert.ok(en[k], k);
  for (const k of ['receiptKicker', 'receiptPartyN', 'receiptTotalN', 'receiptPerDay', 'receiptNote', 'receiptBrand']) assert.ok(en[`share.${k}`], k);
});

test('the trip receipt prints only figures the trip price holds', { skip: have ? false : 'no app_data.json' }, () => {
  const opts = { data };
  const m = receiptModel(PLAN, opts);
  assert.ok(m, 'priced');
  assert.equal(m.title, 'Lisbon, Porto');
  assert.equal(m.nights, 7);
  assert.equal(m.party, 2);
  const ops = receiptOps(m, { t, money, dateText: () => '10 to 17 May 2027', pricedOn: '7 Nov 2026' });
  assert.deepEqual(checkReceipt(ops, m, PLAN, opts, money), []);
  const sum = m.lines.filter((l) => l.kind !== 'missing').reduce((s, l) => s + l.eur, 0);
  assert.ok(Math.abs(sum - m.total) < 0.05, 'the lines add up to the total');
  // A tampered total fails the check.
  const bad = ops.map((o) => (o.fig?.key === 'total' ? { ...o, text: money(o.fig.value + 1), fig: { ...o.fig, value: o.fig.value + 1 } } : o));
  assert.ok(checkReceipt(bad, m, PLAN, opts, money).length > 0);
  // No euro sign in a string and no dash in what the image says.
  for (const o of ops.filter((x) => x.t === 'text')) assert.doesNotMatch(o.text, /[–—]/);
});

test('an unpriceable trip gives no receipt', { skip: have ? false : 'no app_data.json' }, () => {
  assert.equal(receiptModel({ stops: [{ destination_id: 'nope', arrive_date: '2027-01-01', depart_date: '2027-01-02' }] }, { data }), null);
  assert.equal(receiptModel({ stops: [] }, { data }), null);
});

test('the receipt flag is off by default, on with ?receipt=1 and remembered', () => {
  const store = new Map();
  const saved = globalThis.window;
  globalThis.window = {
    location: { search: '' },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  };
  try {
    assert.equal(shareReceiptOn(), false);
    globalThis.window.location.search = '?receipt=1';
    assert.equal(shareReceiptOn(), true);
    assert.equal(store.get(SHARE_RECEIPT_KEY), '1');
    globalThis.window.location.search = '';
    assert.equal(shareReceiptOn(), true, 'remembered');
    globalThis.window.location.search = '?receipt=0';
    assert.equal(shareReceiptOn(), false);
  } finally {
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
});

test('the 100 a day map: the dots drawn are the places counted, by two paths', { skip: have ? false : 'no app_data.json' }, async () => {
  const S = await import('../../scripts/share/share_assets.mjs');
  const geo = JSON.parse(readFileSync(new URL('../public/europe_map.json', import.meta.url), 'utf8'));
  const m = S.mapModel(data, { budget: 100 });
  const exp = S.mapExpected(data, { budget: 100 });
  assert.equal(m.fits, exp.fits);
  assert.equal(m.priced, exp.priced);
  assert.ok(m.fits > 0 && m.fits < m.priced);
  const ops = S.mapOps(m, geo);
  assert.deepEqual(S.checkMap(ops, m, exp), []);
  const text = ops.filter((o) => o.t === 'text').map((o) => o.text).join(' ');
  assert.match(text, /Natural Earth/);
  assert.match(text, /OpenStreetMap contributors/);
  assert.match(text, /GeoNames/);
  // One dot less and the check fails.
  const i = ops.findIndex((o) => o.dot === 'fits');
  assert.ok(S.checkMap(ops.filter((_, j) => j !== i), m, exp).length > 0);
  // A lower budget fits fewer places.
  assert.ok(S.mapModel(data, { budget: 70 }).fits < m.fits);
});

test('the cheapest week calendar: 52 weeks at their own dates, the cheapest marked', { skip: have ? false : 'no app_data.json' }, async () => {
  const S = await import('../../scripts/share/share_assets.mjs');
  assert.equal(S.weeksOf(2027).length, 52);
  assert.equal(S.weeksOf(2027)[0], '2027-01-04');
  const dests = data.destinations;
  S.loadStaysDir(new URL('./fixtures/share/', import.meta.url).pathname);
  const c = S.calendarModel(dests.LIS, dests, { year: 2027 });
  assert.ok(c, 'a fixture curve gives a calendar');
  assert.equal(c.weeks.length, 52);
  assert.equal(c.cheapest.week, Math.min(...c.weeks.map((w) => w.week)));
  assert.ok(c.dearest.week > c.cheapest.week, 'the curve moves the week');
  const ops = S.calendarOps(c);
  assert.deepEqual(S.checkCalendar(ops, c, S.calendarExpected(c, dests.LIS, dests)), []);
  // A place without a measured curve has no calendar (no flat guess).
  const { setStayRecords } = await import('../src/lib/staysData.js');
  setStayRecords({});
  assert.equal(S.calendarModel(dests.LIS, dests, { year: 2027 }), null);
});
