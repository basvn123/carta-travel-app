// ROADMAP I-f (decision 0010): no pass renews. The Year Pass is a one-off
// 12-month payment like the Trip Pass, so both check out in payment mode,
// the request-to-start text never says the buyer loses the 14-day right or
// that anything renews, and the client mirror in lib/pricing.js agrees.
// (T460 sold the Year Pass as a subscription; its invoice and state helpers
// are gone.) Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as passes from '../../supabase/functions/_shared/passes.mjs';
import * as pricing from '../src/lib/pricing.js';

const { checkoutModeFor, waiverText, RECURRING_TIERS } = passes;
const { TIERS, monthlyCents } = pricing;

test('both passes are a one-off payment', () => {
  assert.deepEqual(RECURRING_TIERS, []);
  assert.equal(checkoutModeFor('year'), 'payment');
  assert.equal(checkoutModeFor('trip'), 'payment');
});

test('the request to start keeps the 14-day right and names no renewal', () => {
  for (const tier of ['trip', 'year']) {
    const w = waiverText(tier, 'https://x/?legal=terms');
    assert.match(w, /start my pass as soon as this payment completes/);
    assert.match(w, /if I withdraw within 14 days I pay for the days my pass has run/);
    assert.match(w, /\(https:\/\/x\/\?legal=terms\)/);
    assert.doesNotMatch(w, /lose|renew|cancel|subscri/i);
  }
});

test('the subscription helpers are gone', () => {
  assert.equal(passes.grantFromInvoice, undefined);
  assert.equal(passes.stateFromSubscription, undefined);
  assert.equal(pricing.isRecurring, undefined);
});

test('the client mirror: 60-day Trip Pass, 365-day Year Pass, neither recurring', () => {
  assert.equal(TIERS.trip.periodDays, 60);
  assert.equal(TIERS.year.periodDays, 365);
  for (const t of Object.values(TIERS)) assert.equal(t.recurring, undefined, t.id);
  assert.equal(monthlyCents('year'), Math.round(TIERS.year.priceCents / 12));
  assert.equal(monthlyCents('trip'), null);
});
