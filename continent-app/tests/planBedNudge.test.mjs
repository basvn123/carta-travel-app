// T943: the bed price stored at planning and My trips' price nudge against
// it, lib/myTrips.js planBedOf and planBedNudge. Run: npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBedOf, planBedNudge, deviceTripAsPlan } from '../src/lib/myTrips.js';

const stop = (id, planBed, extra = {}) => ({ destination_id: id, arrive_date: '2026-11-20', depart_date: '2026-11-23', choices: { ...(planBed ? { planBed } : {}), ...extra } });

test('a save keeps the bed a person a night the planner priced, never a typed stay', () => {
  assert.deepEqual(planBedOf({ accom: { per_night: 61.234 } }, '2026-10-31'), { night: 61.23, at: '2026-10-31' });
  assert.equal(planBedOf({ accom: { per_night: 61 }, ownAccom: true }, '2026-10-31'), null);
  assert.equal(planBedOf({ accom: null }, '2026-10-31'), null);
  assert.equal(planBedOf(null, '2026-10-31'), null);
});

test('an older trip without plan prices says so, for the fallback', () => {
  const plan = { stops: [stop('LIS'), stop('OPO')] };
  assert.deepEqual(planBedNudge(plan, [50, 40]), { stored: false, nudge: null });
});

test('the stop that fell the most against its plan price is named', () => {
  const plan = { stops: [stop('LIS', { night: 60, at: '2026-10-01' }), stop('OPO', { night: 50, at: '2026-10-02' })] };
  const out = planBedNudge(plan, [57, 46]);
  assert.equal(out.stored, true);
  assert.equal(out.nudge.destId, 'OPO');
  assert.ok(Math.abs(out.nudge.share - 0.08) < 1e-9, 'Porto is 8% under the plan');
  assert.equal(out.nudge.fall, 4);
  assert.equal(out.nudge.at, '2026-10-02');
});

test('a rise, a small change or no price today says nothing, and does not fall back', () => {
  const plan = { stops: [stop('LIS', { night: 60 }), stop('OPO', { night: 50 })] };
  assert.deepEqual(planBedNudge(plan, [66, 51]), { stored: true, nudge: null });
  assert.deepEqual(planBedNudge(plan, [59.5, 49.2]), { stored: true, nudge: null }, 'under a euro');
  assert.deepEqual(planBedNudge({ stops: [stop('LIS', { night: 400 })] }, [390]), { stored: true, nudge: null }, 'under 3 percent');
  assert.deepEqual(planBedNudge(plan, [null, undefined]), { stored: true, nudge: null });
});

test('a stop with its own stay tier is not compared; stops without a place are skipped in order', () => {
  const plan = { stops: [{ city: 'nowhere' }, stop('LIS', { night: 60 }, { stayTier: 'hostel' }), stop('OPO', { night: 50 })] };
  const out = planBedNudge(plan, [40, 45]);
  assert.equal(out.nudge.destId, 'OPO');
  assert.ok(Math.abs(out.nudge.share - 0.1) < 1e-9);
});

test('a trip kept on the device carries its plan prices to My trips', () => {
  const stored = { key: 'dt-1', trip: { tripStart: '2026-11-20', stops: [{ destinationId: 'LIS', nights: 3 }, null, { destinationId: 'OPO', nights: 2 }], planBeds: [{ night: 60, at: '2026-10-01' }, null, null] } };
  const plan = deviceTripAsPlan(stored, {});
  assert.deepEqual(plan.stops[0].choices, { planBed: { night: 60, at: '2026-10-01' } });
  assert.equal(plan.stops[1].choices, undefined);
  assert.equal(planBedNudge(plan, [54, 40]).nudge.destId, 'LIS');
});
