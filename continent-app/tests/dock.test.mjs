// G12 (explore polish, decision.md "Dock semantics"): the Trip dock and the
// Style dock share one component and one store. One open at a time; a phone
// card is a real modal (aria-modal, focus trap, inert app, scrim), a desktop
// card a non-modal popover that closes on Escape, a press outside and focus
// leaving; reduced motion shows the end state. The browser half (Escape,
// focus, the trap) is scripts/verify_docks.mjs.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('one dock open at a time; close by id; focus is a one-shot', async () => {
  const s = await vite.ssrLoadModule('/src/components/dock/dockStore.js');
  let calls = 0;
  const off = s.subscribeDock(() => { calls += 1; });
  s.openDock('trip');
  assert.deepEqual(s.getDock(), { open: 'trip', focus: null });
  s.openDock('style', { focus: 'food' });
  assert.deepEqual(s.getDock(), { open: 'style', focus: 'food' }, 'opening one closes the other');
  s.closeDock('trip');
  assert.equal(s.getDock().open, 'style', 'closing the closed dock leaves the open one');
  s.clearDockFocus();
  assert.deepEqual(s.getDock(), { open: 'style', focus: null });
  s.toggleDock('style');
  assert.equal(s.getDock().open, null);
  s.openDock('nope');
  assert.equal(s.getDock().open, null, 'only the two docks');
  s.toggleDock('trip');
  s.closeDock();
  assert.equal(s.getDock().open, null, 'closeDock() closes whichever is open');
  off();
  assert.ok(calls >= 5);
});

async function render(desktop, open) {
  const [{ default: React }, server, i18n, dock, store] = await Promise.all([
    import('react'), import('react-dom/server'),
    vite.ssrLoadModule('/src/i18n/index.jsx'),
    vite.ssrLoadModule('/src/components/dock/Dock.jsx'),
    vite.ssrLoadModule('/src/components/dock/dockStore.js'),
  ]);
  const had = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }) };
  try {
    store.closeDock();
    if (open) store.openDock('trip');
    const el = React.createElement(i18n.I18nProvider || React.Fragment, null,
      React.createElement(dock.Dock, { id: 'trip', glyph: 'G', label: 'Trip settings: any time', heading: 'Trip', changed: true },
        React.createElement(dock.DockRowField, { index: 0, rowKey: 'when', label: 'When' }, 'x')));
    return server.renderToStaticMarkup(el);
  } finally {
    store.closeDock();
    if (had === undefined) delete globalThis.window; else globalThis.window = had;
  }
}

test('a phone card is modal, a desktop card is not', async () => {
  const phone = await render(false, true);
  assert.match(phone, /role="dialog" aria-modal="true"/);
  assert.match(phone, /class="dock-card dock-card--under-tabs is-modal is-open"/);
  const desk = await render(true, true);
  assert.match(desk, /role="dialog" aria-modal="false"/);
  assert.doesNotMatch(desk, /is-modal/);
});

test('the trigger names its card and says whether it is open', async () => {
  const closed = await render(true, false);
  assert.match(closed, /aria-haspopup="dialog" aria-expanded="false" aria-controls="[^"]+" aria-label="Trip settings: any time"/);
  assert.match(closed, /inert=""/, 'a closed card is out of the tab order');
  assert.match(closed, /class="dock-dot"/, 'the changed mark');
  const open = await render(true, true);
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /data-dock-row="when"/);
});

test('the dock CSS moves on tokens only and has a reduced-motion end state', () => {
  const css = readFileSync(new URL('../src/styles/89-dock.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.dock-card,\s*\.dock-card\.is-open \{ transform: none; \}/);
  assert.match(css, /transition-delay: calc\(min\(var\(--i, 0\), 8\) \* 24ms \+ 40ms\)/, 'rows arrive 24 ms apart, eight at most');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no hex in the dock');
  for (const m of css.matchAll(/transition:[^;]+;/g)) {
    assert.doesNotMatch(m[0].replace(/0s|calc\([^)]*\)/g, ''), /\d+m?s\b|cubic-bezier/, m[0]);
  }
  // Phone: the card spans the full width of the screen.
  assert.match(css, /\.dock-card\.is-modal \{[^}]*left: 0;[^}]*right: 0;[^}]*width: 100%;/);
});

test('the dock binds Escape, outside press and focus out on desktop, and a trap on a phone', () => {
  const dock = src('components/dock/Dock.jsx');
  assert.match(dock, /useFocusTrap\(cardRef, close, \{ enabled: isOpen && modal/);
  assert.match(dock, /root\?\.setAttribute\('inert', ''\)/);
  assert.match(dock, /if \(e\.key !== 'Escape'\) return;/);
  assert.match(dock, /addEventListener\('pointerdown', onDown, true\)/);
  assert.match(dock, /onBlur=\{onBlur\}/);
});

test('the three new house glyphs exist', () => {
  const icons = src('components/HouseIcons.jsx');
  for (const k of ['tune', 'ret', 'bookmark']) assert.match(icons, new RegExp(`\\n  ${k}: glyph\\('${k}'`));
  assert.match(icons, /className="tune-plane"/);
  assert.match(icons, /className="tune-k1"/);
  assert.match(icons, /className="tune-k2"/);
});

// Steps 3 and 4: what each dock holds and where it sits (decision.md change 1).
test('the Trip dock holds style, from, when and prices only', () => {
  const trip = src('components/dock/TripDock.jsx');
  const rows = [...trip.matchAll(/rowKey="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rows, ['style', 'from', 'when', 'prices']);
  assert.match(trip, /openDock\('style'\)/, 'the Style row hands over');
  assert.doesNotMatch(src('browse/explore/OverviewHero.jsx'), /PriceViewSwitch/, 'how prices read moved into the dock');
  for (const f of ['browse/explore/OverviewHero.jsx', 'browse/explore/ExploreToolbar.jsx', 'browse/ExploreTab.jsx', 'browse/DestinationsTab.jsx']) {
    assert.match(src(f), /<TripDock \/>/, `${f} mounts the Trip dock`);
  }
  assert.doesNotMatch(src('App.jsx'), /<SettingsLine /, 'the header settings line left Explore and Destinations');
});

test('the Style dock replaces the header door and stays off Plan and full pages', () => {
  assert.doesNotMatch(src('components/AppHeader.jsx'), /<StyleDoor/);
  const app = src('App.jsx');
  assert.match(app, /<StyleDock hidden=\{!\(place === 'explore' \|\| place === 'trips'\) \|\| !!selectedDest/);
  assert.match(app, /<TravelStylesSheet /, 'the full sheet stays mounted');
  const dock = src('components/dock/StyleDock.jsx');
  for (const row of ['who', 'stay', 'food', 'way', 'priority']) assert.match(dock, new RegExp(`rowKey="${row}"`));
  assert.match(dock, /StyleExploreFields/, 'the explore half reuses the sheet fields');
  assert.match(dock, /disabled=\{held\}/, 'bed and table wait while a trip holds the style');
  assert.match(src('styles/89-dock.css'), /html\[data-dock="style"\] \.xview-fab/, 'the Map pill steps aside');
});
