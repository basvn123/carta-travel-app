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
import { quoteTrip } from '../price/trip.js';
import { wizardPlannerState } from '../tripTotal.js';
import { flightRanking, partySize } from '../../planner/flow/tripSettings.js';
import { buildCandidates } from './candidates.js';
import { SLOT_ROWS, ADAPTERS, buildSlots, prepareState, slotTotals } from './slots.js';
import { planOf, finderState } from '../../planner/finder/planOf.js';

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
    s.guide, s.when, s.party, s.priority, input.origin?.iata || null, input.origin?.lat ?? null, input.origin?.lon ?? null,
    input.lifestyle || null, input.stayTier || null, input.ownFlight || null, input.flights?.checked || null,
    input.taste || null, Boolean(input.countryInsights),
    Object.keys(input.layerIndexes || {}).filter((k) => input.layerIndexes[k]).sort(),
    input.today ? String(input.today).slice(0, 10) : null,
  ]));
}

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
    anchorOrigin: input.origin?.iata || null,
    ownFlight: input.ownFlight || null,
    carHome: c.transport === 'owncar' && input.origin?.lat != null
      ? { name: input.origin.name || '', lat: input.origin.lat, lon: input.origin.lon } : null,
    stops: c.places.map((p) => ({ destinationId: p.id, nights: p.nights })),
  };
  return { ...wizardPlannerState(handOver, { lifestyle: input.lifestyle || null }), flightRank: flightRanking(s).sort };
}

/** The data the engine prices with: the catalogue, the origin and its swept flights. */
function quoteData(input) {
  const { data, flights, origin } = input;
  return {
    ...data,
    flights: flights || null,
    meta: { ...(data?.meta || {}), selected_origin: origin?.iata || data?.meta?.selected_origin || null },
  };
}

/** One candidate priced: the trip, with its quote kept beside it (not enumerable). */
export function priceCandidate(c, input, qdata = quoteData(input), registry = {}) {
  const s = input.settings;
  const ctx = {
    data: qdata,
    countryInsights: input.countryInsights || null,
    flights: input.flights || null,
    origin: input.origin || null,
    pick: s.guide.pick,
    priority: s.priority,
    stayTier: input.stayTier || null,
    noCar: s.guide.avoid.includes('car'),
    ownFlight: input.ownFlight || null,
    settings: s,
  };
  const reg = { rows: registry.rows || SLOT_ROWS, adapters: registry.adapters || ADAPTERS };
  const state = prepareState(plannerState(c, input), ctx, reg);
  const quote = quoteTrip(state, { data: qdata, countryInsights: ctx.countryInsights });
  const trip = {
    id: tripId(c),
    country: c.country,
    iso2: c.iso2,
    places: c.places,
    gateway: c.gateway ? { iata: c.gateway.iata, minutes: c.gateway.minutes, mode: c.gateway.mode, placeId: c.gateway.placeId, swept: c.gateway.swept } : null,
    origin: input.origin?.iata || null,
    month: c.month,
    dates: c.dates,
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
 * the hand-over (handoff.js planState). Every slot is then rebuilt from
 * that one quote, so the slots, the total and Finish agree to the cent:
 * pricing a swap one slot at a time missed how the lines move together.
 * A trip without its pricing context comes back with its sum only.
 */
export function repriceTrip(trip) {
  const base = trip.base || trip;
  const ctx = trip.ctx || base.ctx;
  const st = finderState(trip);
  if (!ctx || !st) return keepHidden(trip, { ...trip, total: slotTotals(trip.slots) });
  const plan = planOf(trip);
  const live = new Map([...(st.liveFlights || []), ...plan.liveFlights]);
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
    budget: trip.budget ? { eur: trip.budget.eur, delta: total.perPerson - trip.budget.eur } : trip.budget,
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
 * { lifestyle, stayTier, ownFlight }; `registry` ({ rows, adapters })
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
