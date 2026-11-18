// Explore lane of the house style (G1, 2026-11): the parts that keep every
// function while the look changed. The raw "pkind.lake" chip is gone; the
// row, rails, overview and map keep the links, the price items, the units
// for screen readers and the umber chosen pin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kindLabel } from '../src/browse/explore/kindLabel.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const EN = {
  'pkind.village': 'Village',
  'places.catLakes': 'Lakes',
};
const t = (k) => EN[k] ?? k;

test('a size word from the link never shows a raw key', () => {
  assert.equal(kindLabel('village', t), 'Village');
  assert.equal(kindLabel('lake', t), 'Lakes');
  assert.equal(kindLabel('harbour', t), 'Harbour');
  for (const k of ['lake', 'harbour', 'beach', '']) assert.ok(!kindLabel(k, t).startsWith('pkind.'));
});

test('the chips read the size words through kindLabel', () => {
  const src = read('src/browse/explore/useExploreChips.js');
  assert.match(src, /label: kindLabel\(k, t\)/);
  assert.doesNotMatch(src, /label: t\(`pkind\./);
});

test('the row keeps its link, its price items and the save outside the link', () => {
  const row = read('src/browse/explore/PlaceRow.jsx');
  assert.match(row, /className="xrow-hit"/);
  assert.match(row, /href=\{`#dest=\$\{encodeURIComponent\(p\.id\)\}`\}/);
  // G12, D10: the formation (buttons) left the link, then the save.
  assert.match(row, /<\/a>\s*\{\/\*[\s\S]*?\*\/\}\s*<RowFormation cost=\{p\.cost\} t=\{t\} figRef=\{figRef\} pressable place=\{p\} \/>\s*\{onToggleFav && \(\s*<SaveButton/);
  const parts = read('src/browse/explore/HouseParts.jsx');
  // My trips and the home story keep the plain formation.
  assert.match(parts, /<PriceItems cost=\{cost\} way=\{wayOf\(cost\)\}>/);
  assert.match(parts, /className="sr-only"> \{view\.unit\}/);
  assert.match(parts, /view\.request\.excluded\?\.includes\('flight'\)/);
  assert.match(parts, /est=\{isNational\(cost\)\}/);
  // The list formation: the unit on the figure, every part a dialog button.
  assert.match(parts, /className="xform-unit" aria-hidden="true">\{t\(unitKey, unitArgs\)\}/);
  assert.match(parts, /t\(g \? 'card\.dayFigSpokenGroup' : 'card\.dayFigSpoken'/);
  assert.match(parts, /bed && food && fig\.plus && <span className="xform-plus" aria-hidden="true">\+<\/span>/);
  assert.match(parts, /<HouseIcon\.ret size=\{12\}/);
  assert.match(read('src/components/PriceItems.jsx'), /aria-haspopup="dialog"/);
  assert.match(read('src/auth/mytrips/SavedTab.jsx'), /<RowFormation cost=\{cost\} t=\{t\} figRef=\{ref\} \/>/);
});

test('the row is the grid: the formation and the save sit in its areas, beside the link subgrid', () => {
  const css = read('src/styles/62-v6-explore.css');
  assert.match(css, /\.xrow-hs > \.xrow-hit \{[^}]*grid-template-columns: subgrid;/);
  assert.match(css, /\.xrow-hs > \.xform \{ display: contents; \}/);
  assert.match(css, /\.xrow-hs > \.xrow-save \{ grid-area: save;/);
  // Every row template (Explore, map column, Ask) names the save column.
  for (const f of ['62-v6-explore.css', '75-ask.css']) {
    const areas = read(`src/styles/${f}`).match(/grid-template-areas:[^;]*;/g).filter((a) => a.includes('media'));
    for (const a of areas) for (const line of a.match(/"[^"]+"/g)) assert.match(line, /save"$/, `${f}: ${line}`);
  }
  assert.doesNotMatch(css, /\.xrow-hs \.xrow-hit \{\s*grid-template/);
});

test('the list, the map column and the drawer draw the same row', () => {
  assert.match(read('src/browse/explore/ExploreCard.jsx'), /<PlaceRow/);
  assert.match(read('src/browse/MapPlacePanel.jsx'), /<PlaceRow key=\{p\.id\}/);
});

test('rails are the house rail and keep See all and the arrows', () => {
  const rails = read('src/browse/ExploreRails.jsx');
  assert.match(rails, /<HouseRail id=\{`xrail-\$\{r\.key\}`\}/);
  assert.match(rails, /onSeeAll=\{r\.seeAll\}/);
  assert.match(rails, /className="hs-rcard-link"/);
});

test('the overview top has no photo under text and keeps Ask and search', () => {
  const hero = read('src/browse/explore/OverviewHero.jsx');
  assert.doesNotMatch(hero, /xov-photo/);
  assert.match(hero, /openAskChat\(e\.currentTarget\)/);
  assert.match(hero, /role="search"/);
  assert.match(hero, /isQuestion\(q\)\) openAskChat/);
});

test('the chosen pin is the umber mark and nothing overshoots', () => {
  const css = read('src/styles/81-map-panel.css');
  assert.match(css, /\.xmap-kpin\.is-label\.is-picked \{[^}]*background: var\(--action\)/);
  assert.match(css, /animation: xpin-settle var\(--dur-settle\) var\(--ease-settle\)/);
});

test('a row shows the region with the country, the country never shrinks', () => {
  const row = read('src/browse/explore/PlaceRow.jsx');
  assert.match(row, /className="xrow-region"/);
  assert.match(row, /className="xrow-ctry"/);
  assert.doesNotMatch(row, /xrow-where-short/);
  const css = read('src/styles/62-v6-explore.css');
  assert.match(css, /\.xrow-hs \.xrow-ctry \{ flex: none; \}/);
});

test('the reason stays in the map column and in tablet lists', () => {
  const css = read('src/styles/62-v6-explore.css');
  assert.match(css, /\.mpp-rows \.xrow-hs \.xrow-hit \.xrow-why \{ display: block;/);
  assert.match(css, /"media why why why save"/);
});

test('the rails carry no head or note line; each figure says its unit', () => {
  // G12, D10 (owner, 2026-11-17): the head and the note lines went.
  const rails = read('src/browse/ExploreRails.jsx');
  assert.doesNotMatch(rails, /<ListHead\b/);
  assert.doesNotMatch(rails, /<PriceNotes\b/);
  // The price row (its figure and wagons are buttons) sits outside the card link.
  assert.match(rails, /<\/a>\s*\{\/\*[\s\S]*?\*\/\}\s*<RowFormation cost=\{p\.cost\} t=\{t\} weighted pressable place=\{p\} \/>/);
});

test('save wears the bookmark with one fixed name; the cairn stays My trips', () => {
  // G12 (explore polish, point 4 and decision change 7).
  const cards = read('src/browse/ExploreCards.jsx');
  assert.match(cards, /<HouseIcon\.bookmark size=\{20\} \/>/);
  assert.doesNotMatch(cards, /HouseIcon\.cairn/);
  assert.match(cards, /t\('explore\.saveNamed', \{ place: name \}\)/);
  assert.doesNotMatch(cards, /unsaveNamed/);
  assert.match(cards, /pressed=\{fav\}/);
  assert.match(cards, /if \(!fav\) bumpTripsOnce\(\)/);
  assert.match(read('src/components/AppHeader.jsx'), /key: 'trips', labelKey: 'nav\.myTrips', Icon: HouseIcon\.cairn/);
  for (const f of ['src/components/AppHeader.jsx', 'src/components/BottomNav.jsx']) assert.match(read(f), /data-nav=\{key\}/, f);
  const bar = read('src/browse/explore/ExploreToolbar.jsx');
  assert.match(bar, /iconStart=\{<HouseIcon\.bookmark size=\{18\} \/>\} aria-pressed=\{showFavOnly\}/);
  const css = read('src/styles/62-v6-explore.css');
  assert.match(css, /\.xsave\[aria-pressed="true"\] \.bm-fill \{ fill: var\(--select-ink\); \}/);
  assert.match(css, /animation: xsave-tick 240ms/);
  assert.match(css, /animation: xsave-ring 240ms/);
  // No star left in the save copy, in any language.
  for (const lang of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
    const cat = read(`src/i18n/${lang}.js`);
    for (const key of ['results.emptyFav', 'fav.shortlistEmpty', 'fav.snapped']) {
      const line = cat.split(/\r?\n/).find((l) => l.includes(`"${key}"`) || l.includes(`'${key}'`));
      assert.ok(line, `${lang} ${key}`);
      assert.doesNotMatch(line, /\b(star|starred|ster|Stern|étoile|estrella|stella)\b/i, `${lang} ${key}`);
    }
  }
});

test('saving a place commits with a haptic through the house utility', () => {
  const cards = read('src/browse/ExploreCards.jsx');
  assert.match(cards, /import \{ haptic \} from '\.\.\/lib\/haptics\.js';/);
  assert.match(cards, /onToggle\(\); haptic\(fav \? 'tick' : 'confirm'\);/);
  assert.doesNotMatch(cards, /navigator\.vibrate/);
});
