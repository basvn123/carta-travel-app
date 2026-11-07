import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNNEL_STEPS, stepOfTab, trackFunnel, funnelWeeksView } from '../src/lib/funnelCounts.js';

test('tabs map to funnel steps', () => {
  assert.equal(stepOfTab('map'), 'explore_opened');
  assert.equal(stepOfTab('places'), 'explore_opened');
  assert.equal(stepOfTab('planstart'), 'plan_started');
  assert.equal(stepOfTab('account'), null);
});

test('trackFunnel never throws, ignores unknown steps and null', () => {
  trackFunnel(null);
  trackFunnel('nonsense');
  trackFunnel('shared');
  assert.equal(FUNNEL_STEPS.length, 6);
});

test('admin view: all six steps in order, shares against the first, weeks newest first', () => {
  const v = funnelWeeksView({ weeks: [
    { week: '2026-10-26', steps: [{ step: 'explore_opened', n: 1 }] },
    { week: '2026-11-02', steps: [{ step: 'trip_saved', n: 2 }, { step: 'explore_opened', n: 8 }, { step: 'place_opened', n: 4 }] },
  ] });
  assert.equal(v.current.week, '2026-11-02');
  assert.deepEqual(v.current.steps.map((s) => s.step), FUNNEL_STEPS);
  assert.equal(v.current.steps[1].share, 0.5);
  assert.equal(v.current.steps[5].n, 0);
  assert.equal(funnelWeeksView({ error: 'forbidden' }), null);
  assert.equal(funnelWeeksView({ weeks: [{ week: 'w', steps: [] }] }).current.steps[0].share, null);
});
