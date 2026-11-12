// N6 (T1043): scripts/flight-sweep.mjs, the night refusal check. Pure parts
// only; nothing here reaches D1 or Cloudflare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightsSql, formatNights, NIGHT_FROM, NIGHT_TO } from '../../scripts/flight-sweep.mjs';

test('the night window is the T1043 half-speed window, 22:00 to 05:00 UTC', () => {
  assert.equal(NIGHT_FROM, 22);
  assert.equal(NIGHT_TO, 5);
  const sql = nightsSql('2026-11-05');
  assert.match(sql, />= 22 OR .* < 5 THEN 'night'/);
  assert.match(sql, new RegExp(`minute >= ${Date.parse('2026-11-05T00:00:00Z') / 60000}\\b`));
});

test('a bad --since is refused before any query', () => {
  assert.throws(() => nightsSql('5 nov'), /YYYY-MM-DD/);
  assert.throws(() => nightsSql("2026-11-05'; DROP TABLE runs; --"), /YYYY-MM-DD/);
});

test('the summary counts clean nights', () => {
  const lines = formatNights([
    { d: '2026-11-10', part: 'day', minutes: 964, jobs: 16395, per_min: 17, blocked: 0 },
    { d: '2026-11-10', part: 'night', minutes: 62, jobs: 391, per_min: 6.3, blocked: 2 },
    { d: '2026-11-11', part: 'night', minutes: 420, jobs: 2900, per_min: 6.9, blocked: 0 },
  ]);
  assert.equal(lines.at(-1), '1 of 2 night(s) clean (no refusal)');
  assert.equal(lines.length, 5);
});
