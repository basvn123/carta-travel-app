/**
 * Priced trips (TF1, T793): every candidate (candidates.js) priced in full
 * by one quoteTrip call, the way the wizard prices the trip it hands over
 * (GuidedTripWizard: wizardPlannerState, then quoteTrip), and cut into the
 * slots of config/slots.json (slots.js).
 *
 *   trip = { id, country, iso2, places: [{ id, nights }], gateway, origin,
 *            month, dates, nights, party, shape, transport, slots, total,
 *            budget, match, reasons, catch, score, signals }
 *
 * `total` is the sum of the slots with a figure, whoever owns them; the
 * receipt (receiptOf) reads the same slots, so the card and the receipt
 * can never disagree. budget, match, reasons, catch and score are filled
 * by rank.js. The same answers give the same trips with the same ids, and
 * are built once (memoised per answer set).
 */
import { quoteTrip, stayCostsOf, tripParty, tripStopDetails } from '../price/trip.js';
import { wizardPlannerState } from '../tripTotal.js';
import { flightStateOf, partySize, tradeoffsOf } from '../../planner/flow/tripSettings.js';
import { buildCandidates, wantsNoCar } from './candidates.js';
import { SLOT_ROWS, ADAPTERS, buildSlots, prepareState, slotTotals } from './slots.js';
import { planOf, finderState } from '../../planner/finder/planOf.js';
import { budgetRulerFor, dayBasisSpend } from '../budgetBasis.js';
import { foodOf } from './adapters/food.js';
import { localFares } from './adapters/local.js';
import { round2 } from '../math.js';
import { destAnchor } from '../origins.js';
import { movedOnto } from './flightDays.js';

/** A short stable hash (FNV-1a, base 36) of a string. */
export function stableHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** The trip's id: its country, places, gateway, nights and month (TF4 keeps trips by it). */
export function tripId(c) {
  return `tf_${stableHash([c.iso2 || c.country, c.places.map((p) => p.id).join('+'), c.gateway?.iata || '', c.nights, c.month].join('|'))}`;
}

/** The answer set a build depends on, as one string (the memo key). */
export function answerKey(input) {
  const s = input.settings;
  return stableHash(JSON.stringify([
    // G12 L10: what is booked fixes the dates and the places.
    s.guide, s.when, s.party, s.priority, tradeoffsOf(s), s.booked || null, s.imports || null, s.avoidIso2 || null, input.origin?.iata || null, input.origin?.lat ?? null, input.origin?.lon ?? null,
    input.lifestyle || null, input.stayTier || null, input.baggage || null, input.ownFlight || null, input.flights?.checked || null,
    input.taste || null, Boolean(input.countryInsights),
    // T861: the home airports in reach and when each one's file was checked.
    homeAirportsOf(input).map((a) => `${a.iata}:${input.data?.flightsBy?.[a.iata]?.checked || ''}`),
    Object.keys(input.layerIndexes || {}).filter((k) => input.layerIndexes[k]).sort(),
    input.today ? String(input.today).slice(0, 10) : null,
  ]));
}

/** The ticked home airports (T861), from the catalogue the engine prices with. */
const homeAirportsOf = (input) => (Array.isArray(input.data?.meta?.home_airports) ? input.data.meta.home_airports : []);

/** The planner state of one candidate, before the slots set their own settings. */
function plannerState(c, input) {
  const s = input.settings;
  // The flight lands at the gateway's own airport row when the catalogue has
  // one (the engine then prices the transfer to the first stop), else at the
  // place it serves.
  const gw = c.gateway;
  const at = gw ? (input.data?.destinations?.[gw.iata]?.tier === 'airport' ? gw.iata : gw.placeId) : null;
  const handOver = {
    startDate: c.dates?.out || '',
    groupSize: s.party.adults,
    children: s.party.kids,
    babies: s.party.babies,
    transport: c.transport,
    pace: 'balanced',
    anchorId: at,
    returnAnchorId: at,
    // T861: with the airports in reach answered, quoteTrip flies from the
    // cheapest of them door to door; else from the one origin, as before.
    anchorOrigin: homeAirportsOf(input).length ? null : (input.origin?.iata || null),
    ownFlight: input.ownFlight || null,
    carHome: c.transport === 'owncar' && input.origin?.lat != null
      ? { name: input.origin.name || '', lat: input.origin.lat, lon: input.origin.lon } : null,
    stops: c.places.map((p) => ({ destinationId: p.id, nights: p.nights })),
    // The traveller's own bag (choices.baggage_key) when the caller passes
    // it; wizardPlannerState falls back to the planner's cabin bag, so the
    // finder's flight is priced with the bag Explore and the place page use.
    baggage: input.baggage || null,
  };
  return { ...wizardPlannerState(handOver, { lifestyle: input.lifestyle || null }), ...flightStateOf(s) };
}

/** The data the engine prices with: the catalogue, the origin and its swept flights. */
export function quoteData(input) {
  const { data, flights, origin } = input;
  return {
    ...data,
    flights: flights || null,
    meta: { ...(data?.meta || {}), selected_origin: origin?.iata || data?.meta?.selected_origin || null },
  };
}

/** What every adapter reads beside the quote. */
function ctxOf(input, qdata) {
  const s = input.settings;
  return {
    data: qdata,
    countryInsights: input.countryInsights || null,
    flights: input.flights || null,
    origin: input.origin || null,
    pick: s.guide.pick,
    priority: s.priority,
    stayTier: input.stayTier || null,
    noCar: wantsNoCar(s),
    ownFlight: input.ownFlight || null,
    settings: s,
  };
}

/**
 * G12 early results (owner decision 2026-11-25, "go on"): a price floor of a
 * candidate before it is priced, so rank 1 can be proven final early under a
 * budget and with price first too. The beds and days are the quote's own
 * (lib/price/trip.js stayCostsOf on the same planner state, so exact); the
 * flight is at least the cheapest swept fare each way to any airport the
 * trip can fly (flightFloor); the transfers, the hops and a car have no
 * sound bound before pricing and count as 0, which they never go under.
 *   -> { perPerson   a floor of total.perPerson, whatever is priced or "Not yet"
 *        full        a floor of total.perPerson once every line is priced (the flight's floor added)
 *        day         the exact day-basis spend a person a night (lib/budgetBasis.js), or null
 *        stay, food  whether those lines will have a price
 *        flight      false when no fare exists for the trip at all (its line will be "Not yet"), else null (not known) }
 * A wrong floor would let a wrong rank 1 through, so tests/recommendEarly.test.mjs
 * checks it against every priced trip.
 */
export function priceFloor(c, input, qdata = quoteData(input)) {
  const ctx = ctxOf(input, qdata);
  const state = prepareState(plannerState(c, input), ctx);
  const destinations = qdata?.destinations || {};
  const stopDetails = tripStopDetails(state.stops, destinations, state.tripStart);
  const stayCosts = stayCostsOf(stopDetails, state, destinations);
  const live = (id) => SLOT_ROWS.some((r) => r.id === id && r.status === 'live');
  // The same tests as the stay and food adapters.
  const stay = live('stay') && stayCosts.some((x) => x?.accom);
  const per = stayCosts.filter((x) => x && x.nights);
  const food = live('food') && per.length > 0 && per.every((x) => foodOf(x) != null);
  const head = Math.max(1, tripParty(state).groupSize);
  const group = (stay ? stayCosts.reduce((n, x) => n + (x?.accomTotal || 0), 0) : 0)
    + (food ? per.reduce((n, x) => n + foodOf(x), 0) : 0)
    + (live('local') ? localFares({ stayCosts }) : 0);
  // The slots round to the cent a line (slots.js), so the floor gives a few cents.
  const perPerson = Math.max(0, group / head - 0.05);
  // The day basis reads the quote's parts as quoteTrip sums them.
  const parts = {
    beds: round2(stayCosts.reduce((n, x) => n + (x?.accomTotal || 0), 0)),
    days: round2(stayCosts.reduce((n, x) => n + (x?.groundTotal || 0), 0)),
  };
  const day = dayBasisSpend(parts, partySize(input.settings), c.nights);
  const fl = live('flight') ? flightFloor(c, state, stopDetails, qdata, input) : { eur: 0, none: true };
  return { perPerson, full: perPerson + fl.eur / head, day, stay, food, flight: fl.none ? false : null };
}

/** The cheapest fare a seat in a swept file, one way, to or from any of `airports`, any day. */
function cheapestFare(files, dir, airports) {
  let min = Infinity;
  for (const f of files) {
    for (const a of airports) {
      for (const v of Object.values(f?.[dir]?.[a] || {})) if (Array.isArray(v) && v[0] < min) min = v[0];
    }
  }
  return min;
}

/**
 * G12 early results: the floor of the flight line for the party, before
 * pricing, { eur, none }. The flight adapter (adapters/flight.js) prices
 * both ways from a swept file: quoteTrip's routed airports (the arrival
 * anchor or the first stop in, the return anchor, the last stop or the
 * anchor home) or the gateway's own (nearLegs). Each way costs at least the
 * cheapest fare to any of those airports on any day, a seat, times the
 * seats that pay (bags and a lap fee only add). A typed or booked flight
 * and driving their own car are the traveller's figures: no floor (0).
 * `none`: no file holds a fare for those airports at all, so the line will
 * be "Not yet" (the finder has no live fares and holds no flight).
 */
function flightFloor(c, state, stopDetails, qdata, input) {
  if (state.transportPref === 'owncar' || input.ownFlight || state.ownFlight) return { eur: 0, none: false };
  const destinations = qdata?.destinations || {};
  const first = stopDetails[0]?.dest;
  const last = stopDetails[stopDetails.length - 1]?.dest;
  const anchor = state.anchorId ? destinations[state.anchorId] : null;
  const back = state.returnAnchorId ? destinations[state.returnAnchorId] : null;
  const gw = c.gateway?.iata || null;
  const ins = [destAnchor(anchor), destAnchor(first), gw].filter(Boolean);
  const outs = [destAnchor(back), destAnchor(last), destAnchor(anchor), gw].filter(Boolean);
  const files = [...new Set([qdata?.flights, ...Object.values(qdata?.flightsBy || {})].filter(Boolean))];
  const there = cheapestFare(files, 'to', ins);
  const home = cheapestFare(files, 'back', outs);
  // Both ways or no flight line at all (the adapter never prices half).
  if (!Number.isFinite(there) || !Number.isFinite(home)) return { eur: 0, none: true };
  const paying = Math.min(tripParty(state).groupSize, partySize(input.settings));
  return { eur: Math.max(0, (there + home) * paying), none: false };
}

/** One candidate priced: the trip, with its quote kept beside it (not enumerable). */
export function priceCandidate(c, input, qdata = quoteData(input), registry = {}) {
  const s = input.settings;
  const ctx = ctxOf(input, qdata);
  const reg = { rows: registry.rows || SLOT_ROWS, adapters: registry.adapters || ADAPTERS };
  const state = prepareState(plannerState(c, input), ctx, reg);
  const quote = quoteTrip(state, { data: qdata, countryInsights: ctx.countryInsights });
  const trip = {
    id: tripId(c),
    country: c.country,
    iso2: c.iso2,
    places: c.places,
    gateway: c.gateway ? { iata: c.gateway.iata, minutes: c.gateway.minutes, mode: c.gateway.mode, placeId: c.gateway.placeId, swept: c.gateway.swept, ...(c.gateway.booked ? { booked: true } : {}) } : null,
    // T861: the home airport the trip flies from (the cheapest door to door).
    origin: quote.cartaFlight?.home || input.origin?.iata || null,
    month: c.month,
    dates: c.dates,
    // T855: dates the traveller fixed (an exact date, something booked) or
    // already moved onto the flight's days do not move again.
    datesFixed: Boolean(c.datesFromSetup || c.movedOntoFlight),
    ...(c.shiftedBy ? { shiftedBy: c.shiftedBy } : {}),
    nights: c.nights,
    party: { adults: s.party.adults, children: s.party.kids, babies: s.party.babies, head: partySize(s) },
    shape: c.shape,
    transport: c.transport,
    slots: [],
    total: null,
    budget: null,
    match: null,
    reasons: [],
    catch: null,
    score: null,
    signals: c.signals,
  };
  trip.slots = buildSlots({ trip, quote, state, ctx }, reg);
  // T855: the fare sat on nearby days: the trip moves onto the flight's
  // days and is priced again, so check-in is the day the flight lands and
  // check-out the day the flight home leaves. The same shift both ways keeps
  // the nights; otherwise the last place gains or loses the difference.
  const moved = c.movedOntoFlight ? null : movedOnto(c, trip.slots.find((s) => s.id === 'flight')?.pick?.facts?.moveTo);
  if (moved) return priceCandidate(moved, input, qdata, registry);
  // T861: the flight slot may fly from another ticked airport (the nearest
  // swept days were cheaper from there): the trip flies from where it does.
  const flownFrom = trip.slots.find((s) => s.id === 'flight')?.pick?.facts?.home;
  if (flownFrom) trip.origin = flownFrom;
  trip.total = slotTotals(trip.slots);
  Object.defineProperty(trip, 'quote', { value: quote, enumerable: false });
  Object.defineProperty(trip, 'state', { value: state, enumerable: false });
  // What repriceTrip needs to quote the trip again after a swap.
  Object.defineProperty(trip, 'ctx', { value: { ...ctx, reg }, enumerable: false });
  return trip;
}

/** The hidden fields a trip carries beside its slots, kept on a copy. */
export function keepHidden(from, to) {
  for (const k of ['quote', 'state', 'base', 'ctx']) {
    const v = Object.getOwnPropertyDescriptor(from, k)?.value ?? from[k];
    if (v !== undefined && !Object.prototype.hasOwnProperty.call(to, k)) Object.defineProperty(to, k, { value: v, enumerable: false });
  }
  return to;
}

/**
 * One trip priced again as it stands after a swap (a stay tier, a food
 * level, a way of getting around, a live flight; T819). The swaps become
 * the plan the planner receives (planOf), and one quoteTrip prices it from
 * the finder's own request with those settings, the way the planner prices
 * the hand-over (lib/plan/doors.js selectionOfPlan). Every slot is then rebuilt from
 * that one quote, so the slots, the total and Finish agree to the cent:
 * pricing a swap one slot at a time missed how the lines move together.
 * A trip without its pricing context comes back with its sum only.
 * T855: `liveDays` ([key, answer] pairs, keyed like useLiveFlights) adds
 * the exact-day live answers the found trip looked up.
 */
export function repriceTrip(trip, liveDays = null) {
  const base = trip.base || trip;
  const ctx = trip.ctx || base.ctx;
  const st = finderState(trip);
  if (!ctx || !st) return keepHidden(trip, { ...trip, total: slotTotals(trip.slots) });
  const plan = planOf(trip);
  const live = new Map([...(st.liveFlights || []), ...plan.liveFlights, ...(liveDays || [])]);
  const state = {
    ...st,
    stayTier: plan.stayTier || st.stayTier,
    lifestyle: plan.lifestyle || st.lifestyle,
    transportPref: plan.transport || st.transportPref,
    ...(live.size ? { liveFlights: live } : {}),
  };
  const quote = quoteTrip(state, { data: ctx.data, countryInsights: ctx.countryInsights });
  const slots = buildSlots({ trip, quote, state, ctx: { ...ctx, stayTier: state.stayTier } }, ctx.reg);
  // A 'you' line keeps the owner the traveller gave it.
  const owned = slots.map((s) => {
    const was = trip.slots.find((x) => x.id === s.id);
    return was && was.owner !== s.owner ? { ...s, owner: was.owner } : s;
  });
  const total = slotTotals(owned);
  const out = {
    ...trip,
    slots: owned,
    total,
    // G12 (L1): the ruler keeps its basis; a day budget reads the new quote.
    budget: trip.budget ? budgetRulerFor({ ...trip, total }, trip.budget, quote) : trip.budget,
  };
  Object.defineProperty(out, 'quote', { value: quote, enumerable: false });
  Object.defineProperty(out, 'state', { value: state, enumerable: false });
  // The trip as the finder priced it stays the base planOf measures swaps from.
  if (!trip.base) Object.defineProperty(out, 'base', { value: trip, enumerable: false });
  return keepHidden(trip, out);
}

const memo = new WeakMap(); // data -> Map(answerKey -> trips)
const MEMO_SIZE = 8;

/**
 * Every priced trip for one answer set, in candidate order (rank.js
 * orders them). input: the candidates' input (candidates.js) plus
 * { lifestyle, stayTier, ownFlight, baggage (choices.baggage_key) }; `registry` ({ rows, adapters })
 * replaces config/slots.json for a test.
 */
export function buildTrips(input, registry = null) {
  const key = answerKey(input);
  let byKey = null;
  if (!registry && input.data && typeof input.data === 'object') {
    byKey = memo.get(input.data);
    if (!byKey) memo.set(input.data, (byKey = new Map()));
    if (byKey.has(key)) return byKey.get(key);
  }
  const qdata = quoteData(input);
  const trips = buildCandidates(input).map((c) => priceCandidate(c, input, qdata, registry || {}));
  if (byKey) {
    if (byKey.size >= MEMO_SIZE) byKey.delete(byKey.keys().next().value);
    byKey.set(key, trips);
  }
  return trips;
}

/**
 * The receipt of a trip: one line per slot, in slot order, and its total.
 * It reads the trip's own slots, so its total is the card's.
 */
export function receiptOf(trip) {
  const lines = trip.slots.map((s) => ({ id: s.id, labelKey: s.labelKey, owner: s.owner, eur: s.eur, eurGroup: s.eurGroup, pick: s.pick }));
  return { lines, total: slotTotals(trip.slots) };
}
