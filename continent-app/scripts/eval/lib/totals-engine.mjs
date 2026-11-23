/*
 * The E1 honest totals engine's harness (G1, ROADMAP G4, logic wave 1). It runs
 * the REAL app code of every E1 site (quoteTrip and tripLines, budgetSearch,
 * toEur, groundSpendPerPerson, the price order, the budget standing) twice, with
 * flag E1 forced to old and to new (lib/flags.js withFlags), and reduces each
 * answer to a few scalars a golden case can state: what a screen would print.
 *
 * Places are synthetic (a catalogue spec in tests/fixtures/logic-golden/
 * totals-places.json), because the committed real-place fixture carries no bed
 * or food prices. The persona view prices the same catalogue for each of the
 * twelve gate-7 travellers' party, month and a budget of 85 euros a person a day.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFlags } from '../../../src/lib/flags.js';
import { quoteTrip, tripLines } from '../../../src/lib/tripTotal.js';
import { budgetSearch, normalizeQuery } from '../../../src/lib/budgetSearch.js';
import { toEur } from '../../../src/lib/currency.js';
import { groundSpendPerPerson } from '../../../src/lib/runtime_pricing.js';
import { orderByTotal, standingOf } from '../../../src/lib/price/gaps.js';

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(readFileSync(resolve(here, '../../../tests/fixtures/logic-golden/totals-places.json'), 'utf8'));
export const TODAY = new Date(2026, 9, 21);

/** One synthetic place from its spec: bed false leaves the bed price out, food false the food basket. */
export function synth(id, { iso = 'ES', night = 40, meal = 14, bed = true, food = true } = {}) {
  return {
    id, city: id, iso2: iso, tier: 'city', rating: { score: 7 }, climate: { best: [5, 6, 7, 8, 9, 10] },
    accommodation: bed
      ? { beds: { bnb_home: { 2: night * 2, 4: night * 3 }, private: Math.round(night * 1.6), dorm: Math.round(night * 0.7) }, q: 'measured' }
      : { beds: {}, q: 'modelled' },
    costs: food
      ? { meal_mid_eur: meal * 2, meal_cheap_eur: meal, fastfood_eur: 9, drink_out_eur: 4, cocktail_eur: 9, coffee_eur: 2, grocery_day_eur: 11, club_entry_eur: 10, level: 'city' }
      : { level: 'city' },
  };
}
export const CATALOGUE = Object.fromEntries(Object.entries(SPEC.places).map(([id, s]) => [id, synth(id, s)]));

const tripState = (stops, start = '2027-03-06') => {
  const n = stops.reduce((s, x) => s + x.nights, 0);
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  return {
    stops: stops.map((s) => ({ destinationId: s.id, nights: s.nights, activities: [] })), tripStart: start, tripEnd: end,
    groupSize: 2, children: 0, babies: 0, transportPref: 'owncar', baggage: 'priority_10kg', ownFlight: null, carHome: null, stayTier: 'home', lifestyle: null,
  };
};

const ids = (list) => list.map((r) => r.id).join(',');

/** One golden case, answered by whatever flag E1 is now. */
function answer(c) {
  if (c.kind === 'trip') {
    const q = quoteTrip(tripState(c.stops), { data: { destinations: CATALOGUE } });
    const left = tripLines(q).find((l) => l.key === 'bedsMissing');
    return { total: Math.round(q.grandTotal * 100) / 100, bedsLeftOut: left ? left.stops.join(',') : '' };
  }
  if (c.kind === 'budget') {
    const dests = c.catalogue.map((id) => CATALOGUE[id]);
    const q = normalizeQuery({ budget: c.budget, adults: c.adults || 2, days: c.days || 5, month: 10, mode: c.mode || 'public' }, TODAY);
    const r = budgetSearch(dests, q, { destinations: CATALOGUE }, TODAY);
    const hit = (g) => r[g].some((x) => x.id === c.probe);
    return { probe: hit('fits') ? 'fits' : hit('tight') ? 'tight' : 'none', there: r.there || '' };
  }
  if (c.kind === 'standing') return { state: standingOf({ eur: c.eur, complete: c.complete }, c.budget, { adults: 2 }).state };
  if (c.kind === 'order') return { order: ids(orderByTotal(c.rows, (r) => r.eur)) };
  if (c.kind === 'currency') { const v = toEur(c.amount, c.code); return { eur: v == null ? null : Math.round(v * 100) / 100 }; }
  if (c.kind === 'food') {
    const dest = { costs: { ...SPEC.baskets[c.basket] } };
    const g = groundSpendPerPerson(dest, 7, {});
    return { total: g == null ? null : g.total };
  }
  throw new Error(`totals case ${c.id}: unknown kind ${c.kind}`);
}

export const totalsPaths = {
  old: (c) => withFlags({ E1: 'old' }, () => answer(c)),
  new: (c) => withFlags({ E1: 'new' }, () => answer(c)),
};

/* ---- the persona view (shadow diff and characterisation snapshot) ---- */

const PARTY = { family: [2, 2], couple: [2, 0], friends: [4, 0], solo: [1, 0] };

/** What one persona sees from the E1 sites: the places the budget search offers and the two-stop trip's label. */
export function personaTotals(persona, which) {
  const [adults, children] = PARTY[persona.taste?.party] || [2, 0];
  const head = adults + children;
  const budget = Math.round(head * 5 * 85);
  return withFlags({ E1: which }, () => {
    const q = normalizeQuery({ budget, adults, children, days: 5, month: persona.month, mode: 'public' }, TODAY);
    const r = budgetSearch(Object.values(CATALOGUE), q, { destinations: CATALOGUE }, TODAY);
    const trip = answer({ kind: 'trip', stops: [{ id: 'BCN', nights: 3 }, { id: 'NOBED', nights: 4 }] });
    return {
      budget,
      fits: r.fits.map((x) => `${x.id}:${x.total}`),
      tight: r.tight.map((x) => `${x.id}:${x.total}`),
      overNear: r.over.count,
      there: r.there || '',
      trip: `${trip.total}${trip.bedsLeftOut ? ` without beds at stop ${trip.bedsLeftOut}` : ''}`,
    };
  });
}
