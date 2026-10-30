/**
 * The trip price (T702, plan "Carta prijslogica Explore" F6): what a whole
 * planned trip costs, from the engine. Moved here from lib/tripTotal.js
 * (T432, where the wizard and the planner were made to price one trip with
 * one function); tripTotal.js keeps the receipt lines and re-exports this.
 *
 * What changed in the move:
 *   - every stop is the day price (priceDay) at the stop's own dates and the
 *     trip's party, stay and Lifestyle, so a stop costs what Explore and the
 *     destination page say for the same question (V1);
 *   - children count with the configured shares (party.shares) on meals and
 *     public fares, the same as the day price; before, a fixed half on
 *     beds, meals and fares (T579-a);
 *   - the default bag is the configured one (request.default_bag);
 *   - the car hire is the engine's car (lib/price/car.js) and only when the
 *     traveller hires one (transport 'car').
 *
 * `quoteTrip(state, ctx)` takes the planner's own state (the shape
 * useTripPlanner holds and persists) and returns every priced part of the
 * trip plus its total and the request it priced (`request`), which a saved
 * trip keeps. Pure: no React, no i18n.
 */
import { tripDaysBetween, drivingEstimate } from '../runtime_pricing.js';
import { combineTripLegs, ownFlightTransfers, pickLegMode } from '../trip_planner_pricing.js';
import { legTransportOptions, airportTransferOptions, transferModesFromKm } from '../transport.js';
import { originHome, destAnchor } from '../origins.js';
import { accessCost, homeCandidates } from '../airportReach.js';
import { pickLeg, legCost, fitsHours, fitsPrefs } from '../flights/flights.js';
import { addDays } from '../dates.js';
import { round2 } from '../math.js';
import { ticketShare, BABY_LAP_FEE_LEG } from '../party.js';
import { rule } from './config.js';
import { carHire, carModelOf } from './car.js';
import { tripRequest, quoteStay } from './stay.js';

const CAR = rule('car.model');   // T691: the one car model's fallbacks

// A hop the traveller paid for themselves. An own entry replaces the estimate
// for that mode and leaves the other modes priced, so switching back is one tap.
export const OWN_LEG_MODES = new Set(['fly', 'ferry', 'train', 'bus', 'car']);

/** The largest party the planner prices. The wizard caps its steppers here
 *  too, so a party never shrinks at the hand-over. */
export const MAX_PARTY = rule('party.limits').max_seats;

// T702, T713: the planner's bag when the traveller has picked none.
export { PLANNER_BAG } from './request.js';

const NO_DESTINATIONS = Object.freeze({});

/** Airport-transfer choice as { in, out }. Accepts the legacy single string. */
export function normalizeTransferMode(v) {
  if (typeof v === 'string') return { in: v, out: v };
  return { in: v?.in || 'auto', out: v?.out || 'auto' };
}

/** A typed money answer ("120", "120,50", 120) as a whole-party euro figure,
 *  0 when blank or not a number. */
export function paidEur(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.min(99999, round2(n)) : 0;
}

/** Each stop with its chained arrive and depart dates. */
export function tripStopDetails(stops, destinations, tripStart) {
  let cursor = tripStart || '';
  return (stops || []).map((s) => {
    const nights = Math.max(0, s.nights || 0);
    const arriveDate = cursor || '';
    const departDate = cursor ? addDays(cursor, nights) : '';
    cursor = departDate;
    return {
      ...s,
      nights,
      activities: s.activities || [],
      arriveDate,
      departDate,
      dest: destinations[s.destinationId] || null,
    };
  });
}

// A stop with an air route of its own: its own anchor airport, with a last
// leg Carta can price (origins.js). No fare is involved since T511.
const hasRoutes = (d) => d && Object.keys(d.routes || {}).length > 0;

/**
 * Every priced part of a trip.
 *
 * state: { stops, tripStart, groupSize, transportPref, legModes, ownLegs,
 *          ownStays, transferMode, baggage, anchorId, anchorOrigin,
 *          returnAnchorId, ownFlight, carHome, stayTier, lifestyle,
 *          flightHours: { out, back } ('any' | 'morning' | 'midday' | 'evening'),
 *          flightRank: 'price' | 'balanced' | 'comfort' (T657, the trip settings'
 *                      what matters most; the order live flights are picked in),
 *          liveFlights: Map from useLiveFlights(),
 *          flightPicks / handedFlights: { out, back } flights the trip holds
 *                      (heldLeg below; T855) }
 * ctx.data.flights is the home airport's swept flight file (T517).
 * ctx:   { data, countryInsights }
 */
/**
 * The flight a trip already holds for one direction (T855), or null: the
 * traveller's pick (state.flightPicks, what the planned trip carries) else
 * the trip finder's priced leg (state.handedFlights, planOf). Both have one
 * shape: from, to, date (the trip's day it stands for), flightDate (its own
 * day when that is another, a swept day nearest the trip's), the fare a
 * seat, airline, times, stops, check time and source. It holds while the
 * trip's day and home airport are the ones it was priced for.
 */
function heldLeg(state, dir, home, day) {
  for (const h of [state?.flightPicks?.[dir], state?.handedFlights?.[dir]]) {
    if (!h || !Number.isFinite(h.price) || !h.from || !h.to || h.date !== day) continue;
    if ((dir === 'out' ? h.from : h.to) === home) return h;
  }
  return null;
}

/** A held flight as pickLeg's leg: its own day, its check time in ms. */
function heldAsLeg(h) {
  const checked = Number.isFinite(h.checked) ? h.checked : (Date.parse(h.checked) || null);
  return {
    date: h.flightDate || h.date, price: h.price, airline: h.airline || null, dep: h.dep || null, arr: h.arr || null,
    stops: h.stops ?? 0, flightNo: h.flightNo || null, min: h.min ?? null, via: h.via || null,
    checked, source: h.source || 'live', link: h.link || null,
  };
}

export function quoteTrip(state, { data = null, countryInsights = null } = {}) {
  const destinations = data?.destinations || NO_DESTINATIONS;
  const carModel = data?.meta?.car_model || null;
  const engineCar = carModelOf(data);
  const {
    stops = [], tripStart = '', transportPref = 'auto', legModes = {}, ownLegs = {},
    ownStays = {}, anchorId = null, anchorOrigin = null,
    returnAnchorId = null, ownFlight = null, carHome = null,
  } = state || {};
  // The party (T458, T702): everyone 12 and over counts as an adult;
  // children 3 to 11 take a seat, a bed and a child's share of meals and
  // public fares (config party.shares, the same shares the day price reads);
  // babies 0 to 2 sit on a lap. Cars are priced per car and need a seat for
  // everyone. `groupSize` (the seats Carta prices beds and legs for) is
  // adults plus children.
  const adults = Math.max(1, Math.min(MAX_PARTY, Math.round(state?.groupSize || 1)));
  const children = Math.max(0, Math.min(MAX_PARTY - adults, Math.round(state?.children || 0)));
  const babies = Math.max(0, Math.min(MAX_PARTY - adults - children, Math.round(state?.babies || 0)));
  const groupSize = adults + children;
  const seats = groupSize + babies;
  const party = { adults, children, babies, seats: groupSize };
  const weight = ticketShare(party);
  const PUBLIC = new Set(['train', 'bus', 'ferry', 'public']);
  const halfFor = (mode, eur) => round2(PUBLIC.has(mode) ? eur * weight : eur);
  const scaleModes = (modes) => Object.fromEntries(Object.entries(modes || {}).map(([k, v]) => [
    k, v && !v.own ? { ...v, eur_total: halfFor(k, v.eur_total), eur_pp: v.eur_pp } : v,
  ]));
  const transferMode = normalizeTransferMode(state?.transferMode);

  const stopDetails = tripStopDetails(stops, destinations, tripStart);
  const plannedNights = stopDetails.reduce((sum, s) => sum + s.nights, 0);
  const first = stopDetails[0];
  const last = stopDetails[stopDetails.length - 1];
  const anchorDest = anchorId ? destinations[anchorId] : null;
  const returnDest = returnAnchorId ? destinations[returnAnchorId] : null;
  const tripHasCar = transportPref === 'car' || transportPref === 'owncar';
  // A typed figure for driving there in their own car (fuel, tolls, the lot)
  // replaces Carta's drive estimate rather than vanishing beside it.
  const ownCarCost = transportPref === 'owncar' && ownFlight?.costTotal > 0
    ? round2(ownFlight.costTotal) : 0;
  // Which direction the typed figure covers. A hand-over names both halves
  // (costOut, costBack); an older draft carries one total for the pair.
  const split = ownFlight && (ownFlight.costOut != null || ownFlight.costBack != null);
  const ownOut = split ? (Number(ownFlight.costOut) || 0) > 0 : ownCarCost > 0;
  const ownBack = split ? (Number(ownFlight.costBack) || 0) > 0 : ownCarCost > 0;

  // ---- The round flight's airports (no fare: T511; T517 adds flights back)
  let routedFlight = null;
  if (transportPref !== 'owncar' && first?.dest && last?.dest) {
    const outDest = hasRoutes(returnDest)
      ? returnDest
      : (hasRoutes(last.dest) ? last.dest : (anchorDest || last.dest));
    const withIds = (priced, inDest) => ({
      ...priced,
      in_from_id: inDest?.id ?? null,
      out_from_id: outDest?.id ?? null,
    });
    const combine = (inDest) => combineTripLegs(
      inDest, first.arriveDate, outDest, last.departDate, groupSize, anchorOrigin,
      { allDests: destinations },
    );
    if (anchorDest) {
      const viaAnchor = combine(anchorDest);
      if (viaAnchor.combinable) routedFlight = withIds(viaAnchor, anchorDest);
    }
    if (!routedFlight) {
      const inDest = hasRoutes(first.dest) ? first.dest : (anchorDest || first.dest);
      routedFlight = withIds(combine(inDest), inDest);
    }
  }

  // ---- How they actually travel there and home -------------------------
  let flight = routedFlight;
  if (transportPref === 'owncar') {
    flight = { driving: true, cost_total: ownCarCost };
  } else if (ownFlight) {
    const mode = ownFlight.mode || 'fly';
    const own = {
      own: true,
      airline: ownFlight.airline || '',
      mode,
      cost_total: round2(ownFlight.costTotal || 0),
      out_date: ownFlight.outDate || null,
      ret_date: ownFlight.retDate || null,
    };
    if (mode === 'car' || !first?.dest || !last?.dest) {
      flight = own;
    } else if (mode === 'fly') {
      const routed = routedFlight?.combinable ? routedFlight : null;
      const routedIn = routed?.in_from_id ? destinations[routed.in_from_id] : null;
      const routedOut = routed?.out_from_id ? destinations[routed.out_from_id] : null;
      const inDest = anchorDest || routedIn || first.dest;
      const outDest = hasRoutes(returnDest) ? returnDest
        : (hasRoutes(last.dest) ? last.dest : (anchorDest || routedOut || last.dest));
      flight = { ...own, ...ownFlightTransfers(routed, inDest, outDest, groupSize) };
    } else {
      // A train, a bus or a ferry pulls into a station or a port in town, or
      // at the arrival the traveller named. Never at the routed flight's
      // airport: that hop is an airport fact (it used to price a transfer
      // from an airport nobody on a train goes through).
      flight = {
        ...own,
        ...ownFlightTransfers(null, anchorDest || first.dest, last.dest, groupSize),
      };
    }
  }

  // ---- Carta's flight there and home (T517) ------------------------------
  // Google Flights' price for the flight the trip routes through, each way:
  // live for the exact day when the planner asked for it, else the sweep's
  // cheapest that day. A fare the traveller typed for a direction wins; a
  // day with no flight stays empty rather than guessed. Bags are added per
  // airline from the trip's baggage choice (flights/bagFees.js).
  const cartaFlight = (() => {
    // An older record holds one typed total for both ways: it covers both.
    const typedPair = ownFlight && !split && ownFlight.costTotal > 0;
    const flies = transportPref !== 'owncar' && !typedPair && (!ownFlight || (ownFlight.mode || 'fly') === 'fly');
    const routed = routedFlight;
    if (!flies || !routed || !first?.arriveDate || !last?.departDate) return null;
    // T861: every home airport the traveller ticked is priced door to door
    // (the fare, plus the drive or train to it and back with parking,
    // airportReach.accessCost) and the cheapest whole is flown from; an
    // airport the traveller swapped to (anchorOrigin) is kept. Without a
    // reach answer the one origin flies, as before, and no way to the
    // airport is added.
    const { homes, ticked } = homeCandidates(data, anchorOrigin);
    if (!homes.length) return null;
    const live = state?.liveFlights;
    const hours = state?.flightHours || {};
    const paying = groupSize;
    const bagKey = state?.baggage || rule('request.default_bag');
    const nights = plannedNights;
    const option = ({ iata: home, file, row }) => {
      // T855: a flight the trip already holds for a direction (the trip
      // finder's priced leg, handed over by planOf, or the pick the planned
      // trip carries) prices that direction before the exact-day lookup. It
      // keeps its own day (the finder may have priced the swept day nearest
      // the trip's) and its own airport: the finder flies to the gateway's
      // airport, which can differ from the routed anchor's.
      const heldOut = heldLeg(state, 'out', home, first.arriveDate);
      const heldBack = heldLeg(state, 'back', home, last.departDate);
      const inAirport = heldOut?.to || destAnchor(destinations[routed.in_from_id]);
      const outAirport = heldBack?.from || destAnchor(destinations[routed.out_from_id]);
      if (!home || !inAirport || !outAirport) return null;
      const side = (dir, from, to, date) => {
        const held = dir === 'out' ? heldOut : heldBack;
        const fits = held && fitsHours(held.dep, hours[dir] || 'any') && fitsPrefs(held, state?.flightPrefs || null);
        const leg = fits ? heldAsLeg(held) : pickLeg({
          file, live: live?.get?.(`${from}-${to}-${date}`) || null, dir,
          airport: dir === 'out' ? to : from, date, hours: hours[dir] || 'any',
          rank: state?.flightRank || 'price',
          prefs: state?.flightPrefs || null,
        });
        // T713: babies fly on a lap for a fee a leg (party.baby_lap_fee_leg),
        // the same fee Explore's way there adds (party.js flightPerSeat).
        const cost = leg ? legCost(leg, { paying, bagKey }) : null;
        const lap = babies * BABY_LAP_FEE_LEG;
        return leg ? { ...leg, from, to, cost: lap > 0 ? { ...cost, lap, total: cost.total + lap } : cost } : leg;
      };
      const out = ownOut ? null : side('out', home, inAirport, first.arriveDate);
      const back = ownBack ? null : side('back', outAirport, home, last.departDate);
      const access = ticked && row ? accessCost(row, { adults, children, babies, nights }) : null;
      const fare = (out?.cost?.total || 0) + (back?.cost?.total || 0);
      return {
        home, inAirport, outAirport, out, back, access,
        priced: Boolean((ownOut || out?.cost) && (ownBack || back?.cost)),
        total: round2(fare + (access?.eur || 0)),
        queries: [
          { o: home, d: inAirport, date: first.arriveDate },
          { o: outAirport, d: home, date: last.departDate },
        ],
      };
    };
    const options = homes.map(option).filter(Boolean);
    if (!options.length) return null;
    const pick = (anchorOrigin && options.find((o) => o.home === anchorOrigin))
      || options.filter((o) => o.priced).sort((a, b) => a.total - b.total)[0]
      || options[0];
    // The airports beside it, for the trip's flight line: the nearest drive
    // and what each costs door to door (a swap is one tap).
    const airports = ticked ? options.map((o) => ({ iata: o.home, total: o.total, priced: o.priced, access: o.access })) : null;
    return {
      home: pick.home,
      inAirport: pick.inAirport,
      outAirport: pick.outAirport,
      out: pick.out,
      back: pick.back,
      access: pick.access,
      airports,
      nearest: ticked ? homes[0].iata : null,
      pinned: Boolean(anchorOrigin && pick.home === anchorOrigin),
      queries: pick.queries,
    };
  })();

  // ---- Stop to stop -------------------------------------------------------
  const legs = [];
  for (let i = 0; i < stopDetails.length - 1; i++) {
    const a = stopDetails[i].dest;
    const b = stopDetails[i + 1].dest;
    const opts = a && b ? legTransportOptions(a, b, groupSize, { carModel, countryInsights, hasCar: tripHasCar }) : null;
    const own = ownLegs[i];
    const ownEntry = own && OWN_LEG_MODES.has(own.mode) ? (() => {
      const total = Math.max(0, Math.min(99999, Number(own.eur) || 0));
      return {
        eur_pp: round2(total / groupSize), eur_total: round2(total), hours: null, links: [], own: true, note: null,
      };
    })() : null;
    if (!opts || ((opts.no_road || !opts.recommended) && !ownEntry)) {
      legs.push(opts);
      continue;
    }
    const priced = opts.no_road ? {} : scaleModes(opts.modes);
    const modes = ownEntry ? { ...priced, [own.mode]: ownEntry } : priced;
    let mode = modes[legModes[i]] ? legModes[i] : null;
    if (!mode && ownEntry) mode = own.mode;
    if (!mode) mode = pickLegMode(opts, { transportPref, hasCar: tripHasCar });
    const chosen = modes[mode] || modes[opts.recommended] || ownEntry;
    legs.push({
      ...opts,
      no_road: false,
      modes,
      recommended: opts.recommended || own.mode,
      mode,
      hours: chosen.hours,
      ground_eur_per_person: chosen.eur_pp,
      ground_total: chosen.eur_total,
      own: Boolean(chosen.own),
    });
  }

  // ---- Day trips from a base (T843, owner D4 2026-10-29) ----------------
  // A day out from a stop and back the same evening, with no night there:
  // the way there and back by the hop engine's own options (the same mode
  // pick as a hop between stops), for the party. A place with no ground
  // route prices nothing and says so (no_road).
  const dayTrips = [];
  stopDetails.forEach((s, i) => {
    for (const dt of s.dayTrips || []) {
      const to = destinations[dt.destinationId];
      if (!s.dest || !to) continue;
      const opts = legTransportOptions(s.dest, to, groupSize, { carModel, countryInsights, hasCar: tripHasCar });
      const base = { stopIndex: i, destinationId: dt.destinationId, day: dt.day || 1, dest: to };
      if (!opts || opts.no_road || !opts.recommended) {
        dayTrips.push({ ...base, no_road: true, mode: null, hours: null, eur_total: 0 });
        continue;
      }
      const modes = scaleModes(opts.modes);
      const mode = (modes[dt.mode] && dt.mode) || pickLegMode(opts, { transportPref, hasCar: tripHasCar }) || opts.recommended;
      const chosen = modes[mode] || modes[opts.recommended];
      dayTrips.push({
        ...base,
        no_road: false,
        mode,
        road_km: opts.road_km ?? null,
        hours: chosen?.hours ?? null,
        // There and back.
        eur_total: round2(2 * (chosen?.eur_total || 0)),
      });
    }
  });

  // ---- Airport (or arrival point) to the first bed, and back -------------
  let anchorLegs = { in: null, out: null, anchor: null };
  if (flight?.combinable || flight?.in_from_id || flight?.out_from_id) {
    const hasRental = transportPref === 'car';
    const legFor = (a, b, dir) => {
      if (!a || !b) return null;
      const raw = airportTransferOptions(a, b, groupSize, { carModel, hasRental });
      if (!raw || !Object.keys(raw.modes).length) return null;
      const opts = { ...raw, modes: scaleModes(raw.modes) };
      const want = transferMode[dir];
      const mode = want !== 'auto' ? want : opts.recommended;
      const chosen = opts.modes[mode] || opts.modes[opts.recommended] || Object.values(opts.modes)[0];
      return { ...opts, mode: chosen.mode, hours: chosen.hours, ground_eur_per_person: chosen.eur_pp, ground_total: chosen.eur_total, links: chosen.links };
    };
    const inFrom = flight.in_from_id ? destinations[flight.in_from_id] : null;
    const outFrom = flight.out_from_id ? destinations[flight.out_from_id] : null;
    anchorLegs = {
      in: (inFrom && first && flight.in_from_id !== first.destinationId) ? legFor(inFrom, first.dest, 'in') : null,
      out: (outFrom && last && flight.out_from_id !== last.destinationId) ? legFor(last.dest, outFrom, 'out') : null,
      anchor: inFrom || null,
      inCity: inFrom?.city || null,
      outCity: outFrom?.city || null,
    };
  }

  // ---- The runway to the bed, for stops flown straight into --------------
  let flightTransfer = null;
  if ((flight?.combinable || flight?.own) && flight.ground_total > 0) {
    const iso2 = first?.dest?.iso2;
    const fuelByIso = carModel?.fuel_price_by_iso2 || {};
    const petrol = fuelByIso[iso2] ?? carModel?.fuel_price_eur_per_l ?? CAR.fuel_price_eur_per_l;
    const consumption = carModel?.consumption_l_per_100km ?? CAR.consumption_l_per_100km;
    const capacity = carModel?.car_capacity ?? 4;
    const hasRental = transportPref === 'car';
    const kmOf = (eurPp, minutes) => (minutes > 0 ? (minutes / 60) * 42 : Math.max(1, (eurPp || 0) / 0.15));
    const legOf = (eurPp, minutes) => (eurPp > 0
      ? (() => {
        const t = transferModesFromKm(kmOf(eurPp, minutes), groupSize, { petrol, consumption, capacity, hasRental, publicOverride: eurPp });
        return t ? { ...t, modes: scaleModes(t.modes) } : t;
      })()
      : null);
    const inT = legOf(flight.into_ground_eur, flight.into_ground_minutes);
    const outT = legOf(flight.out_ground_eur, flight.out_ground_minutes);
    if (inT || outT) {
      const combined = {};
      for (const k of new Set([...(inT ? Object.keys(inT.modes) : []), ...(outT ? Object.keys(outT.modes) : [])])) {
        if ((inT && !inT.modes[k]) || (outT && !outT.modes[k])) continue;
        const a = inT?.modes[k];
        const b = outT?.modes[k];
        combined[k] = {
          mode: k,
          eur_total: round2((a?.eur_total || 0) + (b?.eur_total || 0)),
          eur_pp: round2((a?.eur_pp || 0) + (b?.eur_pp || 0)),
          hours: round2((a?.hours || 0) + (b?.hours || 0)),
        };
      }
      if (Object.keys(combined).length) {
        const baseRec = (inT || outT).recommended;
        const recommended = combined[baseRec] ? baseRec : Object.keys(combined)[0];
        const pick = (dir) => (transferMode[dir] !== 'auto' && combined[transferMode[dir]] ? transferMode[dir] : recommended);
        const modeIn = pick('in');
        const modeOut = pick('out');
        const inChosen = inT ? inT.modes[modeIn] : null;
        const outChosen = outT ? outT.modes[modeOut] : null;
        flightTransfer = {
          modes: combined, recommended,
          mode: modeIn === modeOut ? modeIn : null,
          mode_in: modeIn, mode_out: modeOut,
          ground_total: round2((inChosen?.eur_total || 0) + (outChosen?.eur_total || 0)),
          // Each direction apart, for the route's own rows (T458).
          in_total: round2(inChosen?.eur_total || 0),
          out_total: round2(outChosen?.eur_total || 0),
          ground_eur_per_person: round2((inChosen?.eur_pp || 0) + (outChosen?.eur_pp || 0)),
          hours: round2((inChosen?.hours || 0) + (outChosen?.hours || 0)),
          minutes: (flight.into_ground_minutes || 0) + (flight.out_ground_minutes || 0),
          estimated: true,
        };
      }
    }
  }

  // ---- Their own car, from their own door --------------------------------
  let driveLegs = null;
  if (transportPref === 'owncar' && stopDetails.length) {
    const home = (carHome && carHome.lat != null ? carHome : null)
      || originHome(data, data?.meta?.selected_origin) || data?.meta?.home || null;
    if (home) {
      const model = { ...(carModel || {}), max_drive_km: CAR.max_drive_km };
      const half = (dest) => {
        if (!dest) return null;
        const rt = drivingEstimate(dest, home, { group_size: seats }, model, data?.meta?.home || null);
        if (!rt) return null;
        return {
          road_km: rt.road_km,
          hours: rt.drive_hours_one_way,
          cars: rt.cars,
          fuel_eur: round2(rt.fuel_total / 2),
          toll_eur: round2(rt.toll_total / 2),
          toll_notes: rt.toll_notes,
          ground_total: round2(rt.total / 2),
          ground_eur_per_person: round2(rt.per_person / 2),
          mode: 'car',
          estimated: true,
        };
      };
      driveLegs = {
        out: half(first.dest),
        home: half(last.dest),
        from: carHome?.name || null,
        own: ownCarCost > 0,
      };
    }
  }

  const carRental = transportPref === 'car' && stopDetails.length
    ? carHire(first.dest?.iso2, Math.max(1, plannedNights), tripStart || first.arriveDate, seats, engineCar)
    : null;

  let vignettes = null;
  const prices = carModel?.toll_model?.vignettes_eur;
  if (prices) {
    const isoSet = new Set();
    legs.forEach((l, i) => {
      if (!l || l.no_road || l.mode !== 'car') return;
      const a = stopDetails[i]?.dest;
      const b = stopDetails[i + 1]?.dest;
      if (a?.iso2) isoSet.add(a.iso2);
      if (b?.iso2) isoSet.add(b.iso2);
    });
    if (transportPref === 'owncar') {
      isoSet.delete(first?.dest?.iso2);
      isoSet.delete(last?.dest?.iso2);
    }
    const items = [...isoSet].filter((iso) => prices[iso] != null).map((iso) => ({ iso2: iso, eur: prices[iso] }));
    if (items.length) {
      const cars = Math.max(1, Math.ceil(seats / Math.max(1, carModel?.car_capacity || CAR.car_capacity)));
      vignettes = { items, cars, eur_total: round2(items.reduce((n, v) => n + v.eur, 0) * cars) };
    }
  }

  // ---- Beds and days, stop by stop ---------------------------------------
  // Each stop is the day price at the stop's own dates (T702): the same
  // engine row Explore and the destination page show, times the seats and
  // the nights. A bed the traveller has booked and typed in replaces Carta's
  // estimate for that stay; the days there stay Carta's.
  // A stop may sleep its own way (T842, owner D2 2026-10-29): its stayTier
  // prices that stop's beds; every other stop keeps the trip's.
  const request = tripRequest(state);
  const stayCosts = stopDetails.map((s) => {
    if (!s.dest) return null;
    const req = s.stayTier ? { ...request, stay: s.stayTier } : request;
    const est = quoteStay(s.dest, s.nights, s.arriveDate, req, destinations);
    const own = paidEur(ownStays?.[s.destinationId]);
    if (!est || !own) return est ? { ...est, ownAccom: false } : est;
    return {
      ...est,
      estAccomTotal: est.accomTotal,
      accomTotal: own,
      ownAccom: true,
      total: round2(own + est.groundTotal),
    };
  });

  // ---- The parts, each once ------------------------------------------------
  const parts = {
    // What they typed for getting there and home (a fare, a ticket, the car).
    travel: round2(flight?.own || flight?.driving ? (flight.cost_total || 0) : 0),
    // Carta's flight for each way they did not type, bags included (T517).
    flights: round2((cartaFlight?.out?.cost?.total || 0) + (cartaFlight?.back?.cost?.total || 0)),
    // T861: home to the airport and back (the drive and parking, or the
    // train), once the traveller has said which airports are in reach.
    airport: round2(cartaFlight?.access?.eur || 0),
    // Runway to bed and bed to runway, plus a named arrival to the first stop.
    transfers: round2(
      ((flight?.combinable || flight?.own) ? (flightTransfer ? flightTransfer.ground_total : (flight.ground_total || 0)) : 0)
      + (anchorLegs.in?.ground_total || 0) + (anchorLegs.out?.ground_total || 0),
    ),
    // Driving there and home in their own car, when they have not typed it.
    drive: round2((ownOut ? 0 : (driveLegs?.out?.ground_total || 0)) + (ownBack ? 0 : (driveLegs?.home?.ground_total || 0))),
    between: round2(legs.reduce((n, l) => n + (l?.ground_total || 0), 0)),
    car: round2((carRental?.eur_total || 0) + (vignettes?.eur_total || 0)),
    daytrips: round2(dayTrips.reduce((n, d) => n + (d.eur_total || 0), 0)),
    beds: round2(stayCosts.reduce((n, s) => n + (s?.accomTotal || 0), 0)),
    days: round2(stayCosts.reduce((n, s) => n + (s?.groundTotal || 0), 0)),
  };
  const grandTotal = round2(Object.values(parts).reduce((n, v) => n + v, 0));

  // The way there and the way home, apart (T432 critique: a fare typed one
  // way made "there and home" read as settled while the way back was not in
  // the total). An older record holds one figure for the pair: `legacy`.
  const travelSplit = (() => {
    const own = flight?.own || flight?.driving;
    if (!own || !ownFlight) return { legacy: false, out: 0, back: 0 };
    if (!split && ownFlight.costTotal > 0) return { legacy: true, out: round2(ownFlight.costTotal), back: 0 };
    return { legacy: false, out: round2(Number(ownFlight.costOut) || 0), back: round2(Number(ownFlight.costBack) || 0) };
  })();

  return {
    stopDetails, plannedNights, windowNights: tripDaysBetween(state?.tripStart, state?.tripEnd),
    routedFlight, flight, cartaFlight, legs, anchorLegs, flightTransfer, driveLegs, carRental, vignettes,
    stayCosts, tripHasCar, groupSize, parts, grandTotal, travelSplit, dayTrips,
    party: { adults, children, babies, head: groupSize, seats, weight },
    request,
    perPerson: round2(grandTotal / groupSize),
  };
}
