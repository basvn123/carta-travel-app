// G12 (decision.md step 9): the phone dock is one field, "Choose where to
// go", with no trip line; applied, Back and Share sit inside it and Filters
// stays outside. The strings are the copy deck's in six languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];
const value = (lang, key) => {
  const m = read(`src/i18n/${lang}.js`).match(new RegExp(`['"]${key.replace('.', '\\.')}['"]:\\s*(['"])(.*?)\\1,`));
  return m ? m[2] : null;
};

test('the empty field says "Choose where to go" and draws no trip line', () => {
  const src = read('src/components/SearchDock.jsx');
  const dock = src.slice(src.indexOf('export function SearchDock'), src.indexOf('function Card('));
  assert.match(dock, /r\?\.label \|\| t\('dock\.choose'\)/);
  assert.doesNotMatch(dock, /sdock-line2|useTripLine\(s\)/);
  assert.match(dock, /className="sdock-mag"/);
});

test('applied: Back and Share inside the field, Filters outside it', () => {
  const src = read('src/components/SearchDock.jsx');
  const box = src.slice(src.indexOf('<div className="sdock-box">'), src.indexOf('{r ? (\n        <IconButton\n          ref={filtersRef}'.replace(/\n/g, src.includes('\r\n') ? '\r\n' : '\n')));
  assert.match(box, /sdock-in sdock-back/);
  assert.match(box, /r\?\.canShare && \(/);
  assert.match(box, /onClick=\{dockShare\}/);
  assert.doesNotMatch(box, /sdock-filters/);
  assert.match(src, /aria-label=\{r \? t\('dock\.openAria', \{ what: title \}\) : title\}/);
});

test('the copy deck strings, in six languages, with no summary left', () => {
  assert.equal(value('en', 'dock.choose'), 'Choose where to go');
  assert.equal(value('de', 'dock.choose'), 'Wähle, wohin es geht');
  assert.equal(value('en', 'explore.chooseOrAsk'), 'Choose where to go, or ask Carta');
  assert.equal(value('en', 'dock.openAria'), 'Where to go: {what}. Change');
  for (const l of LANGS) {
    for (const k of ['dock.choose', 'explore.chooseOrAsk', 'dock.openAria']) assert.ok(value(l, k), `${l} ${k}`);
    assert.doesNotMatch(value(l, 'dock.openAria'), /\{summary\}/);
  }
  assert.match(read('src/browse/explore/OverviewHero.jsx'), /t\('explore\.chooseOrAsk'\)/);
});
