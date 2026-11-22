// Style Studio (G12, decision.md "Doors" and "Removed"): every door that used
// to open its own style editor now opens the one studio, and nothing of the
// old flows is left. Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openStudio, openStudioAt } from '../src/browse/styles/studioDoors.js';
import { studioOpen } from '../src/lib/travelStyles.js';

const SRC = new URL('../src/', import.meta.url);
const read = (p) => readFileSync(new URL(p, SRC), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'i18n') walk(p, out); } else if (/\.(jsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

test('a door opens the studio at its step, or the overview', () => {
  const calls = [];
  const ts = { setOpen: (v) => calls.push(v) };
  openStudioAt(ts, 'spend');
  openStudio(ts);
  openStudioAt(null, 'spend');
  assert.deepEqual(calls, [{ view: 'edit', step: 'spend' }, { view: 'overview' }]);
});

test('a step door edits the active style, starts one with none, lists them with none in use', () => {
  const one = { list: [{ id: 'a', name: 'Us' }], active: 'a' };
  assert.deepEqual(studioOpen({ view: 'edit', step: 'spend' }, one), { view: 'edit', id: 'a', step: 'spend' });
  assert.equal(studioOpen({ view: 'edit', step: 'spend' }, { list: [], active: '' }).view, 'create');
  assert.equal(studioOpen({ view: 'edit', step: 'spend' }, { list: [{ id: 'a', name: 'Us' }], active: '' }).view, 'overview');
});

test('the old style flows are gone', () => {
  for (const f of ['browse/TravelStylesSheet.jsx', 'browse/LifestylePanel.jsx', 'browse/TasteSheet.jsx', 'browse/TasteDoor.jsx', 'components/StyleDoor.jsx']) {
    assert.equal(existsSync(new URL(f, SRC)), false, `${f} is retired`);
  }
  const old = /\b(TravelStylesSheet|LifestylePanel|TasteSheetHost|TasteRow|openTasteSheet|StylePicker|StyleExploreFields|openLifestyle|setLifestyleOpen|TasteLearnPrompt)\b|lifestyle-panel|lifestyle-scrim|style-dock-|\.style-door\b|taste-door/;
  // Comments may name what retired; code and CSS rules may not.
  const hits = walk(SRC.pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    .filter((p) => !p.endsWith('79-travel-styles.css'))
    .filter((p) => readFileSync(p, 'utf8').split('\n').some((l) => old.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)));
  assert.deepEqual(hits, []);
});

test('every former style door leads into the studio', () => {
  assert.match(read('App.jsx'), /openStudioRef\.current\(\{ view: 'edit', step: 'spend' \}\)/, 'bed and food doors open the spend step');
  assert.match(read('components/dock/StyleDock.jsx'), /onActivate=\{\(\) => openStudio\(ts\)\}/);
  assert.match(read('components/price/PriceSheet.jsx'), /openStudio\(ts\) : openSettings/);
  assert.match(read('auth/account/TravelView.jsx'), /onClick=\{\(\) => openStudio\(ts\)\}/);
  assert.match(read('planner/flow/LifestyleStep.jsx'), /openStudioAt\(styles, 'shapes'\)/);
  assert.match(read('browse/StartDialog.jsx'), /setOpen\(\{ view: 'create' \}\)/);
  // First visit: create opens once the studio chunk is here, only while still
  // on Explore, and seen is marked only when it really opens.
  assert.match(
    read('browse/ExploreTab.jsx'),
    /import\('\.\/styles\/StyleStudio\.jsx'\)\.then\(\(\) => \{\s*if \(!live \|\| !hereRef\.current[^\n]*\n\s*markStartSeen\(\);\s*stylesRef\.current\?\.setOpen\(\{ view: 'create' \}\)/,
    'the first-visit door opens the studio create view',
  );
  for (const f of ['planner/flow/setupScreens.jsx', 'planner/flow/TripSettingsSheet.jsx']) {
    assert.match(read(f), /<StyleCards\s+compact/, `${f} picks a style from the studio's cards`);
  }
});

test('My trips wears the ticket', () => {
  assert.match(read('components/HouseIcons.jsx'), /ticket: glyph\('ticket'/);
  assert.doesNotMatch(read('components/HouseIcons.jsx'), /cairn: glyph/);
  assert.match(read('components/AppHeader.jsx'), /key: 'trips', labelKey: 'nav\.myTrips', Icon: HouseIcon\.ticket/);
});
