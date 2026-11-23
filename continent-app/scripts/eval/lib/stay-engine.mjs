/*
 * The E3 one stay ladder's harness (G1, ROADMAP G4, logic wave 3). It runs the
 * REAL bedPrice (lib/stayPrice.js, the one bed price of every screen) and the
 * cost row built on it (lib/costIndex.js costRow) twice, with flag E3 forced to
 * old and to new (lib/flags.js withFlags), and reduces each answer to scalars a
 * golden case can state: the tier priced, whether it fell back, the units and
 * their kind, the cleaning and the total.
 *
 * The towns are specs in tests/fixtures/logic-golden/stay-places.json: real
 * cities with the supply they have (a Hostelworld town, a town with no hostel,
 * a town with no Airbnb), the bed prices rounded from the shipped wire. The
 * committed real-place fixture carries no beds, so the spec is the catalogue.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFlags } from '../../../src/lib/flags.js';
import { bedPrice } from '../../../src/lib/stayPrice.js';
import { costContext, costRow } from '../../../src/lib/costIndex.js';

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(readFileSync(resolve(here, '../../../tests/fixtures/logic-golden/stay-places.json'), 'utf8'));

/** One town from its spec. */
export function townOf(id) {
  const s = SPEC.towns[id];
  if (!s) throw new Error(`stay-places.json has no town ${id}`);
  return {
    id, city: s.city, iso2: s.iso2, tier: 'city',
    accommodation: { beds: s.beds, q: s.q || 'measured', captured: s.captured === undefined ? '2026-10-23' : s.captured, supply: s.supply },
    costs: { meal_mid_eur: 24, meal_cheap_eur: 12, fastfood_eur: 9, drink_out_eur: 4, cocktail_eur: 9, coffee_eur: 2, grocery_day_eur: 11, club_entry_eur: 10, level: 'city' },
  };
}
export const TOWNS = Object.fromEntries(Object.keys(SPEC.towns).map((id) => [id, townOf(id)]));

const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/** One golden case, answered by whatever flag E3 is now. */
function answer(c) {
  const dest = TOWNS[c.town];
  const b = bedPrice({ dest, tier: c.tier, adults: c.adults, children: c.children || 0, nights: c.nights || 3 });
  if (!b) return { tier: null };
  if (c.kind === 'row') {
    const ctx = costContext({ [dest.id]: dest }, { group_size: c.adults + (c.children || 0), children: c.children || 0, babies: 0, stay_tier: c.tier, nights: c.nights || 3 });
    const row = costRow(dest, ctx);
    return { tier: row.stayUnits?.tier ?? null, fallback: !!row.tierFallback, stayEur: r2(row.stayEur) };
  }
  return { tier: b.tier, fallback: b.fallback, unit: b.unit, units: b.units, cleaning: r2(b.cleaning), total: r2(b.total), perPerson: r2(b.perPerson), measured: b.measured };
}

export const stayPaths = {
  old: (c) => withFlags({ E3: 'old' }, () => answer(c)),
  new: (c) => withFlags({ E3: 'new' }, () => answer(c)),
};

/* ---- the persona view (shadow diff and characterisation snapshot) ---- */

const PARTY = { family: [2, 2], couple: [2, 0], friends: [4, 0], solo: [1, 0] };
/** The tier a persona asks for: the backpacker a dorm bed, a family an entire place, the rest a 3-star room. */
const TIER_OF = (persona) => (persona.taste?.lifestyle === 'backpacker' ? 'dorm' : persona.taste?.party === 'family' ? 'home' : 'hotel3');

/** What one persona sees from the E3 sites: the bed of three nights in each town of the spec. */
export function personaStay(persona, which) {
  const [adults, children] = PARTY[persona.taste?.party] || [2, 0];
  const tier = TIER_OF(persona);
  return withFlags({ E3: which }, () => Object.keys(TOWNS).map((town) => {
    const r = answer({ kind: 'bed', town, tier, adults, children, nights: 3 });
    return { town, tier, party: `${adults}+${children}`, got: r.tier ? `${r.tier}${r.fallback ? ' (fallback)' : ''}, ${r.units} ${r.unit}${r.units === 1 ? '' : 's'}, ${r.total} total, cleaning ${r.cleaning}` : 'no bed' };
  }));
}
