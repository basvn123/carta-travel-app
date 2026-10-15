// T386 (design wave V3, outdoor detail pages): the rules behind the key facts
// band, Before you go, the row previews, the trail's waymark and season facts,
// the cycle route's one bike claim and the tour GPX.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyFactCells, previewNotHook, previewWords } from '../src/lib/detailSkeleton.js';
import { notForLines } from '../src/lib/notFor.js';
import { surfaceLine, needsRoughBike } from '../src/lib/cycleStory.js';
import { trailSeason, trailWaymarked } from '../src/lib/trailCards.js';
import { splitTourByStages, cycleGpx } from '../src/lib/trailExport.js';

const t = (k, p) => (p ? `${k} ${JSON.stringify(p)}` : k);

// T430 (owner, 2026-10-15): a fact with no value is left out, never shown
// as "Not recorded" or a placeholder word; the band no longer pads to four.
test('keyFactCells keeps the page order, caps at six and leaves out a missing fact', () => {
  const facts = [
    { key: 'a', label: 'A', value: '1 km', mono: true },
    { key: 'b', label: 'B', value: '' },
    { key: 'c', label: 'C', value: '2 h', mono: true },
  ];
  const cells = keyFactCells(facts, t);
  assert.deepEqual(cells.map((c) => c.key), ['a', 'c']);
  assert.equal(cells.some((c) => c.missing), false);
  assert.equal(cells[0].mono, true);
  const many = Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, label: `L${i}`, value: String(i) }));
  assert.equal(keyFactCells(many, t).length, 6);
  assert.deepEqual(keyFactCells([{ key: 'x', label: 'X', value: null }], t), []);
});

test('keyFactCells uses a fallback fact only to reach four cells', () => {
  const facts = [
    { key: 'a', label: 'A', value: '1' },
    { key: 'spare', label: 'S', value: 'kept', fallback: true },
    { key: 'b', label: 'B', value: '2' },
    { key: 'c', label: 'C', value: '3' },
  ];
  assert.deepEqual(keyFactCells(facts, t).map((c) => c.key), ['a', 'spare', 'b', 'c']);
  const five = [...facts, { key: 'd', label: 'D', value: '4' }];
  assert.deepEqual(keyFactCells(five, t).map((c) => c.key), ['a', 'b', 'c', 'd']);
});

test('previewNotHook never repeats the hook', () => {
  const hook = 'A long walk along the lake to the old salt mine.';
  assert.equal(previewNotHook([hook, 'Steep at the start, then level.'], hook), previewWords('Steep at the start, then level.'));
  assert.equal(previewNotHook([hook], hook), '');
  assert.equal(previewNotHook(['Something else entirely here'], ''), 'Something else entirely here');
});

test('a not-for line that restates a shown hazard gives way to the next rule', () => {
  const peak = { hazards: ['glacier', 'exposure'], diff: { k: 'alpine' }, lift: null };
  const plain = notForLines('mountain', peak, { word: 'Alpine' }).map((l) => l.key);
  assert.deepEqual(plain, ['notfor.mtnGlacier', 'notfor.mtnExposure']);
  const deduped = notForLines('mountain', peak, { word: 'Alpine', shownHazards: ['glacier', 'exposure'] }).map((l) => l.key);
  assert.ok(!deduped.includes('notfor.mtnGlacier'));
  assert.ok(!deduped.includes('notfor.mtnExposure'));
  assert.deepEqual(deduped, ['notfor.mtnGrade', 'notfor.mtnNoLift']);
  const lake = { hazards: ['cold_shock'], swim: { rule: 'yes' } };
  assert.deepEqual(notForLines('lake', lake, { shownHazards: ['cold_shock'] }).map((l) => l.key), ['notfor.conditions']);
});

test('the surface sentence agrees with the bike the roughest stretch needs (T375-b)', () => {
  const paved = { paved_share: 0.98, surface_known_share: 0.9 };
  assert.equal(surfaceLine({ ...paved, bike: 'touring' }, t), 'cycle.surfaceAllPaved');
  assert.equal(surfaceLine({ ...paved, bike: 'gravel' }, t), 'cycle.surfacePavedRough {"pct":98}');
  assert.equal(surfaceLine({ paved_share: 1, surface_known_share: 1, bike: 'mtb' }, t), 'cycle.surfacePavedRough {"pct":100}');
  assert.equal(needsRoughBike('gravel'), true);
  assert.equal(needsRoughBike('touring'), false);
});

test('the trail waymark and season facts read the wire and claim nothing else', () => {
  assert.equal(trailWaymarked({ f: { way: true } }), true);
  assert.equal(trailWaymarked({ f: {} }), null);
  assert.deepEqual(trailSeason({ f: { se: { from: 'jun', to: 'oct', n: 5, est: true } } }),
    { from: 6, to: 10, allYear: false, est: true });
  assert.equal(trailSeason({ f: { se: { from: 'jan', to: 'dec', n: 12 } } }).allYear, true);
  assert.equal(trailSeason({ f: {} }), null);
});

test('a tour GPX carries one track per day', () => {
  // A straight line of 31 points about 1.1 km apart, cut into three days.
  const coords = Array.from({ length: 31 }, (_, i) => [10 + i * 0.01, 50]);
  const geometry = { type: 'MultiLineString', coordinates: [coords] };
  const lineKm = 30 * 0.715; // about 0.715 km per 0.01 degree of longitude at 50 N
  const end = Math.round(lineKm * 1000);
  const stages = [
    { d: 1, start_m: 0, end_m: Math.round(end / 3) },
    { d: 2, start_m: Math.round(end / 3), end_m: Math.round((2 * end) / 3) },
    { d: 3, start_m: Math.round((2 * end) / 3), end_m: end },
  ];
  const days = splitTourByStages(geometry, stages);
  assert.equal(days.length, 3);
  for (const d of days) assert.ok(d.points.length > 1, `day ${d.stage.d} has a line`);
  // The days join: each starts at or before the point where the last ended.
  assert.ok(days[1].points[0][0] <= days[0].points[days[0].points.length - 1][0]);
  const gpx = cycleGpx({
    name: 'Tour',
    tracks: days.map((d) => ({ name: `Day ${d.stage.d}`, lines: [d.points] })),
    credit: { author: 'OpenStreetMap contributors', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/' },
  });
  assert.equal((gpx.match(/<trk>/g) || []).length, 3);
  assert.match(gpx, /OpenStreetMap contributors/);
  assert.match(gpx, /odbl/);
});
