// Integration lane kit parts (house style 2026-11, K items): source pins for
// the new props and rules, so a later edit cannot quietly drop them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('K10: a disabled primary never keeps its umber fill', () => {
  const css = read('src/styles/03-button.css');
  const variants = css.indexOf('.btn-primary {');
  const fix = css.indexOf('.btn-primary:disabled,');
  assert.ok(fix > variants, 'the disabled primary rule comes after the variant');
  assert.match(css.slice(fix, css.indexOf('}', fix)), /background: var\(--surface-sunken\)/);
});

test('K6, K9: ChipGroup and PlateGroup share the roving radio stop', () => {
  const chip = read('src/components/ui/Chip.jsx');
  const plate = read('src/components/ui/Plate.jsx');
  for (const src of [chip, plate]) {
    assert.match(src, /useRovingRadios\(ref\)/);
    assert.match(src, /onKeyDown=\{radioGroupKeyDown\}/);
  }
  const rg = read('src/components/ui/radioGroup.js');
  assert.match(rg, /'Home', 'End'/);
  assert.match(rg, /\|\| items\[0\]/, 'no pick: the first enabled radio is the stop');
  assert.match(read('src/components/ui/index.js'), /PlateGroup/);
  const card = read('src/browse/DestPriceCard.jsx');
  assert.match(card, /<PlateGroup className="tcard-ways"/);
  assert.doesNotMatch(card, /onWayKey/, 'the place card no longer writes its own radio keys');
});

test('K7: DialogSheet plays an exit before onClose', () => {
  const src = read('src/components/ui/DialogSheet.jsx');
  assert.match(src, /hs-dsheet/);
  assert.match(src, /useFocusTrap\(panelRef, close/);
  assert.match(src, /setTimeout\(finish, EXIT_FALLBACK_MS\)/);
  const css = read('src/styles/05-house.css');
  assert.match(css, /\.hs-dsheet\.is-leaving/);
  assert.match(css, /\.hs-dsheet:not\(\.is-leaving\)/, 'reduced motion drops the entrance');
});

test('K3: IconButton takes a haptic after its handler', () => {
  const src = read('src/components/ui/IconButton.jsx');
  assert.match(src, /haptic = null/);
  assert.match(src, /onClick\(e\); buzz\(haptic\)/);
});

test('K11, K12, K16: blank hero, AI tag and Not yet are kit parts', () => {
  assert.match(read('src/components/HeroImage.jsx'), /<WorldTile className=\{`hero-blank/);
  assert.match(read('src/components/AiTag.jsx'), /from '\.\/ui\/AiTag\.jsx'/);
  assert.match(read('src/components/ui/index.js'), /export \{ AiTag \}/);
  assert.doesNotMatch(read('src/styles/03-button.css').match(/\.ai-tag \{[^}]*\}/)[0], /\d+px/);
  assert.match(read('src/styles/45-empty-states.css'), /\.not-yet \{ color: var\(--text-2\); font-weight: 700;/);
});

test('K14: place, journey and outdoor pages share one facts board', () => {
  const place = read('src/styles/88-place-template.css');
  assert.match(place, /\.pt-page \.pt-facts \.dsk-kf-list \{[^}]*border: var\(--stroke-hair\)/);
  assert.doesNotMatch(place, /\.pt-page \.pt-facts \.dsk-kf \{[^}]*--surface-sunken/);
  assert.doesNotMatch(read('src/styles/89-outdoor-page.css'), /\.oxp \.pt-facts \.dsk-kf \{/);
});

test('K5: cost row leaders and the visible space live in the kit', () => {
  assert.match(read('src/styles/04-ui.css'), /\.costrows\.has-leaders \.costrow-text \{ flex: 0 1 auto; \}/);
  assert.doesNotMatch(read('src/styles/88-place-template.css'), /\.tcard-lines \.costrow-text/);
  assert.match(read('src/components/CostCardKit.jsx'), /\{' '\}\s*<span className="ccard-fig">/);
});

test('K13: the relief cut blaze is not pulled into its own clip', () => {
  const css = read('src/styles/05-house.css');
  assert.doesNotMatch(css, /\.relief-cut-blaze \{[^}]*translate: -50% 0/);
  assert.match(read('src/styles/62-home-story.css'), /\.hm-cost-head \.relief-cut \{ background: var\(--umber-200\); \}/);
});

test('K1: ScorePlate takes a rating; Explore PlaceScore is that plate', () => {
  const plate = read('src/components/ui/Plate.jsx');
  assert.match(plate, /export function ScorePlate\(\{ value, rating,/);
  assert.match(plate, /rating\?\.unscored\) return <NotYet/);
  assert.match(plate, /ratingWords\(rating, t\)/);
  assert.match(plate, /is-est/);
  const parts = read('src/browse/explore/HouseParts.jsx');
  assert.match(parts, /return <ScorePlate rating=\{rating\}/);
});

test('K2: Formation has est, dayWrap, figure={false}, around and extras', () => {
  const f = read('src/components/ui/Formation.jsx');
  for (const prop of ['around', 'extras', 'est', 'dayWrap', 'figure = true']) assert.ok(f.includes(prop), prop);
  assert.match(f, /\{figure !== false && \(/);
  assert.match(f, /dayWrap \? dayWrap\(dayFig\) : dayFig/);
  assert.match(f, /money\.estSpoken/);
  const css = read('src/styles/05-house.css');
  assert.match(css, /\.hs-wagon\.is-fly \{/);
  assert.match(css, /\.hs-wagon\.is-around \{/);
  // The place cost post drops its day slot through the prop, not a CSS hide.
  assert.match(read('src/browse/DestPriceCard.jsx'), /<Formation className="tcard-split" weighted figure=\{false\}/);
  assert.doesNotMatch(read('src/styles/88-place-template.css'), /\.tcard-split \.hs-formation-day/);
});

test('K4, B8: RailCard renders its price row and slots after the link; static without href', () => {
  const rail = read('src/components/ui/Rail.jsx');
  const close = rail.indexOf('</Hit>');
  assert.ok(close > 0 && rail.indexOf('{formation}') > close, 'the formation sits after the link');
  for (const slot of ['{body}', '{foot &&', '{mark &&']) assert.ok(rail.indexOf(slot) > close, slot);
  assert.match(rail, /const Hit = linked \? 'a' : 'div'/);
});

test('K17: the unread home tokens are gone', () => {
  const tokens = read('src/styles/01-tokens.css');
  for (const tok of ['--text-amount', '--text-feature', '--home-ground-mist', '--home-ground-lake', '--home-ground-clay', '--home-ground-sea', '--dur-draw', '--dur-advance']) {
    assert.ok(!tokens.includes(`${tok}:`), tok);
  }
  assert.match(tokens, /--home-ground-deep:/);
});
