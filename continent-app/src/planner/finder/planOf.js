/**
 * The plan "Plan this trip" hands the planner (TF2, T801), made from one
 * priced trip as it stands on the receipt. Lives in the finder's lazy chunk;
 * the wizard reads the plan through handoff.js.
 */
import { SLOT_ROWS } from '../../lib/recommend/slots.js';
import { PROFILES } from '../../lib/lifestyleProfiles.js';

const row = (id) => SLOT_ROWS.find((r) => r.id === id) || {};
const slotOf = (trip, id) => trip.slots.find((s) => s.id === id) || null;

/** The planner state the finder priced the trip with (kept beside the trip). */
export const finderState = (trip) => trip.state || trip.base?.state || null;

/** The live flights the traveller took, keyed the way quoteTrip reads them ("BRU-LJU-2026-11-21"). */
function liveFlightsOf(trip) {
  const facts = slotOf(trip, 'flight')?.pick?.facts;
  const out = [];
  for (const leg of [facts?.out, facts?.back]) {
    if (!leg || leg.source !== 'live' || leg.price == null) continue;
    out.push([`${leg.from}-${leg.to}-${leg.date}`, {
      checked: Number.isFinite(leg.checked) ? new Date(leg.checked).toISOString() : null,
      link: facts.link || null,
      flights: [{
        price: leg.price, airline: leg.airline, flightNo: leg.flightNo, dep: leg.dep, arr: leg.arr,
        stops: leg.stops ?? 0, min: leg.minutes ?? null, via: leg.via || null,
      }],
    }]);
  }
  return out;
}

/**
 * The plan for one trip as it stands on the receipt. A slot the traveller
 * swapped carries its option's setting; one they left keeps the finder's.
 */
export function planOf(trip) {
  const st = finderState(trip) || {};
  const stay = slotOf(trip, 'stay');
  const food = slotOf(trip, 'food');
  const local = slotOf(trip, 'local');
  const base = trip.base || trip;
  const basePick = (id) => slotOf(base, id)?.pick?.id ?? null;
  const swapped = (s) => s?.pick && s.pick.id !== basePick(s.id);
  const foodOpt = swapped(food) ? (row('food').options || []).find((o) => o.id === food.pick.id) : null;
  const localOpt = swapped(local) ? (row('local').options || []).find((o) => o.id === local.pick.id) : null;
  return {
    tripId: trip.id,
    iso2: trip.iso2,
    country: trip.country,
    order: trip.places.map((p) => p.id),
    nights: Object.fromEntries(trip.places.map((p) => [p.id, p.nights])),
    startDate: trip.dates?.out || '',
    endDate: trip.dates?.back || '',
    party: { adults: trip.party.adults, children: trip.party.children || 0, babies: trip.party.babies || 0 },
    anchorId: st.anchorId || null,
    returnAnchorId: st.returnAnchorId || null,
    anchorOrigin: st.anchorOrigin || null,
    carHome: st.carHome || null,
    transport: localOpt?.transport || st.transportPref || 'auto',
    stayTier: stay?.pick?.id || st.stayTier || null,
    lifestyle: foodOpt && PROFILES[foodOpt.lifestyle] ? PROFILES[foodOpt.lifestyle] : (st.lifestyle || null),
    flightRank: st.flightRank || 'price',
    liveFlights: liveFlightsOf(trip),
    // The traveller's own lines, asked in their step (question 7).
    yours: trip.slots.filter((s) => s.owner === 'you' && s.eur != null).map((s) => s.id),
  };
}

