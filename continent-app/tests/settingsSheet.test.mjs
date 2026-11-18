// The Settings sheet's pure parts (G12, Explore top): the open store every
// door uses, the range calendar's keys and picks, and the Start lists.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openSettings, closeSettings, toggleSettings, settingsSheetState, stepOf,
} from '../src/browse/settings/settingsSheetStore.js';
import {
  monthWeeks, moveDay, pickDay, rangeState, clampDay, addMonthsDay, weekdayIndex,
} from '../src/browse/settings/calendarModel.js';
import { EUROPE, orderedCountries, searchStart } from '../src/browse/settings/startModel.js';

test('a door opens Settings at its step; an unknown step lands on the overview', () => {
  openSettings({ step: 'when' });
  assert.deepEqual([settingsSheetState().isOpen, settingsSheetState().step], [true, 'when']);
  const n = settingsSheetState().nonce;
  openSettings({ step: 'when' });
  assert.equal(settingsSheetState().nonce, n + 1, 'a second press of the same door still moves the sheet');
  assert.equal(stepOf('nope'), 'overview');
  toggleSettings();
  assert.equal(settingsSheetState().isOpen, false, 'the desktop button closes on a second press');
  toggleSettings({ step: 'prices' });
  assert.equal(settingsSheetState().step, 'prices');
  closeSettings();
  assert.equal(settingsSheetState().isOpen, false);
});

test('a month is weeks of seven, Monday first, blanks outside the month', () => {
  const weeks = monthWeeks('2027-06');
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weekdayIndex('2027-06-01'), 1, '1 June 2027 is a Tuesday');
  assert.deepEqual(weeks[0].slice(0, 2), [null, '2027-06-01']);
  assert.equal(weeks.flat().filter(Boolean).length, 30);
});

test('keys move the focused day as the ARIA date grid does', () => {
  assert.equal(moveDay('2027-06-12', 'ArrowRight'), '2027-06-13');
  assert.equal(moveDay('2027-06-12', 'ArrowUp'), '2027-06-05');
  assert.equal(moveDay('2027-06-12', 'Home'), '2027-06-07', 'Home goes to the Monday');
  assert.equal(moveDay('2027-06-12', 'End'), '2027-06-13', 'End goes to the Sunday');
  assert.equal(moveDay('2027-01-31', 'PageDown'), '2027-02-28', 'a shorter month holds its last day');
  assert.equal(moveDay('2027-06-12', 'PageUp', true), '2026-06-12', 'Shift+Page Up is a year');
  assert.equal(moveDay('2027-06-12', 'Tab'), null);
  assert.equal(addMonthsDay('2027-03-31', -1), '2027-02-28');
  assert.equal(clampDay('2026-01-01', '2026-11-19', '2027-11-18'), '2026-11-19');
});

test('two taps make a range; a tap on or before the leaving day starts again', () => {
  let r = pickDay({}, '2027-06-12');
  assert.deepEqual(r, { start: '2027-06-12', end: '', complete: false });
  assert.deepEqual(pickDay(r, '2027-06-10'), { start: '2027-06-10', end: '', complete: false });
  r = pickDay(r, '2027-06-19');
  assert.deepEqual(r, { start: '2027-06-12', end: '2027-06-19', complete: true });
  assert.equal(pickDay(r, '2027-07-01').complete, false, 'a full range starts over');
  assert.equal(rangeState('2027-06-15', r.start, r.end), 'in');
  assert.equal(rangeState('2027-06-19', r.start, r.end), 'end');
  assert.equal(rangeState('2027-06-20', r.start, r.end), '');
});

test('every country A to Z, the traveller\'s own on top; search finds countries then towns', () => {
  const names = { BE: 'Belgium', AL: 'Albania', NL: 'Netherlands' };
  const rows = orderedCountries((c) => names[c] || c, 'BE');
  assert.equal(rows.length, EUROPE.length);
  assert.equal(rows[0].iso2, 'BE');
  assert.equal(rows[1].iso2, 'AD');
  const towns = [{ id: 'a', name: 'Ghent' }, { id: 'b', name: 'Bruges' }, { id: 'c', name: 'Bergen' }];
  const hit = searchStart('be', rows, towns);
  assert.equal(hit.countries[0].iso2, 'BE');
  assert.deepEqual(hit.towns.map((x) => x.name), ['Bergen']);
  assert.deepEqual(searchStart('  ', rows, towns), { countries: [], towns: [] });
});
