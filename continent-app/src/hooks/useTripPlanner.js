import { useState, useMemo, useCallback, useEffect } from 'react';
import { tripDaysBetween, DEFAULT_LIFESTYLE, haversineKm } from '../lib/runtime_pricing.js';
import { suggestNextStops } from '../lib/trip_planner_pricing.js';
import { quoteTrip, normalizeTransferMode, tripStopDetails, MAX_PARTY, PLANNER_BAG } from '../lib/tripTotal.js';
import { reorderSavings } from '../lib/tripCostOptimizer.js';
import { addDays } from '../lib/dates.js';
import { useLiveFlights } from '../lib/flights/useLiveFlights.js';
import { loadLiveStay, useLiveStaysVersion } from '../lib/liveStays.js';
import { useStaysVersion } from '../lib/staysData.js';
import {
  fetchTripPlanWithStops, createTripPlan, renameTripPlan, saveTripPlanStops,
} from '../auth/tripPlanStorage.js';
import { assignmentsKey, prefsKey, extrasKey, persistAssignments, persistPrefs, persistTripExtras, TRIP_DRAFT_PLAN_ID } from '../planner/dayPlanStore.js';
import { loadRestorableDraft, persistTripDraft, clearTripDraft } from '../planner/tripDraftStore.js';
import { usePlannerStore } from '../planner/plannerStore.js';
import { fromDraft, flightRanking } from '../planner/flow/tripSettings.js';
import { pickedLive } from '../planner/wizard/flightChoices.js';
import { fitsPrefs, NO_FLIGHT_PREFS } from '../lib/flights/flights.js';


const DEFAULT_STOP_NIGHTS = 2;
// Shared empty catalogue for before the data lands: a fresh `{}` each render
// would invalidate every memo below that reads destinations (T192).
const NO_DESTINATIONS = Object.freeze({});

/** Draft-plan state + pricing for the Trip Planner tab.
 *
 *  The traveller first picks the window they want to travel (tripStart,  *  tripEnd), then adds an ordered list of stops, each with a number of nights.
 *  Arrival/departure dates chain automatically from the trip start, so there's
 *  no per-stop date juggling: bumping a stop's nights just shifts everything
 *  after it. The flight route comes from each destination's stored routes
 *  (combineTripLegs: fly into the first stop, out of the last), but Carta does
 *  not price flights (T273): the route carries no fare, and the only flight
 *  figure in a total is the one the traveller typed (ownFlight). Overland legs
 *  between consecutive stops are estimated (interCityGroundEstimate).
 */
export function useTripPlanner(data, countryInsights = null, preferredStayTier = 'home', appLifestyle = null) {
  const destinations = data?.destinations || NO_DESTINATIONS;
  const carModel = data?.meta?.car_model || null;

  // Restore an unsaved draft (if any) so switching to the Day planner and back
  // never wipes a trip mid-planning.
  const [draft] = useState(() => loadRestorableDraft());

  const [tripStart, setTripStart] = useState(draft?.tripStart || '');
  const [tripEnd, setTripEnd] = useState(draft?.tripEnd || '');
  const [stops, setStops] = useState(draft?.stops || []); // [{ destinationId, nights, activities: string[] }]
  const [groupSize, setGroupSize] = useState(draft?.groupSize || 2);
  // Children 3 to 11 and babies 0 to 2 (T458), priced by lib/tripTotal.js.
  const [children, setChildren] = useState(draft?.children || 0);
  const [babies, setBabies] = useState(draft?.babies || 0);
  const setParty = useCallback(({ adults, children: c, babies: b }) => {
    if (adults != null) setGroupSize(Math.max(1, Math.min(MAX_PARTY, adults)));
    if (c != null) setChildren(Math.max(0, Math.min(MAX_PARTY, c)));
    if (b != null) setBabies(Math.max(0, Math.min(MAX_PARTY, b)));
  }, []);
  // How the traveller wants to get between stops: 'auto' lets Carta pick the
  // best mode per leg, 'car' assumes one rental for the whole trip, 'owncar'
  // means they DRIVE from home in their own car (no flight, no rental - fuel
  // and tolls only), 'public' sticks to trains/buses. Individual legs can
  // still be overridden.
  const [transportPref, setTransportPref] = useState(draft?.transportPref || 'auto');
  const [legModes, setLegModes] = useState(draft?.legModes || {}); // { [legIndex]: 'train'|'bus'|'car' }
  // Hops the traveller booked themselves: a flight between two stops, a ferry
  // out to an island. Carta holds no fares for either, so instead of inventing
  // one it carries the price they typed, keyed the same way as legModes:
  // { [legIndex]: { mode: 'fly'|'ferry', eur } } where eur is the party total.
  const [ownLegs, setOwnLegs] = useState(draft?.ownLegs || {});
  // The flights picked on Getting there ({ out, back }, T812), handed over
  // so the planned trip prices the flight the traveller chose, not its own
  // ranking's. Keyed by day: a moved trip no longer reads a stale pick.
  const [flightPicks, setFlightPicks] = useState(draft?.flightPicks || null);
  // The trip's flight preferences (T840): only direct flights, leaving
  // between two hours. Kept on the trip; Carta prices the cheapest flight
  // that fits them, each way.
  const [flightPrefs, setFlightPrefsRaw] = useState(draft?.flightPrefs || NO_FLIGHT_PREFS);
  // New preferences drop a picked flight that no longer fits them, so the
  // trip prices the cheapest one that does.
  const setFlightPrefs = useCallback((next) => {
    const p = { ...NO_FLIGHT_PREFS, ...next };
    setFlightPrefsRaw(p);
    setFlightPicks((prev) => {
      if (!prev) return prev;
      const keep = { out: prev.out && fitsPrefs(prev.out, p) ? prev.out : null, back: prev.back && fitsPrefs(prev.back, p) ? prev.back : null };
      return keep.out || keep.back ? keep : null;
    });
  }, []);
  // One flight picked on Change flight (T840), or null for Carta's pick.
  const setFlightPick = useCallback((dir, f) => {
    setFlightPicks((prev) => {
      const next = { out: prev?.out || null, back: prev?.back || null, [dir]: f || null };
      return next.out || next.back ? next : null;
    });
  }, []);
  // How the traveller gets from the plane to where they sleep, one choice per
  // DIRECTION ({ in, out }): 'auto' lets Carta pick (the rental car they
  // collect at the airport if the trip has one, else public transport),
  // 'public' = airport train/bus/shuttle, 'taxi' = taxi/rideshare, 'rental' =
  // drive the rental. Priced per mode so the total reflects the real choice.
  // Older drafts/saved trips stored a single string; normalize keeps them.
  const [transferMode, setTransferModeRaw] = useState(() => normalizeTransferMode(draft?.transferMode));
  // setTransferMode(mode) sets both directions (the receipt's one-tap picker);
  // setTransferMode(mode, 'in'|'out') overrides just that transfer (the
  // itinerary's per-leg rows), so "taxi there, train back" prices honestly.
  const setTransferMode = useCallback((mode, dir = null) => {
    setTransferModeRaw((prev) => (dir ? { ...prev, [dir]: mode } : { in: mode, out: mode }));
  }, []);
  const [pace, setPace] = useState(draft?.pace || 'balanced'); // 'relaxed' | 'balanced' | 'packed'
  // How expensive the traveller wants to sleep: 'dorm' | 'private' | 'home' |
  // 'hotel3' | 'hotel4' | 'hotel5'. Home (entire place) is the default; other
  // tiers price from the measured city tiers where they exist. The lifestyle
  // panel owns this choice app-wide (`choices.stay_tier`), so it arrives as
  // preferredStayTier and every later change to it re-prices the open trip:
  // the planner has no picker of its own, and a plan that priced dorm beds
  // while the map priced hotel rooms would be two different answers.
  const [stayTier, setStayTier] = useState(draft?.stayTier || preferredStayTier || 'home');
  useEffect(() => {
    if (preferredStayTier) setStayTier(preferredStayTier);
  }, [preferredStayTier]);
  // The bag the traveller expects to book (T702: the 10 kg cabin bag until
  // they pick, PLANNER_BAG): 'cabin' (free small bag),
  // 'priority' (10 kg cabin bag) or 'checked' (20 kg hold bag). Priced per
  // person per flight, by airline, on top of the fare (flights/bagFees.js).
  const [baggage, setBaggage] = useState(draft?.baggage || PLANNER_BAG);
  // When they want to fly, each way: 'any', 'morning', 'midday', 'evening'.
  // The planner prices the cheapest flight inside those hours (T517).
  const [flightHours, setFlightHoursRaw] = useState(draft?.flightHours || { out: 'any', back: 'any' });
  const setFlightHours = useCallback((dir, band) => {
    setFlightHoursRaw((prev) => ({ ...prev, [dir]: band }));
  }, []);
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
  // The trip kept on this device without an account (T500, carta.deviceTrip.v1):
  // its key, so a save knows this trip from a second one. Null for a trip that
  // was never saved on the device.
  const [deviceKey, setDeviceKey] = useState(draft?.deviceKey || null);
  const [planLabel, setPlanLabel] = useState(draft?.planLabel || '');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [planned, setPlanned] = useState(draft?.planned || false); // true = show the day-by-day itinerary view
  // How the days are priced: the app's own Lifestyle, live (T432). A trip
  // used to freeze the eating habits it was handed at, so changing them in
  // the Lifestyle panel moved every price in the app except this one.
  // A trip handed over with its own eating habits (the trip finder's Food
  // choice, T816) keeps them until the traveller changes the Lifestyle:
  // `base` is the app's Lifestyle at the hand-over, and once it moves the
  // app's own wins again, as above.
  const [tripLifestyle, setTripLifestyle] = useState(draft?.tripLifestyle || null);
  const appLifestyleKey = JSON.stringify(appLifestyle || null);
  const lifestyle = tripLifestyle?.profile && tripLifestyle.base === appLifestyleKey
    ? tripLifestyle.profile
    : (appLifestyle || DEFAULT_LIFESTYLE);
  // Beds the traveller has booked and typed in, keyed by destination id so a
  // reorder keeps them on the right town: { [destinationId]: eurTotal }.
  const [ownStays, setOwnStays] = useState(draft?.ownStays || {});

  // Keep the draft stored while planning; drop it once it's empty. Saved plans
  // carry their planId so the next visit knows not to restore them (see
  // loadDraft), the trip itself is safe in the account by then.
  useEffect(() => {
    if (!stops.length && !tripStart && !tripEnd) {
      clearTripDraft();
      return;
    }
    persistTripDraft({
      tripStart, tripEnd, stops, groupSize, transportPref, legModes, ownLegs, transferMode, pace,
      baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, planId, planLabel, planned,
      stayTier, ownStays, children, babies, deviceKey, flightHours, flightPicks, flightPrefs, tripLifestyle,
    });
  }, [children, babies, tripStart, tripEnd, stops, groupSize, transportPref, legModes, ownLegs, transferMode, pace,
      flightHours, baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, planId, planLabel, planned,
      stayTier, ownStays, deviceKey, flightPicks, flightPrefs, tripLifestyle]);

  // Each stop with its chained dates (the same chain quoteTrip prices).
  const stopDetails = useMemo(
    () => tripStopDetails(stops, destinations, tripStart),
    [stops, destinations, tripStart],
  );

  const plannedNights = useMemo(
    () => stops.reduce((sum, s) => sum + Math.max(0, s.nights || 0), 0),
    [stops],
  );
  const windowNights = useMemo(() => tripDaysBetween(tripStart, tripEnd), [tripStart, tripEnd]);

  const addStop = useCallback((destinationId, nights = DEFAULT_STOP_NIGHTS, activities = []) => {
    setStops((prev) => [...prev, { destinationId, nights, activities }]);
  }, []);

  // Re-key the per-leg answers after a stop at `index` is removed: legs
  // index-1 and index both described journeys that no longer exist, and
  // everything after them moves down one.
  const shiftLegKeys = (map, index) => {
    const next = {};
    Object.entries(map).forEach(([k, v]) => {
      const i = Number(k);
      if (i === index - 1 || i === index) return;
      next[i > index ? i - 1 : i] = v;
    });
    return next;
  };
  const dropLegAt = useCallback((index) => {
    setLegModes((prev) => shiftLegKeys(prev, index));
    setOwnLegs((prev) => shiftLegKeys(prev, index));
  }, []);

  const setStopActivities = useCallback((index, activities) => {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, activities } : s)));
  }, []);

  const removeStop = useCallback((index) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
    // Leg i joins stop i to stop i+1, so dropping a stop retires both legs
    // that touched it and pulls every later leg back one place. Left alone,
    // the choices slid onto the wrong pair of cities, and a self-booked hop
    // took its fare with it.
    dropLegAt(index);
  }, [dropLegAt]);

  const setStopNights = useCallback((index, nights) => {
    setStops((prev) => prev.map((s, i) => (
      i === index ? { ...s, nights: Math.max(0, Math.min(60, nights)) } : s
    )));
  }, []);

  // Reordering makes every leg a different pair of cities, so the per-leg
  // answers cannot follow the move; they are dropped rather than reattached
  // to journeys nobody chose them for (same reasoning as optimizeRoute).
  const moveStop = useCallback((index, dir) => {
    setStops((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    setLegModes({});
    setOwnLegs({});
  }, []);

  // A stop's own stay type (T842, owner D2): a STAY_TIERS id, or null for
  // the trip's own (the Lifestyle's).
  const setStopStay = useCallback((index, tier) => {
    setStops((prev) => prev.map((s, i) => {
      if (i !== index) return s;
      const { stayTier: _old, ...rest } = s;
      return tier ? { ...rest, stayTier: tier } : rest;
    }));
  }, []);

  // A stop's day trips (T843, owner D4): [{ destinationId, day }], a day of
  // the stay out and back the same evening; an empty list clears them.
  const setStopDayTrips = useCallback((index, list) => {
    setStops((prev) => prev.map((s, i) => {
      if (i !== index) return s;
      const { dayTrips: _old, ...rest } = s;
      return list?.length ? { ...rest, dayTrips: list } : rest;
    }));
  }, []);

  // Swap a stop for another place (T841): its nights and its place in the
  // route stay; its activities and day trips go with the old town, and the
  // hops on either side are new journeys, so their answers are dropped.
  const swapStop = useCallback((index, destinationId) => {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, destinationId, activities: [], dayTrips: [] } : s)));
    const drop = (m) => {
      const n = { ...m };
      delete n[index - 1];
      delete n[index];
      return n;
    };
    setLegModes(drop);
    setOwnLegs(drop);
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
    setLegModes({});
    setOwnLegs({});
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
    setOwnLegs({});
  }, [destinations]);

  // Wipe the whole draft so the traveller can start over from scratch.
  const clearPlan = useCallback(() => {
    setFlightPrefsRaw(NO_FLIGHT_PREFS);
    setStops([]);
    setTripStart('');
    setTripEnd('');
    setLegModes({});
    setOwnLegs({});
    setFlightPicks(null);
    setTripLifestyle(null);
    setTransferMode('auto');
    setAnchorId(null);
    setAnchorOrigin(null);
    setReturnAnchorId(null);
    setOwnFlight(null);
    setCarHome(null);
    setPlanId(null);
    setPlanLabel('');
    setPlanned(false);
    setOwnStays({});
    setDeviceKey(null);
  }, [setTransferMode]);

  // Load a whole itinerary the guided wizard just assembled: a start date, an
  // ordered list of { destinationId, nights, activities }, an optional name,
  // plus how they want to travel (transport) and how full their days should
  // feel (pace), everything stays editable in the planner afterwards.
  const loadFromWizard = useCallback(({ startDate, stops: wizardStops, label, groupSize: gs, transport, pace: wizardPace, baggage: wizardBaggage, anchorId: wizardAnchor, anchorOrigin: wizardAnchorOrigin, returnAnchorId: wizardReturnAnchor, ownFlight: wizardOwnFlight, carHome: wizardCarHome, legModes: wizardLegModes, ownLegs: wizardOwnLegs, ownStays: wizardOwnStays, children: wizardChildren, babies: wizardBabies, flightPicks: wizardFlightPicks, stayTier: wizardStayTier, lifestyle: wizardLifestyle }) => {
    // Every field here mirrors lib/tripTotal.js wizardPlannerState(), the
    // transform the wizard prices its running estimate through (T432): a
    // field set here and not there would move the total at the hand-over.
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
    if (gs != null) setGroupSize(Math.max(1, Math.min(MAX_PARTY, gs)));
    setChildren(Math.max(0, wizardChildren || 0));
    setBabies(Math.max(0, wizardBabies || 0));
    if (transport) setTransportPref(transport);
    if (wizardPace) setPace(wizardPace);
    if (wizardBaggage) setBaggage(wizardBaggage);
    setAnchorId(wizardAnchor || null);
    setAnchorOrigin(wizardAnchorOrigin || null);
    setReturnAnchorId(wizardReturnAnchor || null);
    setOwnFlight(wizardOwnFlight || null);
    setCarHome(wizardCarHome || null);
    // The "everything is booked" path asks how each hop is travelled, so the
    // wizard can hand over per-leg choices; every other path leaves them to
    // Carta and hands over nothing.
    setLegModes(wizardLegModes || {});
    setOwnLegs(wizardOwnLegs || {});
    setOwnStays(wizardOwnStays || {});
    setFlightPicks(wizardFlightPicks?.out || wizardFlightPicks?.back ? wizardFlightPicks : null);
    setFlightPrefsRaw(NO_FLIGHT_PREFS);
    // The stay and the eating habits the wizard priced (T816, row T801-f):
    // Review's total and the planned trip's are one figure.
    if (wizardStayTier) setStayTier(wizardStayTier);
    setTripLifestyle(wizardLifestyle ? { profile: wizardLifestyle, base: appLifestyleKey } : null);
    // A fresh wizard trip must not inherit the previous draft's airport
    // transfer choice (a leftover "taxi" would silently reprice this one).
    setTransferMode('auto');
    setPlanId(null);
    setDeviceKey(null);
    setPlanned(false);
    // A brand-new trip must not inherit day picks from a previous, abandoned
    // draft: both run under TRIP_DRAFT_PLAN_ID until saved, and stale indices
    // made freshly created days read "Edit plan" (against the WRONG city's
    // POIs, even). Through the store functions so account sync sees the wipe.
    persistAssignments(TRIP_DRAFT_PLAN_ID, {});
    persistPrefs(TRIP_DRAFT_PLAN_ID, {});
    persistTripExtras(TRIP_DRAFT_PLAN_ID, {});
  }, [setTransferMode, appLifestyleKey]);

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

  // Every priced part of the trip, from the one function the wizard's running
  // estimate also prices through (lib/tripTotal.js, T432), so the figure the
  // traveller watched on every step is the figure the planned trip shows.
  // The flight there and home is Google Flights' price: first the sweep's
  // cheapest for the day, then, once the live search for the trip's exact
  // days answers (useLiveFlights), every flight of the day in the chosen hours.
  // T657: the trip settings' "what matters most" orders the live flights.
  const plannerDraft = usePlannerStore();
  const flightRank = useMemo(() => flightRanking(fromDraft(plannerDraft)).sort, [plannerDraft]);
  const tripState = useMemo(() => ({
    stops, tripStart, tripEnd, groupSize, children, babies, transportPref, legModes, ownLegs, ownStays, transferMode,
    baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, stayTier, lifestyle, flightHours, flightRank,
    flightPrefs,
    // T855: the picked flights price their direction as held legs (quoteTrip
    // heldLeg), so a flight on another day or airport than the routed one holds.
    flightPicks,
  }), [flightPrefs, flightPicks, stops, tripStart, tripEnd, groupSize, children, babies, transportPref, legModes, ownLegs,
    ownStays, transferMode, baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, stayTier,
    lifestyle, flightHours, flightRank]);
  // T559: each dated stop asks for tonight's prices on its own nights; a live
  // answer bumps liveVersion and reprices the beds (bedPrice reads it).
  const liveVersion = useLiveStaysVersion();
  const staysVersion = useStaysVersion();
  const pricedSwept = useMemo(
    () => (liveVersion >= 0 ? quoteTrip(tripState, { data, countryInsights }) : null),
    [tripState, data, countryInsights, liveVersion],
  );
  const liveAsks = (pricedSwept?.stopDetails || [])
    .filter((s) => s.dest && s.arriveDate && s.nights > 0)
    .map((s) => `${s.dest.id}|${s.arriveDate}|${s.nights}`).join(',');
  useEffect(() => {
    if (!liveAsks) return;
    const people = Math.max(1, (tripState.groupSize || 1) + (tripState.children || 0));
    for (const ask of liveAsks.split(',')) {
      const [id, date, nights] = ask.split('|');
      loadLiveStay(id, date, Number(nights), people);
    }
  }, [liveAsks, tripState.groupSize, tripState.children, staysVersion]);
  const liveAnswers = useLiveFlights(pricedSwept.cartaFlight?.queries);
  const liveFlights = useMemo(() => {
    const picks = pickedLive(flightPicks);
    return picks.length ? new Map([...liveAnswers, ...picks]) : liveAnswers;
  }, [liveAnswers, flightPicks]);
  const priced = useMemo(() => (liveFlights.size
    ? quoteTrip({ ...tripState, liveFlights }, { data, countryInsights })
    : pricedSwept), [liveFlights, pricedSwept, tripState, data, countryInsights]);
  const {
    flight, legs, anchorLegs, flightTransfer, driveLegs, carRental, vignettes, stayCosts,
    grandTotal, tripHasCar,
  } = priced;

  // What a change would do to the total (T836, T837): the trip priced with
  // `patch` (stops, tripStart, tripEnd) against the same trip as it is, both
  // on the swept fares, so new dates without a live answer yet compare like
  // with like. Null when either has no total.
  const quoteDelta = useCallback((patch) => {
    const now = quoteTrip(tripState, { data, countryInsights })?.grandTotal;
    const then = quoteTrip({ ...tripState, ...patch }, { data, countryInsights })?.grandTotal;
    return Number.isFinite(now) && Number.isFinite(then) ? then - now : null;
  }, [tripState, data, countryInsights]);

  const setLegMode = useCallback((index, mode) => {
    setLegModes((prev) => ({ ...prev, [index]: mode }));
  }, []);

  // Declare (or clear, with mode null) a hop the traveller booked themselves.
  const setOwnLeg = useCallback((index, mode, eurTotal) => {
    setOwnLegs((prev) => {
      const next = { ...prev };
      if (!mode) delete next[index];
      else next[index] = { mode, eur: Math.max(0, Math.min(99999, Number(eurTotal) || 0)) };
      return next;
    });
  }, []);

  // A bed the traveller booked themselves, as the whole stay's price for the
  // party; a blank or zero clears it back to Carta's estimate.
  const setOwnStay = useCallback((destinationId, eurTotal) => {
    setOwnStays((prev) => {
      const next = { ...prev };
      const v = Math.max(0, Math.min(99999, Number(eurTotal) || 0));
      if (!v) delete next[destinationId];
      else next[destinationId] = v;
      return next;
    });
  }, []);

  // "Take this trip cheaper": a cheaper stop ORDER when reordering
  // meaningfully shortens the overland route. The cheaper-start-dates sweep
  // is gone (T273): it ranked dates by frozen flight fares, and Carta does
  // not price flights.
  const cheaperOrder = useMemo(
    () => reorderSavings(stops, destinations, groupSize, {
      carModel, countryInsights, hasCar: tripHasCar,
    }),
    [stops, destinations, groupSize, carModel, countryInsights, tripHasCar],
  );

  // Apply the cheaper stop order suggested by reorderSavings.
  const applyCheaperOrder = useCallback(() => {
    if (!cheaperOrder) return;
    const byId = new Map(stops.map((s) => [s.destinationId, s]));
    setStops(cheaperOrder.ordered_ids.map((id) => byId.get(id)).filter(Boolean));
    setLegModes({});
    setOwnLegs({});
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
    setDeviceKey(null);
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
      ...(s.choices?.stayTier ? { stayTier: s.choices.stayTier } : {}),
      ...(Array.isArray(s.choices?.dayTrips) && s.choices.dayTrips.length ? { dayTrips: s.choices.dayTrips } : {}),
    })));
    setAnchorId(sorted[0]?.choices?.anchorId || null);
    setAnchorOrigin(sorted[0]?.choices?.anchorOrigin || null);
    setReturnAnchorId(sorted[0]?.choices?.returnAnchorId || null);
    setOwnFlight(sorted[0]?.choices?.ownFlight || null);
    setCarHome(sorted[0]?.choices?.carHome || null);
    setBaggage(sorted[0]?.choices?.baggage || PLANNER_BAG);
    // Pricing inputs must round-trip too, otherwise a reopened trip is repriced
    // with whatever the hook currently holds (default 2 travellers) instead of
    // the saved party size/pace, and the headline total comes out wrong.
    setGroupSize(sorted[0]?.choices?.groupSize || 2);
    setTransportPref(sorted[0]?.choices?.transportPref || 'auto');
    setTransferModeRaw(normalizeTransferMode(sorted[0]?.choices?.transferMode));
    setPace(sorted[0]?.choices?.pace || 'balanced');
    // Per-leg choices are answers, not derivations: a reopened trip that
    // silently reverted to Carta's pick threw away the flight the traveller
    // told us about and repriced the hop as a coach.
    setLegModes(sorted[0]?.choices?.legModes || {});
    setOwnLegs(sorted[0]?.choices?.ownLegs || {});
    setOwnStays(sorted[0]?.choices?.ownStays || {});
    setChildren(sorted[0]?.choices?.children || 0);
    setBabies(sorted[0]?.choices?.babies || 0);
    setPlanned(false);
  }, []);

  // asPlanId saves this trip OVER an account trip (T500, T490-f: a device trip
  // meets an account that already holds one and the traveller keeps this one).
  const savePlan = useCallback(async (userId, { asPlanId = null } = {}) => {
    if (!userId || stops.length < 1) return null;
    setSaveState('saving');
    const targetId = asPlanId || planId;
    try {
      const id = targetId || await createTripPlan(userId, planLabel || null);
      // Renames of an already-saved trip must stick too, not just first saves.
      if (targetId) await renameTripPlan(id, planLabel || null);
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
            ...(s.stayTier ? { stayTier: s.stayTier } : {}),
            ...(s.dayTrips?.length ? { dayTrips: s.dayTrips } : {}),
            ...(i === 0 ? { baggage, transportPref, transferMode, pace, ...(anchorId ? { anchorId } : {}), ...(anchorOrigin ? { anchorOrigin } : {}), ...(returnAnchorId ? { returnAnchorId } : {}), ...(ownFlight ? { ownFlight } : {}), ...(carHome ? { carHome } : {}), ...(Object.keys(legModes).length ? { legModes } : {}), ...(Object.keys(ownLegs).length ? { ownLegs } : {}), ...(Object.keys(ownStays).length ? { ownStays } : {}), ...(children ? { children } : {}), ...(babies ? { babies } : {}), priceRequest: { stay: stayTier, lifestyle } } : {}),
          },
        };
      }));
      // Day-planner work done against the unsaved draft moves with the trip:
      // re-key its picks/preferences from the draft id to the real plan id.
      // Through the store's persist functions (not raw setItem) so the move
      // also reaches account sync: the draft id never syncs, the real id must.
      if (!targetId && typeof window !== 'undefined') {
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
      setDeviceKey(null);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      return id;
    } catch (e) {
      setSaveState('idle');
      throw e;
    }
  }, [planId, planLabel, stops, stopDetails, groupSize, legs, flight, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, baggage, transportPref, transferMode, pace, legModes, ownLegs, ownStays, children, babies, stayTier, lifestyle]);

  // The trip as the device keeps it (T500): the same fields the draft holds,
  // so a device trip reopens exactly as it was saved.
  const snapshot = useMemo(() => ({
    tripStart, tripEnd, stops, groupSize, transportPref, legModes, ownLegs, transferMode, pace,
    baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, planLabel, planned,
    stayTier, ownStays, children, babies, flightHours, flightPrefs,
  }), [flightPrefs, tripStart, tripEnd, stops, groupSize, transportPref, legModes, ownLegs, transferMode, pace, flightHours,
    baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, planLabel, planned,
    stayTier, ownStays, children, babies]);

  // What the traveller can change on the trip page, for its Undo and Redo
  // (T835): the snapshot's fields without the trip's identity and mode, plus
  // the flights picked on Getting there.
  const editState = useMemo(() => ({
    tripStart, tripEnd, stops, groupSize, children, babies, transportPref, legModes, ownLegs, transferMode, pace,
    baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, ownStays, flightHours, flightPicks, flightPrefs,
  }), [tripStart, tripEnd, stops, groupSize, children, babies, transportPref, legModes, ownLegs, transferMode, pace,
    baggage, anchorId, anchorOrigin, returnAnchorId, ownFlight, carHome, ownStays, flightHours, flightPicks, flightPrefs]);

  // Put an editState back (an Undo or a Redo): the same fields, the trip's
  // id, device key, name and mode untouched.
  const restoreEdit = useCallback((d) => {
    if (!d || !Array.isArray(d.stops)) return;
    setTripStart(d.tripStart || '');
    setTripEnd(d.tripEnd || '');
    setStops(d.stops);
    setGroupSize(d.groupSize || 2);
    setChildren(d.children || 0);
    setBabies(d.babies || 0);
    setTransportPref(d.transportPref || 'auto');
    setLegModes(d.legModes || {});
    setOwnLegs(d.ownLegs || {});
    setTransferModeRaw(normalizeTransferMode(d.transferMode));
    setPace(d.pace || 'balanced');
    setBaggage(d.baggage || PLANNER_BAG);
    setFlightHoursRaw(d.flightHours || { out: 'any', back: 'any' });
    setAnchorId(d.anchorId || null);
    setAnchorOrigin(d.anchorOrigin || null);
    setReturnAnchorId(d.returnAnchorId || null);
    setOwnFlight(d.ownFlight || null);
    setCarHome(d.carHome || null);
    setOwnStays(d.ownStays || {});
    setFlightPicks(d.flightPicks || null);
    setFlightPrefsRaw(d.flightPrefs || NO_FLIGHT_PREFS);
  }, []);

  // Put a kept trip back on the planner (a device trip, T500).
  const loadSnapshot = useCallback((d, key = null) => {
    if (!d || !Array.isArray(d.stops)) return;
    setTripStart(d.tripStart || '');
    setTripEnd(d.tripEnd || '');
    setStops(d.stops);
    setGroupSize(d.groupSize || 2);
    setChildren(d.children || 0);
    setBabies(d.babies || 0);
    setTransportPref(d.transportPref || 'auto');
    setLegModes(d.legModes || {});
    setOwnLegs(d.ownLegs || {});
    setTransferModeRaw(normalizeTransferMode(d.transferMode));
    setPace(d.pace || 'balanced');
    if (d.stayTier) setStayTier(d.stayTier);
    setBaggage(d.baggage || PLANNER_BAG);
    setFlightHoursRaw(d.flightHours || { out: 'any', back: 'any' });
    setFlightPrefsRaw(d.flightPrefs || NO_FLIGHT_PREFS);
    setAnchorId(d.anchorId || null);
    setAnchorOrigin(d.anchorOrigin || null);
    setReturnAnchorId(d.returnAnchorId || null);
    setOwnFlight(d.ownFlight || null);
    setCarHome(d.carHome || null);
    setOwnStays(d.ownStays || {});
    setPlanLabel(d.planLabel || '');
    setPlanId(null);
    setDeviceKey(key);
    setPlanned(d.planned !== false);
  }, []);

  return {
    snapshot, loadSnapshot, deviceKey, setDeviceKey, editState, restoreEdit, quoteDelta,
    tripStart, setTripStart, tripEnd, setTripEnd,
    stops, stopDetails, plannedNights, windowNights,
    groupSize, setGroupSize, children, babies, setParty,
    transportPref, setTransportPref, transferMode, setTransferMode, pace, setPace, setLegMode, setOwnLeg, carRental,
    // The raw share-link ingredients (the same fields the draft persists).
    anchorId, anchorOrigin, setAnchorOrigin, returnAnchorId, legModes, ownLegs, ownStays, setOwnStay,
    priced, lifestyle,
    cheaperOrder, applyCheaperOrder,
    addStop, removeStop, setStopNights, setStopActivities, moveStop, reorderStop, swapStop, setStopStay, setStopDayTrips,
    optimizeRoute, clearPlan, loadFromWizard,
    nextStopSuggestions, flight, legs, anchorLegs, flightTransfer, driveLegs, stayCosts, grandTotal, dayPlan,
    vignettes, tripHasCar,
    baggage, setBaggage,
    flightHours, setFlightHours,
    // T840: the trip's flight preferences, a picked flight each way, and the
    // live answers for the trip's days (Change flight lists them).
    flightPrefs, setFlightPrefs, flightPicks, setFlightPick, liveAnswers,
    stayTier, setStayTier,
    ownFlight, setOwnFlight,
    carHome, setCarHome,
    planned, setPlanned,
    planId, planLabel, setPlanLabel, saveState, savePlan, loadPlan,
  };
}
