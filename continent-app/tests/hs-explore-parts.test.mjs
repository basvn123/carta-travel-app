// Explore lane of the house style (G1, 2026-11): the parts that keep every
// function while the look changed. The raw "pkind.lake" chip is gone; the
// row, rails, overview and map keep the links, the price items, the units
// for screen readers and the umber chosen pin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('the kind of place chip left with the filter pane (G12), so no raw pkind key can show', () => {
  const src = read('src/browse/explore/useExploreChips.js');
  assert.doesNotMatch(src, /kindLabel|xf\.kinds|label: t\(`pkind\./);
  assert.equal(fs.existsSync(new URL('../src/browse/explore/kindLabel.js', import.meta.url)), false);
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

test('the overview top has no photo under text; Ask and search live in the band', () => {
  const hero = read('src/browse/explore/OverviewHero.jsx');
  assert.doesNotMatch(hero, /xov-photo/);
  // G12 (Explore top): the band in the top bar holds the search and Ask.
  const band = read('src/browse/band/ExploreBand.jsx');
  assert.match(band, /openAskChat\(e\.currentTarget\)/);
  assert.match(band, /role="search"/);
  assert.match(band, /isQuestion\(text\)\) openAskChat/);
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
  // The price row (its figure and wagons are buttons) sits outside the card
  // link: since Explore rails (2026-11-18) as two slots, the figure on the
  // name's line and the parts after the country, both after the link.
  const afterLink = rails.slice(rails.indexOf('</a>'));
  assert.match(afterLink, /<RowFormation cost=\{p\.cost\} t=\{t\} pressable place=\{p\} slot="figure"/);
  assert.match(afterLink, /<RowFormation cost=\{p\.cost\} t=\{t\} pressable place=\{p\} slot="parts"/);
});

test('save wears the bookmark with one fixed name; the ticket is My trips', () => {
  // G12 (explore polish, point 4 and decision change 7).
  const cards = read('src/browse/ExploreCards.jsx');
  assert.match(cards, /<HouseIcon\.bookmark size=\{20\} \/>/);
  assert.doesNotMatch(cards, /HouseIcon\.ticket/);
  assert.match(cards, /t\('explore\.saveNamed', \{ place: name \}\)/);
  assert.doesNotMatch(cards, /unsaveNamed/);
  assert.match(cards, /pressed=\{fav\}/);
  assert.match(cards, /if \(!fav\) bumpTripsOnce\(\)/);
  assert.match(read('src/components/AppHeader.jsx'), /key: 'trips', labelKey: 'nav\.myTrips', Icon: HouseIcon\.ticket/);
  for (const f of ['src/components/AppHeader.jsx', 'src/components/BottomNav.jsx']) assert.match(read(f), /data-nav=\{key\}/, f);
  // G12 round 2: Saved is the applied row's toggle (filters/AppliedRow.jsx).
  const bar = read('src/browse/filters/AppliedRow.jsx');
  assert.match(bar, /iconStart=\{<HouseIcon\.bookmark size=\{16\} \/>\} aria-pressed=\{on\}/);
  const css = read('src/styles/62-v6-explore.css');
  assert.match(css, /\.xsave\[aria-pressed="true"\] \.bm-fill \{ fill: var\(--select-ink\); \}/);
  // The visible word from 1100 px rides inside the same button, so the
  // fixed name stays the accessible name.
  assert.match(cards, /\{word && <span className="xsave-word">\{fav \? t\('detail\.saved'\) : t\('explore\.save'\)\}<\/span>\}/);
  assert.match(read('src/browse/explore/PlaceRow.jsx'), /className="xrow-save" word \/>/);
  assert.match(css, /\.xsave-word \{ display: none; \}/);
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
