// K-4 (logic wave 0a, ROADMAP G4): "Plan one day here" on a place opens the
// day planner on the trip's own date, the one the place card prices, when it
// is still to come; otherwise today, as before.
// Run: node --test tests/daySeedDate.test.mjs (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { daySeedDate } from '../src/lib/dates.js';

test('the depart date, else the default start, when today or later', () => {
  assert.equal(daySeedDate('2027-05-10', '2027-01-01', '2026-11-19'), '2027-05-10');
  assert.equal(daySeedDate(null, '2026-12-01', '2026-11-19'), '2026-12-01');
  assert.equal(daySeedDate('2026-11-19', null, '2026-11-19'), '2026-11-19');
});

test('a past date or none opens on today (null)', () => {
  assert.equal(daySeedDate('2026-11-01', '2027-01-01', '2026-11-19'), null);
  assert.equal(daySeedDate(null, null, '2026-11-19'), null);
  assert.equal(daySeedDate('soon', null, '2026-11-19'), null);
});

test('the place page\'s Plan one day here passes the date', () => {
  const overlays = readFileSync(new URL('../src/shell/AppOverlays.jsx', import.meta.url), 'utf8');
  assert.match(overlays, /openDayForDest\(selectedId, daySeedDate\(departDate, defaultDates\?\.start\)\)/);
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const call = app.slice(app.indexOf('<AppOverlays'), app.indexOf('/>', app.indexOf('<AppOverlays')));
  assert.match(call, /defaultDates=\{defaultDates\} departDate=\{departDate\}/);
});
