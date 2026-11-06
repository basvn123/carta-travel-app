// T1108 (I9): the Help and contact page is wired, linked, bilingual, and its
// support address is the one config constant.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const keys = (src) => new Set([...src.matchAll(/^\s*["']([\w.]+)["']\s*:/gm)].map((m) => m[1]));

test('the support address is one constant, and the page and footer use it', async () => {
  const { SUPPORT_EMAIL, CONTACT } = await import('../src/lib/contact.js');
  assert.match(SUPPORT_EMAIL, /^[^@\s]+@[^@\s]+\.[a-z]+$/i);
  assert.ok(CONTACT);
  for (const f of ['src/components/SupportPage.jsx', 'src/components/SiteFooter.jsx']) {
    const s = read(f);
    assert.match(s, /SUPPORT_EMAIL/, f);
    assert.doesNotMatch(s, /@carta-europetravel/, `${f} must not hard-code an address`);
  }
});

test('?legal=support opens the page and the footer links to it', () => {
  assert.match(read('src/components/LegalFromUrl.jsx'), /support: SupportPage/);
  assert.match(read('src/components/SiteFooter.jsx'), /\?legal=support/);
});

test('every support key exists in English and Dutch, with the same variables', async () => {
  const page = read('src/components/SupportPage.jsx');
  const en = read('src/i18n/en.js');
  const nl = read('src/i18n/nl.js');
  const enK = keys(en); const nlK = keys(nl);
  const used = new Set([...page.matchAll(/t\('((?:support|footer)\.[\w]+)'/g)].map((m) => m[1]));
  for (const g of page.matchAll(/items: \[([^\]]+)\]/g)) {
    for (const k of g[1].matchAll(/'(\w+)'/g)) { used.add(`support.fq.${k[1]}Q`); used.add(`support.fq.${k[1]}A`); }
  }
  for (const g of page.matchAll(/group: '([\w.]+)'/g)) used.add(g[1]);
  used.add('footer.support');
  assert.ok(used.size > 20);
  const vars = (src, k) => {
    const m = src.match(new RegExp(`^\\s*["']${k.replace(/\./g, '\\.')}["']\\s*:\\s*(["'])(.*)\\1,\\s*$`, 'm'));
    return m ? [...m[2].matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join() : null;
  };
  for (const k of used) {
    assert.ok(enK.has(k), `en missing ${k}`);
    assert.ok(nlK.has(k), `nl missing ${k}`);
    assert.equal(vars(nl, k), vars(en, k), `variables differ for ${k}`);
  }
});

test('support copy has no em dashes and the refund answer matches the Terms cases', () => {
  const en = read('src/i18n/en.js');
  const lines = en.split('\n').filter((l) => l.includes('"support.'));
  assert.ok(lines.length > 20);
  for (const l of lines) assert.doesNotMatch(l, /[–—]/);
  const refund = lines.find((l) => l.includes('support.fq.refundA'));
  assert.match(refund, /14 days/);
  assert.match(refund, /unused share/);
  assert.match(refund, /\{email\}/);
});
