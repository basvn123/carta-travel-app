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
  assert.match(row, /<\/a>\s*\{onToggleFav && \(\s*<SaveButton/);
  const parts = read('src/browse/explore/HouseParts.jsx');
  assert.match(parts, /<PriceItems cost=\{cost\} way=\{wayOf\(cost\)\}>/);
  assert.match(parts, /className="sr-only"> \{view\.unit\}/);
  assert.match(parts, /view\.request\.excluded\?\.includes\('flight'\)/);
  assert.match(parts, /est=\{isNational\(cost\)\}/);
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
  assert.match(css, /"media why why why"/);
});

test('a note every rail card shares is said once over the rails', () => {
  const rails = read('src/browse/ExploreRails.jsx');
  assert.match(rails, /<ListHead t=\{t\} notes=\{shared\} \/>/);
  assert.match(rails, /unmeasured: own\.unmeasured\.filter\(\(k\) => !shared\.includes\(k\)\)/);
  assert.doesNotMatch(rails, /<PriceNotes row=\{p\.cost\}/);
  // The price row (its day figure is a button) sits outside the card link.
  assert.match(rails, /<\/a>\s*\{\/\*[\s\S]*?\*\/\}\s*<RowFormation cost=\{p\.cost\} t=\{t\} weighted \/>/);
});

test('saving a place commits with a haptic through the house utility', () => {
  const cards = read('src/browse/ExploreCards.jsx');
  assert.match(cards, /import \{ haptic \} from '\.\.\/lib\/haptics\.js';/);
  assert.match(cards, /onToggle\(\); haptic\(fav \? 'tick' : 'confirm'\);/);
  assert.doesNotMatch(cards, /navigator\.vibrate/);
});
