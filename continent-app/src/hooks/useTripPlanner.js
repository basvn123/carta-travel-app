import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  tripDaysBetween, accommodationPerPerson, groundSpendPerPerson, DEFAULT_LIFESTYLE, haversineKm,
  drivingEstimate,
} from '../lib/runtime_pricing.js';
import { combineTripLegs, suggestNextStops } from '../lib/trip_planner_pricing.js';
import { legTransportOptions, rentalEstimate, airportTransferOptions, transferModesFromKm, preferredPublicMode } from '../lib/transport.js';
import { originHome } from '../lib/origins.js';
import { cheapestStartDates, reorderSavings } from '../lib/tripCostOptimizer.js';
import { addDays } from '../lib/dates.js';
import { round2 } from '../lib/math.js';
import {
  fetchTripPlanWithStops, createTripPlan, renameTripPlan, saveTripPlanStops,
} from '../auth/tripPlanStorage.js';
import { assignmentsKey, prefsKey, extrasKey, persistAssignments, persistPrefs, persistTripExtras, TRIP_DRAFT_PLAN_ID } from '../planner/dayPlanStore.js';
import { loadRestorableDraft, persistTripDraft, clearTripDraft } from '../planner/tripDraftStore.js';


const DEFAULT_STOP_NIGHTS = 2;

/** Draft-plan state + pricing for the Trip Planner tab.
 *
 *  The traveller first picks the window they want to travel (tripStart,  *  tripEnd), then adds an ordered list of stops, each with a number of nights.
 *  Arrival/departure dates chain automatically from the trip start, so there's
 *  no per-stop date juggling: bumping a stop's nights just shifts everything
 *  after it. Pricing then reuses each destination's own real fare data
 *  (combineTripLegs: fly into the first stop, out of the last) plus an
 *  estimated overland leg between consecutive stops (interCityGroundEstimate).
 */
export function useTripPlanner(data, countryInsights = null) {
  const destinations = data?.destinations || {};
  const carModel = data?.meta?.car_model || null;

  // Restore an unsaved draft (if any) so switching to the Day planner and back
  // never wipes a trip mid-planning.
  const [draft] = useState(() => loadRestorableDraft());

  const [tripStart, setTripStart] = useState(draft?.tripStart || '');
  const [tripEnd, setTripEnd] = useState(draft?.tripEnd || '');
  const [stops, setStops] = useState(draft?.stops || []); // [{ destinationId, nights, activities: string[] }]
  const [groupSize, setGroupSize] = useState(draft?.groupSize || 2);
  // How the traveller wants to get between stops: 'auto' lets Carta pick the
  // best mode per leg, 'car' assumes one rental for the whole trip, 'owncar'
  // means they DRIVE from home in their own car (no flight, no rental - fuel
  // and tolls only), 'public' sticks to trains/buses. Individual legs can
  // still be overridden.
  const [transportPref, setTransportPref] = useState(draft?.transportPref || 'auto');
  const [legModes, setLegModes] = useState(draft?.legModes || {}); // { [legIndex]: 'train'|'bus'|'car' }
  // How the traveller gets from the plane to where they sleep (both the fly-in
  // and fly-home airport transfers): 'auto' lets Carta pick (the rental car
  // they collect at the airport if the trip has one, else public transport),
  // 'public' = airport train/bus/shuttle, 'taxi' = taxi/rideshare, 'rental' =
  // drive the rental. Priced per mode so the total reflects the real choice.
  const [transferMode, setTransferMode] = useState(draft?.transferMode || 'auto');
  const [pace, setPace] = useState(draft?.pace || 'balanced'); // 'relaxed' | 'balanced' | 'packed'
  // Ryanair baggage the traveller expects to book: 'cabin' (free small bag),
  // 'priority' (10 kg cabin bag) or 'checked' (20 kg hold bag). Priced per
  // person per flight leg on top of the seat fare.
  const [baggage, setBaggage] = useState(draft?.baggage || 'cabin');
  // The wizard's chosen fly-in destination. When the first/last stop is a
  // ground-only gem (no routes of its own), flights are priced via this anchor
  // instead, "fly into Bergamo, sleep at Lake Como".
  const [anchorId, setAnchorId] = useState(draft?.anchorId || null);
  // The departure airport (origin IATA) the traveller picked for their fly-in
  // in the wizard. Kept so the overview prices the SAME inbound flight they
  // chose rather than re-deriving a possibly-different origin.
  const [anchorOrigin, setAnchorOrigin] = useState(draft?.anchorOrigin || null);
  // The airport the traveller chose to fly HOME from (the wizard's "Getting
  // home" step, picked after the stays are pinned). When set, the return leg is
  // priced out of this airport instead of the last stop's own airport, and the
  // last-stop -> airport transfer is priced like any other ground leg.
  const [returnAnchorId, setReturnAnchorId] = useState(draft?.returnAnchorId || null);
  // A flight the traveller booked themselves with another airline:
  // { airline, costTotal, outDate?, retDate? } where costTotal is the whole
  // party's total return fare in EUR and the dates are the booked departure /
  // return days. When set, the overview shows THIS instead of pricing a stored
  // fare the traveller isn't taking (see the `flight` memo).
  const [ownFlight, setOwnFlight] = useState(draft?.ownFlight || null);
  // Where an own-car trip starts: { name, lat, lon } typed by the traveller
  // ("where do you drive from?"). Falls back to the selected origin airport's
  // city when unset, so older drafts keep pricing.
  const [carHome, setCarHome] = useState(draft?.carHome || null);
  const [planId, setPlanId] = useState(null);
  const [planLabel, setPlanLabel] = useState(draft?.planLabel || '');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [planned, setPlanned] = useState(draft?.planned || false); // true = show the day-by-day itinerary view

  // Keep the draft stored while planning; drop it once it's empty. Saved plans
  // carry their planId so the next visit knows not to restore them (see
  // loadDraft), the trip itself is safe in the account by then.
  useEffect(() => {
    if (!stops.length && !tripStart && !tripEnd) {
      clearTripDraft();
      return;
    }
    persistTripDraft({
      tripStart, tripEnd, stops, groupSize, transportPref, legModes, transferMode, pace,
      baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, planId, planLabel, planned,
    });
  }, [tripStart, tripEnd, stops, groupSize, transportPref, legModes, transferMode, pace,
      baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, planId, planLabel, planned]);

  // Chain each stop's arrive/depart dates from the trip start. A stop with no
  // trip start yet still carries its nights so the UI can show "2 nights".
  const stopDetails = useMemo(() => {
    let cursor = tripStart;
    return stops.map((s) => {
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
  }, [stops, destinations, tripStart]);

  const plannedNights = useMemo(
    () => stops.reduce((sum, s) => sum + Math.max(0, s.nights || 0), 0),
    [stops],
  );
  const windowNights = useMemo(() => tripDaysBetween(tripStart, tripEnd), [tripStart, tripEnd]);

  const addStop = useCallback((destinationId, nights = DEFAULT_STOP_NIGHTS, activities = []) => {
    setStops((prev) => [...prev, { destinationId, nights, activities }]);
  }, []);

  const setStopActivities = useCallback((index, activities) => {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, activities } : s)));
  }, []);

  const removeStop = useCallback((index) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const setStopNights = useCallback((index, nights) => {
    setStops((prev) => prev.map((s, i) => (
      i === index ? { ...s, nights: Math.max(0, Math.min(60, nights)) } : s
    )));
  }, []);

  const moveStop = useCallback((index, dir) => {
    setStops((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }, []);

  // Move the stop at `from` to sit at position `to` (drag-and-drop reorder).
  const reorderStop = useCallback((from, to) => {
    setStops((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Reorder the stops into an efficient nearest-neighbour route from the first
  // stop (the "let Carta plan this" payoff). Keeps stop 1 as the entry point.
  const optimizeRoute = useCallback(() => {
    setStops((prev) => {
      if (prev.length < 3) return prev;
      const nodes = prev.map((s) => ({ s, dest: destinations[s.destinationId] }));
      if (nodes.some((n) => !n.dest || n.dest.lat == null)) return prev;
      const ordered = [nodes[0]];
      const remaining = nodes.slice(1);
      let cur = nodes[0];
      while (remaining.length) {
        let bi = 0;
        let bd = Infinity;
        remaining.forEach((n, idx) => {
          const km = haversineKm(cur.dest.lat, cur.dest.lon, n.dest.lat, n.dest.lon);
          if (km != null && km < bd) { bd = km; bi = idx; }
        });
        cur = remaining[bi];
        ordered.push(cur);
        remaining.splice(bi, 1);
      }
      return ordered.map((n) => n.s);
    });
    // A new order invalidates per-leg mode overrides (leg N is a new pair).
    setLegModes({});
  }, [destinations]);

  // Wipe the whole draft so the traveller can start over from scratch.
  const clearPlan = useCallback(() => {
    setStops([]);
    setTripStart('');
    setTripEnd('');
    setLegModes({});
    setTransferMode('auto');
    setAnchorId(null);
    setAnchorOrigin(null);
    setReturnAnchorId(null);
    setOwnFlight(null);
    setCarHome(null);
    setPlanId(null);
    setPlanLabel('');
    setPlanned(false);
  }, []);

  // Load a whole itinerary the guided wizard just assembled: a start date, an
  // ordered list of { destinationId, nights, activities }, an optional name,
  // plus how they want to travel (transport) and how full their days should
  // feel (pace), everything stays editable in the planner afterwards.
  const loadFromWizard = useCallback(({ startDate, stops: wizardStops, label, groupSize: gs, transport, pace: wizardPace, baggage: wizardBaggage, anchorId: wizardAnchor, anchorOrigin: wizardAnchorOrigin, returnAnchorId: wizardReturnAnchor, ownFlight: wizardOwnFlight, carHome: wizardCarHome }) => {
    const total = wizardStops.reduce((sum, s) => sum + Math.max(0, s.nights || 0), 0);
    setTripStart(startDate || '');
    setTripEnd(startDate ? addDays(startDate, total) : '');
    setStops(wizardStops.map((s) => ({
      destinationId: s.destinationId,
      nights: Math.max(1, s.nights || 1),
      activities: s.activities || [],
    })));
    // Never clobber a name the traveller already typed ("Bas en Noa" must
    // survive picking France in the wizard), the wizard label is a fallback.
    if (label != null) setPlanLabel((prev) => (prev && prev.trim() ? prev : label));
    if (gs != null) setGroupSize(Math.max(1, Math.min(20, gs)));
    if (transport) setTransportPref(transport);
    if (wizardPace) setPace(wizardPace);
    if (wizardBaggage) setBaggage(wizardBaggage);
    setAnchorId(wizardAnchor || null);
    setAnchorOrigin(wizardAnchorOrigin || null);
    setReturnAnchorId(wizardReturnAnchor || null);
    setOwnFlight(wizardOwnFlight || null);
    setCarHome(wizardCarHome || null);
    setLegModes({});
    setPlanId(null);
    setPlanned(false);
  }, []);

  // Candidate next stops from wherever the itinerary currently ends, ranked to
  // surface the most beautiful/characterful places (see suggestNextStops).
  // Never re-suggests a stop already on the route, nor its country, "next"
  // should open somewhere new.
  const nextStopSuggestions = useMemo(() => {
    const last = stopDetails[stopDetails.length - 1];
    if (!last || !last.dest) return [];
    return suggestNextStops(last.dest, destinations, last.departDate, {
      firstDest: stopDetails[0]?.dest || null,
      excludeIds: new Set(stopDetails.map((s) => s.destinationId)),
      excludeCountries: new Set(stopDetails.map((s) => s.dest?.country).filter(Boolean)),
      transport: transportPref,
    });
  }, [stopDetails, destinations, transportPref]);

  // Real combined flight fare: into the first stop, out of the last stop.
  // Stops with no fares of their own (ground-only gems) price via the wizard's
  // fly-in anchor when one is set.
  const flight = useMemo(() => {
    // Driving there in their own car: there is no flight to price at all.
    // `driving` marks it so the overview/receipt render drive legs instead of
    // ever showing a Ryanair fare for a trip nobody flies.
    if (transportPref === 'owncar') return { driving: true };
    // Booked with another airline: show what the traveller told us, never a
    // Ryanair fare. `own` marks it so every surface (overview, receipt, export)
    // renders the airline + their entered cost instead of the Ryanair rows.
    if (ownFlight) {
      return {
        own: true,
        airline: ownFlight.airline || '',
        cost_total: round2(ownFlight.costTotal || 0),
        out_date: ownFlight.outDate || null,
        ret_date: ownFlight.retDate || null,
      };
    }
    const first = stopDetails[0];
    const last = stopDetails[stopDetails.length - 1];
    if (!first?.dest || !last?.dest) return null;
    const anchorDest = anchorId ? destinations[anchorId] : null;
    const returnDest = returnAnchorId ? destinations[returnAnchorId] : null;
    const hasRoutes = (d) => d && Object.keys(d.routes || {}).length > 0;
    // Home leg: out of the airport the traveller PICKED for the return (its own
    // step), else the last stop's own airport, else the arrival anchor for a
    // ground-only final gem.
    const outDest = hasRoutes(returnDest)
      ? returnDest
      : (hasRoutes(last.dest) ? last.dest : (anchorDest || last.dest));
    // Tag the resolved fly-from / fly-into airports so the ground transfers to
    // reach them (anchorLegs) are priced whenever they differ from the stop.
    const withIds = (priced, inDest) => ({
      ...priced,
      in_from_id: inDest?.id ?? null,
      out_from_id: outDest?.id ?? null,
    });
    // Inbound: honour the exact fly-in the traveller picked in the wizard, price
    // into the SAME airport (anchorDest) from the SAME origin (anchorOrigin) so
    // the overview shows the flight they chose, not a re-derived one. Fall back
    // to the first stop's own airport only when the anchor can't be combined
    // with the home leg (keeps otherwise-unpriceable trips priced).
    if (anchorDest) {
      const viaAnchor = combineTripLegs(anchorDest, first.arriveDate, outDest, last.departDate, groupSize, baggage, anchorOrigin);
      if (viaAnchor.combinable) return withIds(viaAnchor, anchorDest);
    }
    const inDest = hasRoutes(first.dest) ? first.dest : (anchorDest || first.dest);
    return withIds(combineTripLegs(inDest, first.arriveDate, outDest, last.departDate, groupSize, baggage, anchorOrigin), inDest);
  }, [stopDetails, groupSize, anchorId, anchorOrigin, returnAnchorId, destinations, baggage, ownFlight, transportPref]);

  // Priced transport options (train / bus / car with booking links) between
  // each consecutive pair of stops, resolved to a chosen mode: an explicit
  // per-leg override wins, then the trip-wide preference, then Carta's pick.
  // Whether the trip actually has a car on the ground (a rental, or the
  // traveller's own car driven from home) - it decides both the leg
  // recommendation (no phantom cars) and the rental line.
  const tripHasCar = transportPref === 'car' || transportPref === 'owncar';

  const legs = useMemo(() => {
    const out = [];
    for (let i = 0; i < stopDetails.length - 1; i++) {
      const a = stopDetails[i].dest;
      const b = stopDetails[i + 1].dest;
      const opts = a && b ? legTransportOptions(a, b, groupSize, { carModel, countryInsights, hasCar: tripHasCar }) : null;
      if (!opts || opts.no_road || !opts.recommended) {
        out.push(opts);
        continue;
      }
      let mode = legModes[i] || null;
      if (!mode) {
        if (tripHasCar) mode = 'car';
        else if (transportPref === 'public') {
          // Train vs bus: the same country-profile-aware pick the leg engine
          // recommends (rail-quality bonus and all), restricted to public modes.
          mode = preferredPublicMode(opts) || 'bus';
        } else mode = opts.recommended;
      }
      const chosen = opts.modes[mode] || opts.modes[opts.recommended];
      out.push({
        ...opts,
        mode,
        hours: chosen.hours,
        ground_eur_per_person: chosen.eur_pp,
        ground_total: chosen.eur_total,
      });
    }
    return out;
  }, [stopDetails, groupSize, carModel, countryInsights, transportPref, tripHasCar, legModes]);

  const setLegMode = useCallback((index, mode) => {
    setLegModes((prev) => ({ ...prev, [index]: mode }));
  }, []);

  // The wizard's anchor prices the FLIGHT when the first/last stop has no
  // fares of its own ("fly into Bergamo, sleep at Lake Como"), but getting
  // from that airport city to the first stop (and back at the end) is a real
  // overland journey that used to be silently absent from both the itinerary
  // and the total. Price it like any other leg.
  const anchorLegs = useMemo(() => {
    const none = { in: null, out: null, anchor: null };
    if (!flight?.combinable) return none;
    // You've just flown in, so this hop is an AIRPORT TRANSFER, not an inter-city
    // drive: public transport, a taxi, or the rental you collect at the airport,
    // never your own car with tolls (which is what the generic leg engine used
    // to recommend, and why it read as "you drive from the airport").
    const hasRental = transportPref === 'car';
    const legFor = (a, b) => {
      if (!a || !b) return null;
      const opts = airportTransferOptions(a, b, groupSize, { carModel, hasRental });
      if (!opts || !Object.keys(opts.modes).length) return null;
      const mode = transferMode !== 'auto' ? transferMode : opts.recommended;
      const chosen = opts.modes[mode] || opts.modes[opts.recommended] || Object.values(opts.modes)[0];
      return { ...opts, mode: chosen.mode, hours: chosen.hours, ground_eur_per_person: chosen.eur_pp, ground_total: chosen.eur_total, links: chosen.links };
    };
    const first = stopDetails[0];
    const last = stopDetails[stopDetails.length - 1];
    // The airports the round flight actually uses (from the flight pricing).
    // When either differs from the stop it serves, the airport<->stop transfer
    // is a real journey - price it so it shows up in the itinerary and total.
    // Covers "fly into Bergamo, sleep at Como" AND "fly home from a different
    // airport near your last stop".
    const inFrom = flight.in_from_id ? destinations[flight.in_from_id] : null;
    const outFrom = flight.out_from_id ? destinations[flight.out_from_id] : null;
    return {
      in: (inFrom && flight.in_from_id !== first.destinationId) ? legFor(inFrom, first.dest) : null,
      out: (outFrom && flight.out_from_id !== last.destinationId) ? legFor(last.dest, outFrom) : null,
      anchor: inFrom || null,
      // The airport cities each transfer connects to. The fly-in and fly-home
      // airports can differ (you fly home from near your last stop), so the
      // itinerary labels each transfer with its own airport, not a shared one.
      inCity: inFrom?.city || null,
      outCity: outFrom?.city || null,
    };
  }, [flight, destinations, stopDetails, groupSize, carModel, transportPref, transferMode]);

  // The airport <-> stay transfers folded into the flight (stops you fly
  // STRAIGHT into): the stored fare is a public-transport (bus/shuttle)
  // estimate, so offer the same taxi / rental alternatives the anchor legs do
  // and let the chosen transferMode drive the total, so "how you get from the
  // plane to your bed" is a real, priced choice, not a hidden assumption.
  const flightTransfer = useMemo(() => {
    if (!flight?.combinable || !(flight.ground_total > 0)) return null;
    const iso2 = stopDetails[0]?.dest?.iso2;
    const fuelByIso = carModel?.fuel_price_by_iso2 || {};
    const petrol = fuelByIso[iso2] ?? carModel?.fuel_price_eur_per_l ?? 1.8;
    const consumption = carModel?.consumption_l_per_100km ?? 6.5;
    const capacity = carModel?.car_capacity ?? 4;
    const hasRental = transportPref === 'car';
    // Approximate the hop distance from the stored transfer: its minutes when we
    // have them, otherwise back the km out of the ~0.15 EUR/km public fare.
    const kmOf = (eurPp, minutes) => (minutes > 0 ? (minutes / 60) * 42 : Math.max(1, (eurPp || 0) / 0.15));
    const legOf = (eurPp, minutes) => (eurPp > 0
      ? transferModesFromKm(kmOf(eurPp, minutes), groupSize, { petrol, consumption, capacity, hasRental, publicOverride: eurPp })
      : null);
    const inT = legOf(flight.into_ground_eur, flight.into_ground_minutes);
    const outT = legOf(flight.out_ground_eur, flight.out_ground_minutes);
    if (!inT && !outT) return null;
    // Combine the fly-in and fly-home hops into one figure per mode, keeping
    // only modes BOTH legs support so a total is never half-priced.
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
    if (!Object.keys(combined).length) return null;
    const baseRec = (inT || outT).recommended;
    const recommended = combined[baseRec] ? baseRec : Object.keys(combined)[0];
    const mode = transferMode !== 'auto' ? transferMode : recommended;
    const chosen = combined[mode] || combined[recommended];
    return {
      modes: combined, recommended, mode: chosen.mode,
      ground_total: chosen.eur_total, ground_eur_per_person: chosen.eur_pp, hours: chosen.hours,
      minutes: (flight.into_ground_minutes || 0) + (flight.out_ground_minutes || 0),
      estimated: true,
    };
  }, [flight, stopDetails, groupSize, carModel, transportPref, transferMode]);

  // Own-car trips start and end at the traveller's door, not an airport: the
  // drive out (home -> first stop) and the drive home (last stop -> home) are
  // real, priced legs. Halves of drivingEstimate's round trip, so they reuse
  // the toll layer's real per-corridor rates (vignettes, peage) where mapped.
  // The Map tab's max_drive_km cap ("is driving a realistic alternative to a
  // flight?") is lifted: the traveller already chose to drive.
  const driveLegs = useMemo(() => {
    if (transportPref !== 'owncar' || !stopDetails.length) return null;
    // The traveller's own "driving from" answer wins; the selected origin
    // airport's city is only the fallback for drafts predating that question.
    const home = (carHome && carHome.lat != null ? carHome : null)
      || originHome(data, data?.meta?.selected_origin) || data?.meta?.home || null;
    if (!home) return null;
    const model = { ...(carModel || {}), max_drive_km: 4000 };
    const half = (dest) => {
      if (!dest) return null;
      const rt = drivingEstimate(dest, home, { group_size: groupSize }, model);
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
    return {
      out: half(stopDetails[0].dest),
      home: half(stopDetails[stopDetails.length - 1].dest),
      from: carHome?.name || null,
    };
  }, [transportPref, stopDetails, data, carModel, groupSize, carHome]);

  // One rental car for the whole trip (only priced into the total when the
  // traveller chose 'car'; per-leg car choices only pay fuel + tolls since a
  // trip mixing modes usually means point rentals or rideshares).
  const carRental = useMemo(() => {
    if (transportPref !== 'car' || !stopDetails.length) return null;
    const days = Math.max(1, plannedNights);
    const iso2 = stopDetails[0].dest?.iso2;
    // groupSize matters: 7 people need 2 cars, and the "whole group" label on
    // this line must actually cover the whole group.
    return rentalEstimate(carModel, iso2, days, tripStart || stopDetails[0].arriveDate, groupSize);
  }, [transportPref, stopDetails, plannedNights, carModel, tripStart, groupSize]);

  // Vignette countries (AT, CH, SI, CZ, SK, HU, RO, BG) charge a windscreen
  // sticker instead of per-km tolls, so car legs there price EUR 0 toll. Bill
  // each country's sticker ONCE per trip, one per car, for the countries the
  // chosen car legs touch. Own-car trips already pay the home<->trip corridor's
  // vignettes inside the drive legs (drivingEstimate's toll layer), so the
  // first/last stop's countries are excluded there to avoid double-billing.
  const vignettes = useMemo(() => {
    const prices = carModel?.toll_model?.vignettes_eur;
    if (!prices) return null;
    const isoSet = new Set();
    legs.forEach((l, i) => {
      if (!l || l.no_road || l.mode !== 'car') return;
      const a = stopDetails[i]?.dest;
      const b = stopDetails[i + 1]?.dest;
      if (a?.iso2) isoSet.add(a.iso2);
      if (b?.iso2) isoSet.add(b.iso2);
    });
    if (transportPref === 'owncar') {
      isoSet.delete(stopDetails[0]?.dest?.iso2);
      isoSet.delete(stopDetails[stopDetails.length - 1]?.dest?.iso2);
    }
    const items = [...isoSet]
      .filter((iso) => prices[iso] != null)
      .map((iso) => ({ iso2: iso, eur: prices[iso] }));
    if (!items.length) return null;
    const cars = Math.max(1, Math.ceil(groupSize / Math.max(1, carModel?.car_capacity || 4)));
    return {
      items,
      cars,
      eur_total: round2(items.reduce((n, v) => n + v.eur, 0) * cars),
    };
  }, [legs, stopDetails, transportPref, carModel, groupSize]);

  // Accommodation + on-the-ground spend per stop (default lifestyle, the full
  // sliders live in the Map tab's Lifestyle panel; a trip spanning several
  // destinations isn't the place to re-tune per-stop dining habits in v1).
  const stayCosts = useMemo(() => stopDetails.map((s) => {
    if (!s.dest) return null;
    // A 0-night pass-through stop books nothing, without this gate the
    // accommodation model still charges its cleaning + service fee.
    const accom = s.nights > 0 ? accommodationPerPerson(s.dest, s.nights, s.arriveDate, null, groupSize) : null;
    const ground = groundSpendPerPerson(s.dest, s.nights, DEFAULT_LIFESTYLE);
    const accomTotal = round2((accom ? accom.total : 0) * groupSize);
    const groundTotal = round2((ground ? ground.total : 0) * groupSize);
    return { accom, ground, accomTotal, groundTotal, total: round2(accomTotal + groundTotal) };
  }), [stopDetails, groupSize]);

  const grandTotal = useMemo(() => {
    let total = 0;
    if (flight?.combinable) {
      // The airport transfer is priced by the chosen mode (flightTransfer),
      // not the raw stored public fare, so the total reflects taxi/rental too.
      const transfer = flightTransfer ? flightTransfer.ground_total : (flight.ground_total || 0);
      total += flight.fare_total + transfer + (flight.bag_total || 0);
    } else if (flight?.own) total += flight.cost_total || 0;
    if (driveLegs?.out?.ground_total) total += driveLegs.out.ground_total;
    if (driveLegs?.home?.ground_total) total += driveLegs.home.ground_total;
    legs.forEach((l) => { if (l && l.ground_total) total += l.ground_total; });
    if (anchorLegs.in?.ground_total) total += anchorLegs.in.ground_total;
    if (anchorLegs.out?.ground_total) total += anchorLegs.out.ground_total;
    stayCosts.forEach((s) => { if (s) total += s.total; });
    if (carRental) total += carRental.eur_total;
    if (vignettes) total += vignettes.eur_total;
    return round2(total);
  }, [flight, flightTransfer, driveLegs, legs, anchorLegs, stayCosts, carRental, vignettes]);

  // "Take this trip cheaper", the same itinerary on cheaper flight dates
  // (real stored fares only), and a cheaper stop ORDER when reordering
  // meaningfully shortens the overland route.
  const cheaperDates = useMemo(() => {
    // No flights on an own-car trip, so there are no cheaper fare dates to find.
    if (stops.length === 0 || plannedNights <= 0 || transportPref === 'owncar') {
      return { candidates: [], current_total: null };
    }
    return cheapestStartDates(stops, destinations, plannedNights, groupSize, tripStart);
  }, [stops, destinations, plannedNights, groupSize, tripStart, transportPref]);

  const cheaperOrder = useMemo(
    () => reorderSavings(stops, destinations, groupSize, {
      carModel, countryInsights, hasCar: tripHasCar,
    }),
    [stops, destinations, groupSize, carModel, countryInsights, tripHasCar],
  );

  // Shift the whole trip to a cheaper start date, keeping stops + nights.
  const applyStartDate = useCallback((startIso) => {
    setTripStart(startIso);
    setTripEnd(addDays(startIso, Math.max(1, plannedNights)));
  }, [plannedNights]);

  // Apply the cheaper stop order suggested by reorderSavings.
  const applyCheaperOrder = useCallback(() => {
    if (!cheaperOrder) return;
    const byId = new Map(stops.map((s) => [s.destinationId, s]));
    setStops(cheaperOrder.ordered_ids.map((id) => byId.get(id)).filter(Boolean));
    setLegModes({});
  }, [cheaperOrder, stops]);

  // Continuous day-by-day itinerary: one entry per day on the ground, tagged
  // with the city you're staying in and that day's share of its chosen
  // attractions (spread round-robin across the stay). Powers the Overview /
  // Day 1 / Day 2 ... view once the trip is "planned".
  const dayPlan = useMemo(() => {
    // A day can only honestly hold so many highlights, keep each day light
    // (by pace) and hand the fine-tuning to the Day planner instead of
    // cramming five sights into every date.
    const perDayCap = { relaxed: 2, balanced: 3, packed: 4 }[pace] || 3;
    const days = [];
    let dayNum = 1;
    stopDetails.forEach((s, stopIndex) => {
      const nDays = Math.max(1, s.nights);
      const acts = s.activities || [];
      const buckets = Array.from({ length: nDays }, () => []);
      acts.forEach((a, ai) => buckets[ai % nDays].push(a));
      for (let di = 0; di < nDays; di++) {
        days.push({
          dayNum: dayNum++,
          dayOfStay: di + 1,
          staysOfCity: nDays,
          date: s.arriveDate ? addDays(s.arriveDate, di) : '',
          stop: s,
          stopIndex,
          activities: buckets[di].slice(0, perDayCap),
          overflowCount: Math.max(0, buckets[di].length - perDayCap),
        });
      }
    });
    return days;
  }, [stopDetails, pace]);

  const loadPlan = useCallback(async (tripPlanId) => {
    const plan = await fetchTripPlanWithStops(tripPlanId);
    const sorted = (plan.stops || []).slice();
    setPlanId(plan.id);
    setPlanLabel(plan.label || '');
    // Reconstruct the trip window + per-stop nights from the stored dates.
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    setTripStart(first?.arrive_date || '');
    setTripEnd(last?.depart_date || '');
    setStops(sorted.map((s) => ({
      destinationId: s.destination_id,
      nights: tripDaysBetween(s.arrive_date, s.depart_date) || DEFAULT_STOP_NIGHTS,
      activities: Array.isArray(s.choices?.activities) ? s.choices.activities : [],
    })));
    setAnchorId(sorted[0]?.choices?.anchorId || null);
    setAnchorOrigin(sorted[0]?.choices?.anchorOrigin || null);
    setReturnAnchorId(sorted[0]?.choices?.returnAnchorId || null);
    setOwnFlight(sorted[0]?.choices?.ownFlight || null);
    setCarHome(sorted[0]?.choices?.carHome || null);
    setBaggage(sorted[0]?.choices?.baggage || 'cabin');
    // Pricing inputs must round-trip too, otherwise a reopened trip is repriced
    // with whatever the hook currently holds (default 2 travellers) instead of
    // the saved party size/pace, and the headline total comes out wrong.
    setGroupSize(sorted[0]?.choices?.groupSize || 2);
    setTransportPref(sorted[0]?.choices?.transportPref || 'auto');
    setTransferMode(sorted[0]?.choices?.transferMode || 'auto');
    setPace(sorted[0]?.choices?.pace || 'balanced');
    setLegModes({});
    setPlanned(false);
  }, []);

  const savePlan = useCallback(async (userId) => {
    if (!userId || stops.length < 1) return null;
    setSaveState('saving');
    try {
      const id = planId || await createTripPlan(userId, planLabel || null);
      // Renames of an already-saved trip must stick too, not just first saves.
      if (planId) await renameTripPlan(id, planLabel || null);
      await saveTripPlanStops(id, userId, stopDetails.map((s, i) => {
        const isLast = i === stopDetails.length - 1;
        return {
          destinationId: s.destinationId,
          city: s.dest?.city,
          country: s.dest?.country,
          arriveDate: s.arriveDate,
          departDate: s.departDate,
          transportMode: isLast ? 'flight' : 'ground_estimate',
          transportNotes: isLast ? flight : legs[i],
          choices: {
            nights: s.nights,
            groupSize,
            activities: s.activities || [],
            ...(i === 0 ? { baggage, transportPref, transferMode, pace, ...(anchorId ? { anchorId } : {}), ...(anchorOrigin ? { anchorOrigin } : {}), ...(returnAnchorId ? { returnAnchorId } : {}), ...(ownFlight ? { ownFlight } : {}), ...(carHome ? { carHome } : {}) } : {}),
          },
        };
      }));
      // Day-planner work done against the unsaved draft moves with the trip:
      // re-key its picks/preferences from the draft id to the real plan id.
      // Through the store's persist functions (not raw setItem) so the move
      // also reaches account sync: the draft id never syncs, the real id must.
      if (!planId && typeof window !== 'undefined') {
        try {
          const picks = window.localStorage.getItem(assignmentsKey(TRIP_DRAFT_PLAN_ID));
          if (picks != null) {
            persistAssignments(id, JSON.parse(picks));
            window.localStorage.removeItem(assignmentsKey(TRIP_DRAFT_PLAN_ID));
          }
          const prefs = window.localStorage.getItem(prefsKey(TRIP_DRAFT_PLAN_ID));
          if (prefs != null) {
            persistPrefs(id, JSON.parse(prefs));
            window.localStorage.removeItem(prefsKey(TRIP_DRAFT_PLAN_ID));
          }
          const extras = window.localStorage.getItem(extrasKey(TRIP_DRAFT_PLAN_ID));
          if (extras != null) {
            persistTripExtras(id, JSON.parse(extras));
            window.localStorage.removeItem(extrasKey(TRIP_DRAFT_PLAN_ID));
          }
        } catch { /* private mode */ }
      }
      setPlanId(id);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      return id;
    } catch (e) {
      setSaveState('idle');
      throw e;
    }
  }, [planId, planLabel, stops, stopDetails, groupSize, legs, flight, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, baggage, transportPref, transferMode, pace]);

  return {
    tripStart, setTripStart, tripEnd, setTripEnd,
    stops, stopDetails, plannedNights, windowNights,
    groupSize, setGroupSize,
    transportPref, setTransportPref, transferMode, setTransferMode, pace, setPace, setLegMode, carRental,
    // The raw share-link ingredients (the same fields the draft persists).
    anchorId, anchorOrigin, returnAnchorId, legModes,
    cheaperDates, cheaperOrder, applyStartDate, applyCheaperOrder,
    addStop, removeStop, setStopNights, setStopActivities, moveStop, reorderStop,
    optimizeRoute, clearPlan, loadFromWizard,
    nextStopSuggestions, flight, legs, anchorLegs, flightTransfer, driveLegs, stayCosts, grandTotal, dayPlan,
    vignettes, tripHasCar,
    baggage, setBaggage,
    ownFlight, setOwnFlight,
    carHome, setCarHome,
    planned, setPlanned,
    planId, planLabel, setPlanLabel, saveState, savePlan, loadPlan,
  };
}
