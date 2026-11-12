// T1213: the data access ladder config and its flags (ROADMAP I16).
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LADDER_FLAGS, ladderOn } from '../workers/shared/ladder.mjs';
import { sweepMinute } from '../workers/flight-sweep/src/index.mjs';

const cfg = JSON.parse(readFileSync(new URL('../config/access-ladder.json', import.meta.url), 'utf8'));

test('every source has a route, an unlock and a flag named in the helper', () => {
  const names = new Set(Object.values(LADDER_FLAGS));
  assert.equal(cfg.sources.length, 5);
  for (const s of cfg.sources) {
    assert.ok(s.today && s.route && s.unlock?.metric, s.id);
    assert.ok(cfg.metrics[s.unlock.metric], `${s.id}: metric listed`);
    assert.ok(names.has(s.flag.env), `${s.id}: flag known`);
  }
  assert.equal(names.size, cfg.sources.length);
});

test('terms check date and the 50,000 users threshold are on record', () => {
  assert.match(cfg.terms_checked, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(cfg.sources.find((s) => s.id === 'flights_live_search').unlock.threshold, 50000);
});

test('all flags are off by default and only "1" turns one on', () => {
  for (const k of Object.keys(LADDER_FLAGS)) {
    assert.equal(ladderOn({}, k), false);
    assert.equal(ladderOn(undefined, k), false);
    assert.equal(ladderOn({ [LADDER_FLAGS[k]]: 'true' }, k), false);
    assert.equal(ladderOn({ [LADDER_FLAGS[k]]: '1' }, k), true);
  }
  assert.equal(ladderOn({}, 'nope'), false);
});

test('the box late sweep honours the same Google Flights stop switch (T1213-d)', async () => {
  // run.mjs starts its loop on import, so the guard is checked in the source:
  // it must sit before the first search, the fill and the cycle alike.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../workers/late-sweep/run.mjs', import.meta.url), 'utf8');
  const guard = src.indexOf("ladderOn(process.env, 'stopGoogleFlights')");
  assert.ok(guard > 0, 'late-sweep checks LADDER_STOP_GOOGLE_FLIGHTS');
  assert.ok(guard < src.indexOf("if (process.argv.includes('--fill')) return fill();"), 'before the fill');
  assert.ok(guard < src.indexOf('const s = readState();'), 'before the cycle');
});

test('the sweep stops when the Google Flights flag is on, before touching the database', async () => {
  const env = { LADDER_STOP_GOOGLE_FLIGHTS: '1' };
  assert.deepEqual(await sweepMinute(env, Date.now()), { stopped: true });
});
