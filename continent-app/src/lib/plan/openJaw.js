/**
 * openJaw.js, fly home from the last stop (G12 plan rethink, lane L11,
 * decision §3.6, §7 N6; owner 2026-11-24: "build now").
 *
 * A trip of two or more stops can fly in at its first town and home from its
 * last instead of travelling back across the route. The engine already
 * prices it (quoteTrip's returnAnchorId, lib/price/trip.js), but the wizard
 * hard-coded `returnAnchorId: null` and the planner had no setter, so the
 * traveller never saw the choice. Here the choice is named and both totals
 * are quoted, so the trip page can show them side by side.
 *
 *   openJawChoice(state, destinations)  -> { inId, outId, firstId, lastId, current } | null
 *   openJawPatch(choice, which)         -> { returnAnchorId } for 'round' or 'open'
 *   liveLines(quote)                    -> the quote's priced lines, sorted (like for like)
 *   openJawTotals(state, ctx)           -> { choice, round, open, same, diff } | null
 *
 * Honest numbers (decision §3.3): a difference is given only when both
 * quotes have the same live lines; an option whose flight has no price yet
 * says so instead of showing a total that leaves the flight out.
 * Pure: node tests in tests/openJaw.test.mjs.
 */
import { quoteTrip } from '../tripTotal.js';
import { destAnchor } from '../origins.js';

const routable = (d) => Boolean(d && Object.keys(d.routes || {}).length > 0);

/** The airport a stop is flown through: its own routes, else its anchor airport. */
function airportOf(id, destinations) {
  const d = destinations?.[id];
  if (!d) return null;
  if (routable(d)) return id;
  const a = destAnchor(d);
  return a && destinations[a] ? a : null;
}

/**
 * The open-jaw choice of a trip, or null when there is none: fewer than two
 * stops, their own car, a flight the traveller booked (it fixes both ends),
 * or the first and last stop share one airport.
 */
export function openJawChoice(state, destinations) {
  const stops = Array.isArray(state?.stops) ? state.stops : [];
  if (stops.length < 2) return null;
  if (state.transportPref === 'owncar' || state.ownFlight) return null;
  const firstId = stops[0]?.destinationId;
  const lastId = stops[stops.length - 1]?.destinationId;
  const inId = (state.anchorId && destinations?.[state.anchorId] ? state.anchorId : null) || airportOf(firstId, destinations);
  const outId = airportOf(lastId, destinations);
  if (!inId || !outId || inId === outId) return null;
  // With no return airport the engine already flies home from a last stop
  // that has routes of its own (quoteTrip's outDest); else it goes back.
  const ret = state.returnAnchorId || null;
  const current = ret ? (ret === outId ? 'open' : 'round') : (routable(destinations[lastId]) ? 'open' : 'round');
  return { inId, outId, firstId, lastId, current };
}

/** The planner patch for one side of the choice. */
export function openJawPatch(choice, which) {
  if (!choice) return {};
  return { returnAnchorId: which === 'open' ? choice.outId : choice.inId };
}

const flightPriced = (q) => Boolean(q?.flight?.own || q?.flight?.driving || (q?.cartaFlight?.out?.cost && q?.cartaFlight?.back?.cost));

/** The lines a quote prices (its parts above zero, the flight only when both ways are), sorted. */
export function liveLines(q) {
  if (!q) return [];
  const parts = Object.entries(q.parts || {}).filter(([k, v]) => k !== 'flights' && v > 0).map(([k]) => k);
  if (flightPriced(q)) parts.push('flights');
  return parts.sort();
}

/**
 * Both sides of the choice, quoted: { choice, round, open, same, diff }.
 * round/open: { total, perPerson, flight (true when its flight is priced) }.
 * diff (open minus round, the group) only when both have the same live
 * lines and both flights are priced; else null.
 */
export function openJawTotals(state, ctx = {}) {
  const choice = openJawChoice(state, ctx.data?.destinations || {});
  if (!choice) return null;
  const side = (which) => {
    const q = quoteTrip({ ...state, ...openJawPatch(choice, which) }, ctx);
    return { q, total: q?.grandTotal ?? null, perPerson: q?.perPerson ?? null, flight: flightPriced(q) };
  };
  const round = side('round');
  const open = side('open');
  const same = liveLines(round.q).join('|') === liveLines(open.q).join('|');
  const diff = same && round.flight && open.flight && Number.isFinite(round.total) && Number.isFinite(open.total)
    ? Math.round(open.total - round.total) : null;
  const strip = ({ q: _q, ...rest }) => rest;
  return { choice, round: strip(round), open: strip(open), same, diff };
}
