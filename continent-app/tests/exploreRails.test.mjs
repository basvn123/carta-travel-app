// Explore rails (owner 2026-11-18, G12): more rails, every rail drawn, fresh
// leads down the page, See all as a word with its disc and as the strip's
// last tile, the card's figure on the name line, the guest's split pill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spreadLeads, LEAD_CARDS } from '../src/browse/explore/railLeads.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rows = (...ids) => ids.map((id) => ({ id }));

test('spreadLeads moves a place an earlier rail led with behind the fresh ones', () => {
  const out = spreadLeads([
    { key: 'top', rows: rows('rome', 'bruges', 'porto', 'riga', 'oslo') },
    { key: 'oldtown', rows: rows('rome', 'krumlov', 'bruges', 'annecy', 'siena', 'riga') },
  ]);
  assert.deepEqual(out[0].rows.map((p) => p.id), ['rome', 'bruges', 'porto', 'riga', 'oslo']);
  // rome, bruges and riga led Top rated: they move back, in their own order.
  assert.deepEqual(out[1].rows.map((p) => p.id), ['krumlov', 'annecy', 'siena', 'rome', 'bruges', 'riga']);
});

test('spreadLeads keeps every place and never touches saved or short rails', () => {
  const saved = { key: 'saved', rows: rows('rome', 'a', 'b', 'c') };
  const short = { key: 'lake', rows: rows('rome', 'x') };
  const rails = [{ key: 'top', rows: rows('rome', 'a', 'b', 'c', 'd') }, saved, short,
    { key: 'art', rows: rows('a', 'e', 'f', 'g', 'h') }];
  const out = spreadLeads(rails);
  assert.equal(out[1], saved);
  assert.equal(out[2], short);
  for (const [i, r] of out.entries()) {
    assert.deepEqual([...r.rows.map((p) => p.id)].sort(), [...rails[i].rows.map((p) => p.id)].sort());
  }
  assert.equal(LEAD_CARDS, 4);
});

test('every rail with four places is a strip; the theme rails use the vibe filter', () => {
  const src = read('src/browse/explore/useExploreRails.js');
  assert.match(src, /const railLead = Infinity;/);
  for (const k of ['oldtown', 'island', 'mountain', 'unesco', 'lake', 'food', 'views', 'castles', 'village', 'city', 'family', 'romantic', 'art']) {
    assert.match(src, new RegExp(`theme\\('${k}'\\)`), k);
  }
  assert.match(src, /seeAll: \(\) => patchXf\(\{ vibe \}\)/);
  // Before the guided data loads, nothing after Hiking bases shows, so the
  // vibe rails never push the rails below them down under the reader.
  assert.match(src, /guided \? list : list\.slice\(0, list\.findIndex\(\(r\) => r\.key === 'hiking'\)\)/);
  // A theme rail asks for a Good Score or better, best first, by country.
  assert.match(src, /vibeOf\(guided, p\.id, vibe\) >= 80 && bandAtLeast\(p\.rating, 'good'\)\)\.sort\(byRating\)/);
});

test('the new rail titles and the named See all exist in all six languages', () => {
  const keys = ['rail.oldtown', 'rail.island', 'rail.mountain', 'rail.unesco', 'rail.lake', 'rail.food', 'rail.views',
    'rail.castles', 'rail.village', 'rail.city', 'rail.family', 'rail.romantic', 'rail.art', 'rail.seeAllNamed'];
  for (const lang of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
    const cat = read(`src/i18n/${lang}.js`);
    for (const k of keys) assert.match(cat, new RegExp(`"${k.replace('.', '\\.')}": "[^"]+"`), `${lang} ${k}`);
    assert.match(cat, /"rail\.seeAllNamed": "[^"]*\{title\}/, `${lang} placeholder`);
  }
});

test('a rail card: the figure on the name line, the parts after the country, the tile at the end', () => {
  const rails = read('src/browse/ExploreRails.jsx');
  assert.match(rails, /<div className="xrc-head">[\s\S]*slot="figure"/);
  assert.match(rails, /slot="parts"/);
  assert.match(rails, /<SeeAllTile r=\{r\} rest=\{r\.rows\.slice\(CAP\)\}/);
  // The stretched link carries the place's name; no button sits inside it.
  const link = rails.slice(rails.indexOf('<a className="hs-rcard-link"'), rails.indexOf('</a>'));
  assert.match(link, /aria-labelledby=/);
  assert.doesNotMatch(link, /<RowFormation|<button|<Button/);
  const parts = read('src/browse/explore/HouseParts.jsx');
  assert.match(parts, /slot === 'parts' && go/);
});

test('See all keeps its word, wears the disc and is named with its rail', () => {
  const rail = read('src/components/ui/Rail.jsx');
  assert.match(rail, /className="hs-see-all-word"/);
  assert.match(rail, /className="hs-go-disc"/);
  assert.match(rail, /t\('rail\.seeAllNamed', \{ title \}\)/);
});

test('the phone row under the tabs: rail chips only (G12: the Trip dock left Explore)', () => {
  const tab = read('src/browse/ExploreTab.jsx');
  assert.doesNotMatch(tab, /<TripDock/);
  const at = tab.indexOf('<div className="xsub xsub--rails">');
  const row = tab.slice(at, tab.indexOf('))}', at));
  assert.match(row, /<div className="xsub-chips" role="group" aria-label=\{t\('explore\.quickAria'\)\}>/);
  // Every drawn rail but the first (its heading is right below) is a chip
  // that opens what its See all opens.
  assert.match(row, /rail\.rows\.length >= 4 && rail\.key !== 'saved'\)\.slice\(1\)/);
  assert.match(row, /onClick=\{rail\.seeAll\}/);
  const css = read('src/styles/85-explore-rails.css');
  assert.match(css, /\.xsub-chips \{[^}]*overflow-x: auto;[^}]*mask-image: linear-gradient\(to right, var\(--text\)/);
  assert.match(css, /\.xsub--rails \.btn\.xsub-chip::after,\s*\.xsub--rails \.btn\.dock-trigger::after \{ content: ""; position: absolute; inset: -2px 0; \}/);
});

test('signed out, Account and Sign in share one split pill', () => {
  const src = read('src/components/AppHeader.jsx');
  const acc = src.slice(src.indexOf('function AccountLink'), src.indexOf('function TogetherDoor'));
  assert.match(acc, /<span className="acct-split">\s*\{door\}\s*<Button[^>]*signin-pill/);
  const css = read('src/styles/90-together.css');
  assert.match(css, /\.app-header \.acct-split \{[^}]*border: 1px solid var\(--edge\)/);
});

test('one spacing rule for Explore: T983 no longer squeezes the rails', () => {
  assert.doesNotMatch(read('src/styles/80-story-rail.css'), /\.xrails\.xrails \{ gap: var\(--space-4\); \}/);
  const css = read('src/styles/85-explore-rails.css');
  // Rail to rail 24 on a phone and 32 from 1024 (owner 2026-11-18, was
  // 40 / 56), still twice the title's own 12 / 16.
  assert.match(css, /\.explore-shell \.xrails\.xrails \{\s*gap: var\(--space-5\);/);
  assert.match(css, /\.explore-shell \.xrails\.xrails \{ gap: var\(--space-6\);/);
  assert.match(css, /\.explore-shell \.xrails-rail \.hs-rail-head \{ margin-bottom: var\(--space-3\); \}/);
  assert.match(css, /\.explore-shell \.xrails-rail \.hs-rail-head \{ margin-bottom: var\(--space-4\); \}/);
  // The desktop strip grows its cards (max, not minmax, in an overflowing strip).
  assert.match(read('src/styles/05-house.css'), /grid-auto-columns: max\(256px,/);
});
