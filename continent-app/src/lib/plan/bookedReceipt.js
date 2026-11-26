/**
 * bookedReceipt.js, "Betaald €x, nog te plannen €y" (G12 plan rethink,
 * lane L4, decision §3.5 and N2): a trip with booked parts splits its
 * total into what the traveller already paid and what Viantra still prices.
 *
 *   bookedSplit(priced) -> { paid, toPlan, notYet: [tileKey], unpriced: [part] } | null
 *
 * Every figure is quoteTrip()'s own (lib/price/trip.js): `paid` is the
 * traveller's own way there and home (parts.travel, a typed or booked fare;
 * driving their own car is not a payment) plus every stay they priced
 * themselves (stayCosts ownAccom); `toPlan` is the rest of grandTotal. A
 * tile with no price yet (tiles.js `missing`, a flight beyond the sweep) is
 * in neither figure and named in `notYet`, so the split never reads as
 * whole. A booked flight with no price printed is named in `unpriced`
 * ('travel'): it is the traveller's, but no figure is invented.
 * Null when nothing is the traveller's own: the split would say nothing.
 *
 * Pure, node tested (tests/planSeedWriters.test.mjs).
 */
import { costTiles } from '../price/tiles.js';

const r2 = (n) => Math.round(n * 100) / 100;

export function bookedSplit(priced) {
  if (!priced?.parts || !Number.isFinite(priced.grandTotal)) return null;
  const p = priced.parts;
  const flightOwn = Boolean(priced.flight?.own && !priced.flight?.driving);
  // A booked stay with no price printed is not in ownStays (doors.js
  // bookedTrip), so Viantra's estimate prices it; only priced ones are paid.
  const stays = (priced.stayCosts || []).filter((s) => s?.ownAccom);
  if (!flightOwn && !stays.length) return null;
  const travelPaid = flightOwn ? (p.travel || 0) : 0;
  const paid = r2(travelPaid + stays.reduce((n, s) => n + (s.accomTotal || 0), 0));
  const notYet = costTiles(priced).filter((x) => x.missing).map((x) => x.key);
  const unpriced = flightOwn && !(travelPaid > 0) ? ['travel'] : [];
  return { paid, toPlan: r2(Math.max(0, priced.grandTotal - paid)), notYet, unpriced };
}
