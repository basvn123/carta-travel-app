/**
 * tripTotal.js, the one price of a planned trip (T432).
 *
 * The wizard's running estimate and the planned trip's total used to be two
 * sums over two sets of inputs: the wizard left out the airport transfers the
 * planner added, the planner dropped a car cost the wizard counted, and the
 * two read the Lifestyle from different places. The same Albania week read
 * 556.48 on the last wizard step and 676.48 one tap later.
 *
 * Now there is one function. `priceTrip(state, ctx)` takes the planner's own
 * state (the shape useTripPlanner holds and persists) and returns every priced
 * part of the trip plus its total. useTripPlanner calls it for the planned
 * view; the wizard builds the state it is about to hand over through
 * `wizardPlannerState()` (the same transform loadFromWizard applies) and calls
 * it too, so the figure on every step IS the figure the planned trip shows.
 *
 * Pure: no React, no i18n, so tests/tripTotal.test.mjs can price trips in
 * node and assert the wizard and the planner agree.
 */
import {
  tripDaysBetween, DEFAULT_LIFESTYLE, drivingEstimate,
} from './runtime_pricing.js';
import {
  combineTripLegs, ownFlightTransfers, stopStayCost, pickLegMode,
} from './trip_planner_pricing.js';
import {
  legTransportOptions, rentalEstimate, airportTransferOptions, transferModesFromKm,
} from './transport.js';
import { originHome, destAnchor } from './origins.js';
import { pickLeg, legCost } from './flights/flights.js';
import { addDays } from './dates.js';
import { round2 } from './math.js';
import { rule } from './price/config.js';

const CAR = rule('car.model');   // T691: the one car model's fallbacks

// A hop the traveller paid for themselves. An own entry replaces the estimate
// for that mode and leaves the other modes priced, so switching back is one tap.
export const OWN_LEG_MODES = new Set(['fly', 'ferry', 'train', 'bus', 'car']);

/** The largest party the planner prices. The wizard caps its steppers here
 *  too, so a party never shrinks at the hand-over. */
export const MAX_PARTY = rule('party.limits').max_seats;

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
 *          liveFlights: Map from useLiveFlights() }
 * ctx.data.flights is the home airport's swept flight file (T517).
 * ctx:   { data, countryInsights }
 */
export function priceTrip(state, { data = null, countryInsights = null } = {}) {
  const destinations = data?.destinations || NO_DESTINATIONS;
  const carModel = data?.meta?.car_model || null;
  const {
    stops = [], tripStart = '', transportPref = 'auto', legModes = {}, ownLegs = {},
    ownStays = {}, anchorId = null, anchorOrigin = null,
    returnAnchorId = null, ownFlight = null, carHome = null, stayTier = 'home',
  } = state || {};
  // The party (T458): everyone 12 and over counts as an adult; children 3 to
  // 11 share the rooms, eat about half and ride public transport at about
  // half fare, so they count half on beds, meals and public fares; babies
  // 0 to 2 travel free. Cars are priced per car and need a seat for everyone.
  // `groupSize` (the head count Carta prices beds and legs for) is adults
  // plus children; `weight` scales what children pay half of.
  const adults = Math.max(1, Math.min(MAX_PARTY, Math.round(state?.groupSize || 1)));
  const children = Math.max(0, Math.min(MAX_PARTY - adults, Math.round(state?.children || 0)));
  const babies = Math.max(0, Math.min(MAX_PARTY - adults - children, Math.round(state?.babies || 0)));
  const groupSize = adults + children;
  const seats = groupSize + babies;
  const weight = groupSize > 0 ? (adults + children * 0.5) / groupSize : 1;
  const PUBLIC = new Set(['train', 'bus', 'ferry', 'public']);
  const halfFor = (mode, eur) => round2(PUBLIC.has(mode) ? eur * weight : eur);
  const scaleModes = (modes) => Object.fromEntries(Object.entries(modes || {}).map(([k, v]) => [
    k, v && !v.own ? { ...v, eur_total: halfFor(k, v.eur_total), eur_pp: v.eur_pp } : v,
  ]));
  const lifestyle = state?.lifestyle || DEFAULT_LIFESTYLE;
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
    const home = anchorOrigin || data?.meta?.selected_origin || null;
    const inAirport = destAnchor(destinations[routed.in_from_id]);
    const outAirport = destAnchor(destinations[routed.out_from_id]);
    if (!home || !inAirport || !outAirport) return null;
    const file = data?.flights?.from === home ? data.flights : null;
    const live = state?.liveFlights;
    const hours = state?.flightHours || {};
    const paying = groupSize;
    const bagKey = state?.baggage || 'small';
    const side = (dir, from, to, date) => {
      const leg = pickLeg({
        file, live: live?.get?.(`${from}-${to}-${date}`) || null, dir,
        airport: dir === 'out' ? to : from, date, hours: hours[dir] || 'any',
        rank: state?.flightRank || 'price',
      });
      return leg ? { ...leg, from, to, cost: legCost(leg, { paying, bagKey }) } : leg;
    };
    return {
      home,
      inAirport,
      outAirport,
      out: ownOut ? null : side('out', home, inAirport, first.arriveDate),
      back: ownBack ? null : side('back', outAirport, home, last.departDate),
      queries: [
        { o: home, d: inAirport, date: first.arriveDate },
        { o: outAirport, d: home, date: last.departDate },
      ],
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
        const rt = drivingEstimate(dest, home, { group_size: seats }, model);
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
    ? rentalEstimate(carModel, first.dest?.iso2, Math.max(1, plannedNights), tripStart || first.arriveDate, seats)
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
  // A bed the traveller has booked and typed in replaces Carta's estimate for
  // that stay; the days there stay Carta's.
  const stayCosts = stopDetails.map((s) => {
    if (!s.dest) return null;
    const raw = stopStayCost(s.dest, s.nights, s.arriveDate, { groupSize, stayTier, lifestyle });
    const est = raw && weight !== 1 ? (() => {
      const accomTotal = round2(raw.accomTotal * weight);
      const groundTotal = round2(raw.groundTotal * weight);
      return { ...raw, accomTotal, groundTotal, total: round2(accomTotal + groundTotal) };
    })() : raw;
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
    // Runway to bed and bed to runway, plus a named arrival to the first stop.
    transfers: round2(
      ((flight?.combinable || flight?.own) ? (flightTransfer ? flightTransfer.ground_total : (flight.ground_total || 0)) : 0)
      + (anchorLegs.in?.ground_total || 0) + (anchorLegs.out?.ground_total || 0),
    ),
    // Driving there and home in their own car, when they have not typed it.
    drive: round2((ownOut ? 0 : (driveLegs?.out?.ground_total || 0)) + (ownBack ? 0 : (driveLegs?.home?.ground_total || 0))),
    between: round2(legs.reduce((n, l) => n + (l?.ground_total || 0), 0)),
    car: round2((carRental?.eur_total || 0) + (vignettes?.eur_total || 0)),
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
    stayCosts, tripHasCar, groupSize, parts, grandTotal, travelSplit,
    party: { adults, children, babies, head: groupSize, seats, weight },
    perPerson: round2(grandTotal / groupSize),
  };
}

/**
 * The trip's receipt lines in one fixed order, each marked for what it is:
 * 'est' a Carta estimate, 'yours' a figure the traveller typed, 'flight'
 * Google Flights' price with its airline and check time (`leg`), 'missing'
 * a way there or home nobody has priced yet (no flight found, or not flown).
 * Every screen and the PDF render these lines; none adds its own.
 */
export function tripLines(priced) {
  if (!priced) return [];
  const { parts, flight, legs, stayCosts, driveLegs, cartaFlight } = priced;
  const tr = priced.travelSplit || { legacy: false, out: 0, back: 0 };
  const lines = [];
  if (tr.legacy) {
    lines.push({ key: 'travel', eur: tr.out, kind: 'yours' });
    if (flight?.driving && parts.drive > 0) lines.push({ key: 'drive', eur: parts.drive, kind: 'est' });
  } else {
    for (const dir of ['out', 'back']) {
      const paid = tr[dir];
      const est = flight?.driving ? (dir === 'out' ? driveLegs?.out?.ground_total : driveLegs?.home?.ground_total) || 0 : 0;
      const carta = cartaFlight?.[dir];
      if (paid > 0) lines.push({ key: dir, eur: paid, kind: 'yours' });
      else if (carta?.cost) lines.push({ key: dir, eur: carta.cost.total, kind: 'flight', leg: carta });
      else if (est > 0) lines.push({ key: dir, eur: est, kind: 'est' });
      else lines.push({ key: dir, eur: 0, kind: 'missing' });
    }
  }
  if (parts.transfers > 0) lines.push({ key: 'transfers', eur: parts.transfers, kind: 'est' });
  if (parts.between > 0 || legs.some(Boolean)) {
    const legRows = legs.filter((l) => l && l.ground_total != null);
    const allOwn = legRows.length > 0 && legRows.every((l) => l.own);
    const someOwn = legRows.some((l) => l.own);
    lines.push({ key: 'between', eur: parts.between, kind: allOwn ? 'yours' : 'est', mixed: someOwn && !allOwn });
  }
  if (parts.car > 0) lines.push({ key: 'car', eur: parts.car, kind: 'est' });
  const bedRows = stayCosts.filter(Boolean);
  const bedsOwn = bedRows.length > 0 && bedRows.every((s) => s.ownAccom);
  lines.push({ key: 'beds', eur: parts.beds, kind: bedsOwn ? 'yours' : 'est', mixed: !bedsOwn && bedRows.some((s) => s.ownAccom) });
  lines.push({ key: 'days', eur: parts.days, kind: 'est' });
  return lines;
}

/**
 * How many of the trip's prices the traveller has settled with their own
 * figure: the way there and home, each hop between stops, each bed. The
 * readiness line reads it ("3 of 5 prices are yours").
 */
export function tripReadiness(priced) {
  if (!priced) return { yours: 0, of: 0 };
  let of = 0;
  let yours = 0;
  const tr = priced.travelSplit || {};
  if (tr.legacy) { of += 1; yours += 1; } else {
    of += 2;
    if (tr.out > 0) yours += 1;
    if (tr.back > 0) yours += 1;
  }
  priced.legs.forEach((l) => { if (!l || l.no_road) return; of += 1; if (l.own) yours += 1; });
  priced.stayCosts.forEach((s) => { if (!s) return; of += 1; if (s.ownAccom) yours += 1; });
  return { yours, of };
}

/**
 * The planner state a wizard hand-over becomes: exactly what loadFromWizard
 * applies, as a pure transform, so the wizard can price the trip it is about
 * to hand over with the same function the planned view uses.
 */
export function wizardPlannerState(payload, { stayTier = 'home', lifestyle = null } = {}) {
  const p = payload || {};
  const stops = (p.stops || []).map((s) => ({
    destinationId: s.destinationId,
    nights: Math.max(1, s.nights || 1),
    activities: s.activities || [],
  }));
  const total = stops.reduce((sum, s) => sum + s.nights, 0);
  return {
    tripStart: p.startDate || '',
    tripEnd: p.startDate ? addDays(p.startDate, total) : '',
    stops,
    groupSize: Math.max(1, Math.min(MAX_PARTY, p.groupSize || 1)),
    children: Math.max(0, p.children || 0),
    babies: Math.max(0, p.babies || 0),
    transportPref: p.transport || 'auto',
    pace: p.pace || 'balanced',
    baggage: p.baggage || 'cabin',
    anchorId: p.anchorId || null,
    anchorOrigin: p.anchorOrigin || null,
    returnAnchorId: p.returnAnchorId || null,
    ownFlight: p.ownFlight || null,
    carHome: p.carHome || null,
    legModes: p.legModes || {},
    ownLegs: p.ownLegs || {},
    ownStays: p.ownStays || {},
    transferMode: { in: 'auto', out: 'auto' },
    stayTier,
    lifestyle,
  };
}
