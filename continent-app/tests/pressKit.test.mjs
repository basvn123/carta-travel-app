// T1131 (K10): the press kit page is wired, linked from the support page,
// bilingual, uses the support address constant, shows real counts, and the
// journalist template carries no personal details.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const keys = (src) => new Set([...src.matchAll(/^\s*["']([\w.]+)["']\s*:/gm)].map((m) => m[1]));

test('?legal=press opens the page and the support page links to it', () => {
  assert.match(read('src/components/LegalFromUrl.jsx'), /press: PressKitPage/);
  assert.match(read('src/components/SupportPage.jsx'), /\?legal=press/);
});

test('the page uses the support address constant, not a literal address', () => {
  const s = read('src/components/PressKitPage.jsx');
  assert.match(s, /SUPPORT_EMAIL/);
  assert.doesNotMatch(s, /@carta-europetravel/);
});

test('every press key exists in English and Dutch, copy has no em dashes', () => {
  const page = read('src/components/PressKitPage.jsx');
  const en = read('src/i18n/en.js'); const nl = read('src/i18n/nl.js');
  const used = new Set([...page.matchAll(/t\('(press\.[\w.]+)'/g)].map((m) => m[1]));
  for (const [, k] of page.matchAll(/t\(`(press\.fact)\.\$\{k\}`\)/g)) {
    for (const f of ['destinations', 'countries', 'airports', 'trips', 'languages']) used.add(`${k}.${f}`);
  }
  used.add('support.pressLink');
  assert.ok(used.size > 20);
  const enK = keys(en); const nlK = keys(nl);
  for (const k of used) { assert.ok(enK.has(k), `en ${k}`); assert.ok(nlK.has(k), `nl ${k}`); }
  for (const l of en.split('\n').filter((x) => x.includes('"press.'))) assert.doesNotMatch(l, /[–—]/);
});

test('key facts are real, positive counts', () => {
  const f = JSON.parse(read('src/data/pressFacts.json'));
  for (const k of ['destinations', 'countries', 'airports', 'trips', 'languages']) assert.ok(f[k] > 0, k);
  assert.match(f.measuredAt, /^\d{4}-\d{2}-\d{2}$/);
});

test('the founder line is a placeholder and the images are own files', async () => {
  const p = await import('../src/lib/press.js');
  assert.equal(p.PRESS_FOUNDER_LINE, '');
  for (const img of [p.PRESS_LOGO, p.PRESS_SCREENSHOT]) assert.ok(fs.existsSync(new URL(`../public${img}`, import.meta.url)), img);
});

test('journalist template: columns, selection rule, no personal details', () => {
  const csv = fs.readFileSync(new URL('../../docs/marketing/journalist-list-template.csv', import.meta.url), 'utf8');
  const head = csv.split('\n')[0];
  assert.equal(head, 'outlet,desk,country,why_they_would_care,beat,owner_fills_name,owner_fills_contact,status,notes');
  assert.doesNotMatch(csv, /[\w.+-]+@[\w-]+\.[a-z]+/i);
  assert.ok(csv.split('\n').filter(Boolean).length >= 10);
});
