/**
 * baggagePolicies.js, the low-cost-carrier cabin bag rules engine.
 *
 * The fares layer already tags every priced day with its carrier (out_c/ret_c
 * hydrated to into_carrier/out_of_carrier); this maps that code plus the
 * traveller's chosen baggage tier to the airline's actual allowance: what the
 * bag may measure, what it may weigh, and roughly what the gate charges when
 * it doesn't comply. Sizes drift a little per season, so the point is not
 * cent-precision, it is that "priority 10 kg" stops being an abstract toggle
 * and becomes THIS bag on THIS airline. Figures follow the carriers'
 * published rules as of 2026.
 */

// The app speaks two baggage vocabularies (map tab: small/priority_10kg/
// checked_20kg, trip wizard: cabin/priority/checked); both fold to one tier.
const TIER_BY_KEY = {
  small: 'personal',
  cabin: 'personal',
  priority_10kg: 'cabin10',
  priority: 'cabin10',
  checked_20kg: 'checked',
  checked: 'checked',
};

export const BAG_POLICIES = {
  FR: { // Ryanair
    personal: { dims: '40 x 20 x 25 cm' },
    cabin10: { dims: '55 x 40 x 20 cm', kg: 10 },
    checked: { kg: 20 },
    gateFeeEur: 75,
  },
  W6: { // Wizz Air
    personal: { dims: '40 x 30 x 20 cm' },
    cabin10: { dims: '55 x 40 x 23 cm', kg: 10 },
    checked: { kg: 20 },
    gateFeeEur: 70,
  },
  VY: { // Vueling
    personal: { dims: '40 x 30 x 20 cm' },
    cabin10: { dims: '55 x 40 x 20 cm', kg: 10 },
    checked: { kg: 23 },
    gateFeeEur: 75,
  },
  V7: { // Volotea
    personal: { dims: '40 x 30 x 20 cm' },
    cabin10: { dims: '55 x 40 x 20 cm', kg: 10 },
    checked: { kg: 20 },
    gateFeeEur: 60,
  },
};

/** Fold either baggage vocabulary to a policy tier. */
export function bagTier(baggageKey) {
  return TIER_BY_KEY[baggageKey] || 'personal';
}

/**
 * The rule for one flight leg: which airline, which tier, the exact
 * allowance, and the gate fee that non-compliance risks. Untagged fares are
 * Ryanair (see carriers.js), so 'FR' is the fallback policy too.
 */
export function bagRuleFor(carrierCode, baggageKey) {
  const policy = BAG_POLICIES[carrierCode] || BAG_POLICIES.FR;
  const tier = bagTier(baggageKey);
  return {
    carrier: carrierCode || 'FR',
    tier,
    personal: policy.personal,
    allowance: policy[tier] || policy.personal,
    gateFeeEur: policy.gateFeeEur,
  };
}
