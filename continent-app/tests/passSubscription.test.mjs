// T460: the yearly plan's Stripe glue, in supabase/functions/_shared/passes.mjs.
// A paid invoice of the subscription grants a year through grant_pass with the
// invoice id as the idempotency key; anything else grants nothing. The
// subscription's state maps onto set_subscription_state. The withdrawal waiver
// text names the renewal for the yearly plan. And the client's mirror in
// lib/pricing.js agrees: the Trip Pass runs 60 days, the yearly plan renews.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkoutModeFor, waiverText, grantFromInvoice, stateFromSubscription, RECURRING_TIERS,
} from '../../supabase/functions/_shared/passes.mjs';
import { TIERS, isRecurring, monthlyCents } from '../src/lib/pricing.js';

const SUB = { id: 'sub_ABC123456', status: 'active', cancel_at_period_end: false, current_period_end: 1820000000, customer: 'cus_1', metadata: { user_id: 'u1', tier: 'year', reason: 'plans' } };

test('the yearly plan is a subscription, the Trip Pass a payment', () => {
  assert.deepEqual(RECURRING_TIERS, ['year']);
  assert.equal(checkoutModeFor('year'), 'subscription');
  assert.equal(checkoutModeFor('trip'), 'payment');
});

test('the waiver names the renewal and where to cancel', () => {
  const y = waiverText('year', 'https://x/?legal=terms');
  assert.match(y, /renews every year/);
  assert.match(y, /cancel, which I can do at any time in Account/);
  assert.match(y, /14-day right of withdrawal/);
  assert.doesNotMatch(waiverText('trip', 'https://x'), /renews/);
});

test('a paid first invoice grants a year, keyed on the invoice', () => {
  const g = grantFromInvoice({ id: 'in_1', status: 'paid', billing_reason: 'subscription_create', customer: 'cus_1', amount_paid: 1499, currency: 'eur', customer_address: { country: 'BE' } }, SUB);
  assert.equal(g.grant, true);
  assert.equal(g.first, true);
  assert.equal(g.args.p_session_id, 'in_1');
  assert.equal(g.args.p_user, 'u1');
  assert.equal(g.args.p_tier, 'year');
  assert.equal(g.args.p_reason, 'plans');
  assert.equal(g.args.p_buyer_country, 'BE');
  assert.equal(g.args.p_amount_cents, 1499);
});

test('a renewal grants with reason "renewal"; other invoices grant nothing', () => {
  const r = grantFromInvoice({ id: 'in_2', status: 'paid', billing_reason: 'subscription_cycle', customer: { id: 'cus_1' } }, SUB);
  assert.equal(r.grant, true);
  assert.equal(r.args.p_reason, 'renewal');
  assert.equal(r.args.p_customer_id, 'cus_1');
  assert.equal(grantFromInvoice({ id: 'in_3', status: 'paid', billing_reason: 'subscription_update' }, SUB).grant, false);
  assert.equal(grantFromInvoice({ id: 'in_4', status: 'open', billing_reason: 'subscription_cycle' }, SUB).grant, false);
  assert.equal(grantFromInvoice({ id: 'in_5', status: 'paid', billing_reason: 'subscription_cycle' }, { metadata: {} }).grant, false);
});

test('the subscription state maps onto set_subscription_state', () => {
  const s = stateFromSubscription({ ...SUB, cancel_at_period_end: true });
  assert.equal(s.p_user, 'u1');
  assert.equal(s.p_subscription_id, 'sub_ABC123456');
  assert.equal(s.p_cancel_at_period_end, true);
  assert.equal(s.p_current_period_end, new Date(1820000000 * 1000).toISOString());
  // Newer API versions carry the period end on the item.
  const item = stateFromSubscription({ id: 'sub_X1234567', status: 'active', items: { data: [{ current_period_end: 1820000000 }] }, metadata: { user_id: 'u2' } });
  assert.equal(item.p_current_period_end, new Date(1820000000 * 1000).toISOString());
});

test('the client mirror: 60-day Trip Pass, a renewing yearly plan', () => {
  assert.equal(TIERS.trip.periodDays, 60);
  assert.equal(isRecurring('year'), true);
  assert.equal(isRecurring('trip'), false);
  assert.equal(monthlyCents('year'), Math.round(TIERS.year.priceCents / 12));
});
