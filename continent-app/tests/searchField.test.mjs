// G12 (Explore top, decision.md APPROVED 2026-11-18): the search field is the
// band's, "Search a place, region or country", with Ask inside it; the
// phone search dock and its "Choose where to go" pill left, and their words
// with them (retired in tests/home.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];
const value = (lang, key) => {
  const m = read(`src/i18n/${lang}.js`).match(new RegExp(`['"]${key.replace('.', '\\.')}['"]:\\s*(['"])(.*?)\\1,`));
  return m ? m[2] : null;
};

test('the band field names itself; Ask Viantra stands outside it (round 2)', () => {
  const band = read('src/browse/band/ExploreBand.jsx');
  // The long hint only while it fits the field, else the short one, never
  // cut (judgement-5 follow-up); the name stays whole. Judgement-6: a
  // one-word hint when even the short one would be cut. Judgement-7: a
  // phone measures too (Back and Share narrow its field with a filter on),
  // and no hint at all when even the one word would be cut.
  assert.match(band, /placeholder=\{\{ long: longHint, short: shortHint, tiny: tinyHint \}\[hint\] \|\| ''\} aria-label=\{t\('band\.searchPh'\)\}/);
  assert.match(band, /const next = fits\(longHint\) \? 'long' : fits\(shortHint\) \? 'short' : fits\(tinyHint\) \? 'tiny' : 'none';/);
  assert.doesNotMatch(band, /if \(!isDesktop \|\| !el\) return undefined;/);
  // The search button closes the field at its right end; no magnifier on the left.
  assert.match(band, /<Pressable type="submit" className="band-go"/);
  assert.match(band, /type="search"[\s\S]*enterKeyHint="search"/);
  assert.doesNotMatch(band, /band-mag/);
  // Ask leaves the form: after </form>, a popup button lit while open.
  const afterForm = band.slice(band.indexOf('</form>'));
  assert.match(afterForm, /className=\{`band-ask\$\{ask\.open \? ' is-on' : ''\}`\} aria-label=\{t\('dock\.ask'\)\}\s+aria-haspopup="dialog" aria-expanded=\{ask\.open\}/);
  assert.doesNotMatch(band.slice(0, band.indexOf('</form>')), /className=\{?["`]band-ask/);
  assert.equal(fs.existsSync(new URL('../src/components/SearchDock.jsx', import.meta.url)), false);
});

test('the field is a combobox whose aria-controls names the panel listbox', () => {
  const band = read('src/browse/band/ExploreBand.jsx');
  assert.match(band, /aria-controls=\{open \? `\$\{panelId\}-list` : undefined\}/);
  assert.doesNotMatch(band, /className="band-search-panel" id=/, 'the wrapper has no id of its own');
});

test('the band strings, in six languages, the old dock pill strings gone', () => {
  assert.equal(value('en', 'band.searchPh'), 'Search a place, region or country');
  for (const l of LANGS) {
    for (const k of ['band.searchPh', 'band.searchPhShort', 'band.searchPhTiny', 'band.settings', 'band.clear']) assert.ok(value(l, k), `${l} ${k}`);
    for (const k of ['dock.choose', 'dock.openAria', 'explore.chooseOrAsk']) assert.equal(value(l, k), null, `${l} ${k}`);
  }
});
