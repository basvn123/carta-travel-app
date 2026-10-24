/**
 * The one configuration of every rule that moves a price (T690, plan phase
 * F3, section 6.1): continent-app/config/pricing.json, read by the app here
 * and by the pipeline through pipeline/pricing_config.py. Each rule carries
 * its value, unit, kind (measured, sourced, estimate), source, date, review
 * date and the test that pins it; tests/priceConfig.test.mjs checks them and
 * that no price module keeps a number of its own (invariant V13).
 *
 * rule(key) returns a rule's value and throws on an unknown key, so a typo
 * fails at load rather than pricing with undefined.
 */
import PRICING from '../../../config/pricing.json' with { type: 'json' };

export const PRICING_RULES = PRICING.rules;

export function rule(key) {
  const r = PRICING.rules[key];
  if (!r) throw new Error(`pricing rule "${key}" is not in config/pricing.json`);
  return r.value;
}
