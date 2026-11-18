// G12, D10 (explore polish, decision change 3): the list row's figure says
// its unit and the "+" between bed and food shows only when the whole euros
// on screen add up, so the arithmetic a traveller reads is never wrong.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowFigures, rowUnit } from '../src/lib/price/rowFigures.js';

test('the plus shows when the rounded parts make the rounded day', () => {
  const f = rowFigures({ dayEur: 149, stayEur: 116, foodEur: 33 });
  assert.equal(f.plus, true);
  assert.deepEqual([f.day, f.bed, f.food], [149, 116, 33]);
});

test('no plus when rounding would show a wrong sum', () => {
  // 116.4 + 33.4 = 149.8: the wagons read 116 and 33, the figure 150.
  const f = rowFigures({ dayEur: 149.8, stayEur: 116.4, foodEur: 33.4 });
  assert.equal(Math.round(f.bed) + Math.round(f.food), 149);
  assert.equal(Math.round(f.day), 150);
  assert.equal(f.plus, false);
});

test('no plus when a part is missing', () => {
  assert.equal(rowFigures({ dayEur: 80, stayEur: 80 }).plus, false);
  assert.equal(rowFigures(null).day, null);
});

test('the group view is a day for everyone, never the stay total', () => {
  const f = rowFigures({ dayEur: 149, stayEur: 116, foodEur: 33 }, { group: true, seats: 2 });
  assert.deepEqual([f.day, f.bed, f.food, f.seats], [298, 232, 66, 2]);
  assert.equal(f.plus, true);
  // The guard runs on the multiplied amounts too: 2 x 0.4 rounds up.
  const g = rowFigures({ dayEur: 99.8, stayEur: 66.4, foodEur: 33.4 }, { group: true, seats: 2 });
  assert.equal(Math.round(g.bed) + Math.round(g.food), Math.round(g.day));
  assert.equal(g.plus, true);
});

test('the unit is /day or /day for {n}, and no catalogue says total', () => {
  assert.deepEqual(rowUnit(rowFigures({ dayEur: 1 })), ['card.perDay', {}]);
  assert.deepEqual(rowUnit(rowFigures({ dayEur: 1 }, { group: true, seats: 3 })), ['card.perDayGroup', { n: 3 }]);
  const words = { en: 'total', nl: 'totaal', de: 'gesamt', fr: 'total', es: 'total', it: 'totale' };
  for (const [lang, word] of Object.entries(words)) {
    const cat = readFileSync(new URL(`../src/i18n/${lang}.js`, import.meta.url), 'utf8');
    for (const key of ['card.perDay', 'card.perDayGroup', 'card.dayFigSpoken', 'card.dayFigSpokenGroup']) {
      const m = cat.match(new RegExp(`"${key.replace('.', '\\.')}": "([^"]*)"`));
      assert.ok(m, `${lang} ${key}`);
      assert.doesNotMatch(m[1].toLowerCase(), new RegExp(`\\b${word}\\b`), `${lang} ${key}`);
    }
    assert.match(cat, /"card\.perDayGroup": "[^"]*\{n\}"/, lang);
  }
});
