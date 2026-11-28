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
  for (const k of ['mountain', 'unesco', 'food', 'views', 'castles', 'village', 'city', 'family', 'romantic', 'art']) {
    assert.match(src, new RegExp(`theme\\('${k}'\\)`), k);
  }
  // G12 round 2: a theme with a Browse shortcut opens what the shortcut
  // sets, so its See all and the shortcut leave the same chip.
  for (const k of ['oldtown', 'island', 'lake']) {
    assert.match(src, new RegExp(`theme\\('${k}', '${k}', '${k}'\\)`), k);
  }
  assert.match(src, /seeAll: shortcut \? \(\) => applyShortcut\(shortcut\) : \(\) => patchXf\(\{ vibe \}\)/);
  for (const k of ['top', 'hiking', 'gems']) assert.match(src, new RegExp(`seeAll: \\(\\) => applyShortcut\\('${k}'\\)`), k);
  // Before the guided data loads, nothing after Hiking bases shows, so the
  // vibe rails never push the rails below them down under the reader.
  assert.match(src, /guided && !waiting \? list : list\.slice\(0, list\.findIndex\(\(r\) => r\.key === 'hiking'\)\)/);
  // Round 6: the cut holds while the guided rails' lists are pending, and
  // Explore draws its footer only once the rails are complete.
  assert.match(src, /const railsSettled = !railsIdle \|\| \(!!guided && !waiting\)/);
  assert.match(read('src/browse/ExploreTab.jsx'), /\(railsSettled \|\| \(guidedDone && !guided\)\) && <SiteFooter \/>/);
  // Round 6 (lead decision): one card height (two name lines kept), a strip
  // draws the cards near its view and spacers for the rest, focus draws all,
  // and the late swap reaches the rails one per task.
  const rails = read('src/browse/ExploreRails.jsx');
  assert.match(rails, /function useStripReach\(id, total\)/);
  assert.match(rails, /className="hs-rcard xrc-spacer" aria-hidden="true"/);
  assert.match(rails, /sec\.addEventListener\('focusin', all\)/);
  assert.match(rails, /function useRailsInTurn\(rails, full\)/);
  const railCss = read('src/styles/85-explore-rails.css');
  // Round 2 fix: the strip's name lines (1 to 4) set the room, one per strip;
  // Explore clean (2026-11-20): held above the figure, which sits at the foot.
  assert.match(railCss, /\.xrc \.xrc-top \{[^}]*min-height: calc\(max\(var\(--xrc-name-lines, 2\) \* 1\.25 \* var\(--text-lead\) \+ 1px, 24px\)/);
  assert.match(railCss, /\.xrc \.xrc-foot \{[^}]*margin-top: auto;/);
  assert.match(rails, /function useNameLines\(id, names, near\)/);
  assert.match(railCss, /contain-intrinsic-size: auto var\(--xrail-h\);/);
  // A theme rail asks for a Good Score or better, best first, by country.
  assert.match(src, /vibeOf\(guided, p\.id, vibe\) >= 80 && bandAtLeast\(p\.rating, 'good'\)\s+&& !\(vibe === 'oldtown' && castleOnly\(p\)\)\)\.sort\(byRating\)/);
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

test('a rail card: the figure on the name line, the basis after the country, the tile at the end', () => {
  const rails = read('src/browse/ExploreRails.jsx');
  assert.match(rails, /<span className="xrc-head">[\s\S]*<FigureAmount fig=\{fig\} className="xrc-fig" \/>/);
  assert.match(rails, /<span className="xrc-basis" aria-hidden="true">\{fig\.basis\}<\/span>/);
  assert.match(rails, /<SeeAllTile r=\{r\} rest=\{r\.rows\.slice\(CAP\)\}/);
  // The stretched link carries the place's name; no button sits inside it.
  const link = rails.slice(rails.indexOf('<a className="hs-rcard-link"'), rails.indexOf('</a>'));
  assert.match(link, /aria-labelledby=/);
  assert.doesNotMatch(link, /<RowFormation|<button|<Button/);
});

// G12, Explore top round 2 (owner: "the arrows move to the middle of the
// images"): out of the head, onto the photos, mouse and keyboard only, dimmed
// rather than disabled at an end so keyboard focus stays on them. The
// geometry in a browser is scripts/verify_rail_arrows.mjs.
test('rail arrows sit on the photos, before the strip, and dim at the ends', () => {
  const rail = read('src/components/ui/Rail.jsx');
  assert.match(rail, /export const Rail = React\.memo\(function Rail\(/);
  const head = rail.slice(rail.indexOf('<div className="hs-rail-head">'), rail.indexOf('hs-rail-frame'));
  assert.doesNotMatch(head, /RoundButton|hs-rail-arrows/, 'no arrows in the head');
  const frame = rail.slice(rail.indexOf('hs-rail-frame'));
  assert.ok(frame.indexOf('<RoundButton') < frame.indexOf('className="hs-rail"'), 'arrows come before the strip');
  assert.match(rail, /aria-disabled=\{atEnd \|\| undefined\}/);
  assert.doesNotMatch(rail, /disabled=\{pos\./, 'never the disabled attribute');
  const css = read('src/styles/05-house.css');
  assert.doesNotMatch(css, /hs-rail-arrows/);
  assert.match(css, /\.hs-rail-arrow \{ display: none; \}/, 'hidden by default, so never on touch');
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{\s+\.hs-rail-frame \{\s+container-type: inline-size;/);
  assert.match(css, /top: calc\(2px \+ var\(--rail-card-w\) \* 0\.375 - var\(--tap\) \/ 2\);/);
  assert.match(css, /\.hs-rail-frame:has\(:focus-visible\) > \.hs-rail-arrow \{ opacity: 1; \}/);
  assert.match(css, /> \.hs-rail-arrow\[aria-disabled="true"\] \{ opacity: 0\.45; \}/);
});

test('See all keeps its word, wears the disc and is named with its rail', () => {
  const rail = read('src/components/ui/Rail.jsx');
  assert.match(rail, /className="hs-see-all-word"/);
  assert.match(rail, /className="hs-go-disc"/);
  assert.match(rail, /t\('rail\.seeAllNamed', \{ title \}\)/);
});

test('no row of rail chips under the tabs: the shortcuts live in the search (G12 round 2)', () => {
  const tab = read('src/browse/ExploreTab.jsx');
  assert.doesNotMatch(tab, /<TripDock/);
  // decision.md section 4: the phone's shortcut chip row is gone; the
  // desktop overview's quick row went with it (Map is at the tab row's end).
  assert.doesNotMatch(tab, /xsub--rails|xsub-chip|quickRails/);
  assert.match(tab, /\{railsIdle && <OverviewHero t=\{t\} TitleTag=\{TitleTag\} docked \/>\}/);
});

test('signed out, Account and Sign in share one split pill', () => {
  const src = read('src/components/AppHeader.jsx');
  const acc = src.slice(src.indexOf('function AccountLink'), src.indexOf('function TogetherDoor'));
  assert.match(acc, /<span className="acct-split">\s*\{door\}\s*<Button[^>]*signin-pill/);
  const css = read('src/styles/90-together.css');
  // Solid terracotta since the owner's choice of 2026-11-28 (K1 step C).
  assert.match(css, /\.app-header \.acct-split \{[^}]*border: 1px solid var\(--action\);[^}]*background: var\(--action\)/);
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
