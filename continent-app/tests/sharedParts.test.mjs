// T1121 (ROADMAP G2): shared parts that exist once. Each part renders the
// exact markup its call sites wrote out by hand before the fold (the old
// markup is rebuilt here with createElement and compared as HTML), and the
// source guards keep the duplicates from coming back.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

async function load() {
  const [{ default: React }, server, ui, icons, i18n, flag, slot, tpl] = await Promise.all([
    import('react'), import('react-dom/server'),
    vite.ssrLoadModule('/src/components/ui/index.js'), vite.ssrLoadModule('/src/components/Icons.jsx'),
    vite.ssrLoadModule('/src/i18n/index.jsx'), vite.ssrLoadModule('/src/components/CountryFlag.jsx'),
    vite.ssrLoadModule('/src/lib/slot.js'), vite.ssrLoadModule('/src/browse/PageTemplate.jsx'),
  ]);
  return { React, ...server, ...ui, ...icons, ...i18n, ...flag, ...slot, ...tpl };
}

test('Button href: the same <a> the call sites wrote out', async () => {
  const { React, renderToStaticMarkup: html, Button, ExternalIcon, MapPinIcon } = await load();
  const h = React.createElement;
  // DestPractical's stay button, before T1121.
  const old = h('a', { className: 'btn btn-secondary btn-sm stay-btn', href: 'https://x.test/', target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Search' },
    h('span', { className: 'btn-label' }, 'Booking.com'), h(ExternalIcon, { size: 13 }));
  const now = h(Button, { href: 'https://x.test/', external: true, size: 'sm', className: 'stay-btn', 'aria-label': 'Search', iconAfter: h(ExternalIcon, { size: 13 }) }, 'Booking.com');
  assert.equal(html(now), html(old));
  // DayOverview's map link: an icon before the label.
  const old2 = h('a', { className: 'btn btn-secondary btn-sm itin-export-link', href: 'https://maps.test/', target: '_blank', rel: 'noopener noreferrer' },
    h('span', { className: 'btn-icon', 'aria-hidden': 'true' }, h(MapPinIcon, { size: 16 })), h('span', { className: 'btn-label' }, 'Open'));
  assert.equal(html(h(Button, { href: 'https://maps.test/', external: true, size: 'sm', className: 'itin-export-link', iconStart: h(MapPinIcon, { size: 16 }) }, 'Open')), html(old2));
  // An in-app link: no target, no rel.
  const inApp = html(h(Button, { href: '?tab=map', variant: 'primary', className: 'hm-yours-go' }, 'Go'));
  assert.equal(inApp, '<a class="btn btn-primary hm-yours-go" href="?tab=map"><span class="btn-label">Go</span></a>');
  // Without href it is still the button.
  assert.match(html(h(Button, {}, 'Save')), /^<button type="button" class="btn btn-secondary">/);
});

test('PlaceHead: the place page, item page and journey heads, unchanged', async () => {
  const { React, renderToStaticMarkup: html, PlaceHead, PlaceTag, CountryFlag, I18nProvider } = await load();
  const h = React.createElement;
  const wrap = (el) => html(I18nProvider ? h(I18nProvider, {}, el) : el);
  const score = h('span', { className: 'pt-score' }, '8.4');
  // DestinationPage, T1024.
  const oldPlace = h('header', { className: 'pt-head' },
    h('h1', { className: 'pt-title', tabIndex: -1 }, 'Rome'),
    h('div', { className: 'pt-meta' },
      h('span', { className: 'pt-where' }, h(CountryFlag, { country: 'IT', size: 15 }), h('span', null, 'Italy')), score),
    h('ul', { className: 'pt-tags' },
      h('li', { className: 'pt-tag is-rank' }, 'Top of Italy'),
      h('li', { className: 'pt-tag is-unesco', title: 'Historic Centre' }, 'UNESCO')),
    h('p', { className: 'match' }, 'fits'));
  const newPlace = h(PlaceHead, {
    title: 'Rome', where: 'Italy', iso2: 'IT', score,
    tags: [h(PlaceTag, { key: 'c' }, 'Top of Italy'), false, h(PlaceTag, { key: 'u', tone: 'unesco', title: 'Historic Centre' }, 'UNESCO')],
  }, h('p', { className: 'match' }, 'fits'));
  assert.equal(wrap(newPlace), wrap(oldPlace));
  // OutdoorParts, T1039: a subtitle, no flag, no tags.
  const oldItem = h('header', { className: 'pt-head' },
    h('h1', { className: 'pt-title', tabIndex: -1 }, 'Lake'),
    h('p', { className: 'pt-subtitle' }, 'Carinthia'),
    h('div', { className: 'pt-meta' }, h('span', { className: 'pt-where' }, h('span', null, 'Austria'))));
  assert.equal(wrap(h(PlaceHead, { title: 'Lake', sub: 'Carinthia', where: 'Austria', tags: [] })), wrap(oldItem));
  // JourneyPage: "where" as its own line, children after it.
  const oldJourney = h('header', { className: 'pt-head' },
    h('h1', { className: 'pt-title', tabIndex: -1 }, 'Julian Alps'),
    h('p', { className: 'pt-where' }, h(CountryFlag, { country: 'SI', size: 15 }), h('span', null, 'Slovenia')),
    h('div', { className: 'pt-badges' }, 'x'));
  assert.equal(wrap(h(PlaceHead, { title: 'Julian Alps', where: 'Slovenia', iso2: 'SI', whereLine: true }, h('div', { className: 'pt-badges' }, 'x'))), wrap(oldJourney));
});

test('SlotText, MoneyUnit, WayFig: the price lines as they were', async () => {
  const { React, renderToStaticMarkup: html, SlotText, Money, MoneyUnit, WayFig, SLOT, I18nProvider } = await load();
  const h = React.createElement;
  const wrap = (el) => html(I18nProvider ? h(I18nProvider, {}, el) : el);
  const text = `From ${SLOT} a person a day`;
  const old = h(React.Fragment, null, 'From ', h(Money, { value: 42 }), ' a person a day');
  assert.equal(wrap(h(SlotText, { text }, h(Money, { value: 42 }))), wrap(old));
  assert.equal(wrap(h(SlotText, { text: 'No slot here' }, h(Money, { value: 42 }))), 'No slot here');
  const oldUnit = h(React.Fragment, null, h(Money, { value: 87 }), h('span', { className: 'rgnp-unit' }, ' ', 'a day'));
  assert.equal(wrap(h(MoneyUnit, { value: 87, unit: 'a day', unitClassName: 'rgnp-unit' })), wrap(oldUnit));
  assert.equal(html(h(WayFig, { amount: '€40', unit: 'a person' })), '<span class="pt-way-fig"><b>€40</b><small>a person</small></span>');
});

test('CarouselArrows: the arrow pairs the carousels drew by hand', async () => {
  const { React, renderToStaticMarkup: html, CarouselArrows, IconButton, ChevronRightIcon, I18nProvider } = await load();
  const h = React.createElement;
  const wrap = (el) => html(h(I18nProvider, {}, el));
  const step = () => {};
  // PhotoGallery TilePhotos, before T1121: hidden from assistive tech, out of the tab order.
  const oldTile = h(React.Fragment, null,
    h(IconButton, { tone: 'photo', className: 'tphotos-arrow is-prev', label: 'Previous photo', tabIndex: -1, 'aria-hidden': 'true', onClick: step, disabled: true }, h(ChevronRightIcon, { size: 16 })),
    h(IconButton, { tone: 'photo', className: 'tphotos-arrow is-next', label: 'Next photo', tabIndex: -1, 'aria-hidden': 'true', onClick: step, disabled: false }, h(ChevronRightIcon, { size: 16 })));
  assert.equal(wrap(h(CarouselArrows, { className: 'tphotos-arrow', index: 0, count: 3, onStep: step, pointerOnly: true })), wrap(oldTile));
  // Track: plain tone, own labels, aria-controls; the last slide disables "next".
  const oldTrack = h(React.Fragment, null,
    h(IconButton, { tone: 'plain', className: 'itrack-arrow is-prev', label: 'Prev', 'aria-controls': 't1', onClick: step, disabled: false }, h(ChevronRightIcon, { size: 20 })),
    h(IconButton, { tone: 'plain', className: 'itrack-arrow is-next', label: 'Next', 'aria-controls': 't1', onClick: step, disabled: true }, h(ChevronRightIcon, { size: 20 })));
  assert.equal(wrap(h(CarouselArrows, { tone: 'plain', className: 'itrack-arrow', size: 20, index: 2, count: 3, controls: 't1', onStep: step, prevLabel: 'Prev', nextLabel: 'Next' })), wrap(oldTrack));
  // A looping gallery never disables.
  assert.doesNotMatch(wrap(h(CarouselArrows, { className: 'dgal-arrow', onStep: step, prevLabel: 'a', nextLabel: 'b' })), /disabled/);
});

// ── Source guards: one implementation each ─────────────────────────────
const SRC = new URL('../src/', import.meta.url).pathname;
function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.jsx?$/.test(n) ? [p] : [];
  });
}
const ALL = files(SRC).map((p) => ({ p: p.slice(SRC.length), s: readFileSync(p, 'utf8') }));
const hits = (re, except = []) => ALL.filter(({ p, s }) => !except.includes(p) && re.test(s)).map(({ p }) => p);

test('guards: no hand-written button links, place heads, carousel arrows, slot helpers or frr sheets', () => {
  assert.deepEqual(hits(/<a\b[^>]*className="btn\b/), [], 'a link styled as a button goes through <Button href>');
  assert.deepEqual(hits(/className="pt-head"/, ['components/ui/PlaceHead.jsx']), [], 'the place head is <PlaceHead>');
  assert.deepEqual(hits(/-arrow is-(prev|next)/, ['components/ui/CarouselArrows.jsx']), [], 'carousel arrows are <CarouselArrows>');
  assert.deepEqual(hits(/function with(Money|Node)\(/), [], 'a sentence with a node in its slot is <SlotText>');
  assert.deepEqual(hits(/className="frr-scrim"/, ['components/ui/DialogSheet.jsx']), [], 'the frr sheet is <DialogSheet>');
  assert.deepEqual(hits(/className="pt-dock-fig"/, ['browse/PageTemplate.jsx']), [], 'the price dock is <PriceDock>');
  assert.deepEqual(hits(/className="pt-way-fig"/, ['browse/PageTemplate.jsx']), [], 'a way figure is <WayFig>');
});
