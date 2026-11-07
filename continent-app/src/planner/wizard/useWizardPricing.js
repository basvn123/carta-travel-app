import { useMemo, useCallback } from 'react';
import { tripRequest, atDates, priceDays } from '../../lib/price/index.js';
import { addDays } from '../../lib/dates.js';
import { isGateway } from '../../lib/rating.js';
import { usePlannerStore } from '../plannerStore.js';
import { flightRanking, fromDraft } from '../flow/tripSettings.js';
import { pickedLive } from './flightChoices.js';
import { wizardPlannerState, quoteTrip as priceWholeTrip, PLANNER_BAG } from '../../lib/tripTotal.js';
import { useLiveFlights } from '../../lib/flights/useLiveFlights.js';
import { eurDay } from '../../lib/costIndex.js';
import { cityKeyName, cityLabel } from '../../lib/placeName.js';
import { cheapestDay } from './wizardSteps.js';
import { cityTier } from '../../lib/tripGuide.js';

export function useWizardPricing({
  adults, anchorId, babies, countryInsights, data, destinations, effectiveStayTier, focusedId,
  groupSize, handOver, includedIds, kids, lifestyle, nights, orderedIncludedIds, pickedStopId,
  railOn, selectedCountries, setTravelLeg, startDate, stayMaxNightly, stayMinRating, stepName,
  travelValues,
}) {
  // The wizard's price request (T702, plan F6): its party, the stay tier and
  // the Lifestyle, the same question the trip it hands over is priced for.
  const dailyLifestyle = useMemo(
    () => lifestyle || data?.meta?.defaults?.lifestyle || null,
    [lifestyle, data],
  );
  const wizardRequest = useMemo(
    () => tripRequest({ groupSize: adults, children: kids, babies, stayTier: effectiveStayTier, lifestyle: dailyLifestyle }),
    [adults, kids, babies, effectiveStayTier, dailyLifestyle],
  );
  // The per-night stay price for the WHOLE group at a candidate city: the
  // engine's bed at a 2-night stay from the start date (so one-off fees
  // amortize), priced once for the catalogue per request.
  const nightBeds = useMemo(() => {
    const start = startDate || null;
    const req = start ? atDates(wizardRequest, start, addDays(start, 2)) : { ...wizardRequest, nights: 2 };
    return priceDays(destinations, req);
  }, [destinations, wizardRequest, startDate]);
  // A callback so the memos that call it can name it as a dependency.
  const nightlyFor = useCallback((id) => {
    const bed = nightBeds.get(id)?.stayEur;
    return bed > 0 ? Math.round(bed * groupSize) : null;
  }, [nightBeds, groupSize]);
  const passesStayFilters = useCallback((id, dest) => {
    // T755: an airport of a multi-airport city is never a stay of its own.
    if (isGateway(dest)) return false;
    if (stayMinRating > 0 && (dest.rating?.score ?? 0) < stayMinRating) return false;
    if (stayMaxNightly > 0) {
      const n = nightlyFor(id, dest);
      if (n != null && n > stayMaxNightly) return false;
    }
    return true;
  }, [stayMinRating, stayMaxNightly, nightlyFor]);


  // The whole trip priced by the planner's own function (lib/tripTotal.js,
  // T432): the hand-over above, as the planned trip will hold it.
  // T657: the trip settings' "what matters most" orders the live flights.
  const plannerDraft = usePlannerStore();
  const flightRank = useMemo(() => flightRanking(fromDraft(plannerDraft)).sort, [plannerDraft]);
  const planned = handOver;
  // T812: a flight picked on Getting there prices the trip on that flight
  // (one live answer per way, keyed by its day, so a moved trip drops it).
  const flightPickOut = travelValues.out?.pick || null;
  const flightPickBack = travelValues.back?.pick || null;
  const picked = useMemo(() => pickedLive({ out: flightPickOut, back: flightPickBack }), [flightPickOut, flightPickBack]);
  const priced = useMemo(() => {
    if (!planned.stops.length) return null;
    const state = { ...wizardPlannerState(planned, { stayTier: effectiveStayTier, lifestyle: dailyLifestyle }), flightRank };
    // T855: a pick holds its direction.
    const withPicks = picked.length
      ? { ...state, liveFlights: new Map([...(state.liveFlights || []), ...picked]), flightPicks: { out: flightPickOut, back: flightPickBack } }
      : state;
    return priceWholeTrip(withPicks, { data, countryInsights });
  }, [planned, effectiveStayTier, dailyLifestyle, data, countryInsights, flightRank, picked, flightPickOut, flightPickBack]);
  // Carta's figure for each leg the traveller has not priced, keyed the way
  // the Getting there rows are, so a row shows the estimate its own figure
  // replaces.
  const legEstimates = useMemo(() => {
    const out = {};
    if (!priced) return out;
    priced.legs.forEach((l, i) => {
      const m = l?.modes?.[l.mode];
      if (m && !m.own && m.eur_total > 0) out[`leg${i}`] = m.eur_total;
    });
    if (priced.driveLegs?.out?.ground_total) out.out = priced.driveLegs.out.ground_total;
    if (priced.driveLegs?.home?.ground_total) out.back = priced.driveLegs.home.ground_total;
    return out;
  }, [priced]);
  // The mode each hop between the stops is priced with, for its card's icons (T812).
  const pricedModes = useMemo(() => {
    const out = {};
    (priced?.legs || []).forEach((l, i) => { if (l?.mode) out[`leg${i}`] = l.mode; });
    return out;
  }, [priced]);
  // The day's flights, both ways, for Getting there's rows and the review
  // (T812; useLiveFlights shares answers with the planned trip for ten minutes).
  const flightQueries = (stepName === 'Getting' || stepName === 'Finish') ? priced?.cartaFlight?.queries || null : null;
  const liveAnswers = useLiveFlights(flightQueries);
  const flightWaiting = useMemo(() => {
    const q = flightQueries || [];
    const has = (x) => Boolean(x && liveAnswers.has(`${x.o}-${x.d}-${x.date}`));
    return { out: Boolean(q[0]) && !has(q[0]), back: Boolean(q[1]) && !has(q[1]) };
  }, [flightQueries, liveAnswers]);
  const flightParty = useMemo(() => (priced
    ? { paying: priced.groupSize, babies: priced.party?.babies || 0, bagKey: PLANNER_BAG }
    : null), [priced]);
  const onPickFlight = (dir, pick) => setTravelLeg(dir, { pick, mode: 'fly' });
  // The flight the running total is priced on for one way, as a pick
  // (pickedLive's shape), or null when that way is not flown by Carta.
  const pricedFlight = (dir) => {
    const cf = priced?.cartaFlight;
    const leg = cf?.[dir];
    const q = cf?.queries?.[dir === 'out' ? 0 : 1];
    if (!leg || !q || !Number.isFinite(leg.price)) return null;
    const { cost, ...flight } = leg; // eslint-disable-line no-unused-vars -- the planner prices the cost itself
    // T855: keyed by the trip's day; a leg on the nearest swept day keeps its own.
    const own = flight.flightDate || flight.date;
    return { ...flight, date: q.date, ...(own && own !== q.date ? { flightDate: own } : {}), from: q.o, to: q.d };
  };
  // Carta's bed estimate per stay, for the field that replaces it.
  const bedEstimate = (id) => {
    const i = priced ? priced.stopDetails.findIndex((sd) => sd.destinationId === id) : -1;
    const sc = i >= 0 ? priced.stayCosts[i] : null;
    return sc ? (sc.estAccomTotal ?? sc.accomTotal) : null;
  };

  // ---- The price from the first place (T388, rule "Cost on cards") --------
  // Every town's day per person at the traveller's Lifestyle, from the cost
  // index Explore prices its cards with, so a country here and a town there
  // never disagree. A country card says "from" the cheapest town (never an
  // average); the brief gives the range.
  const dayCosts = useMemo(() => priceDays(destinations, wizardRequest), [destinations, wizardRequest]);
  const countryDayCost = useMemo(() => {
    const out = new Map();
    for (const [id, row] of dayCosts) {
      if (row.dayEur == null) continue;
      const country = destinations[id]?.country;
      if (!country) continue;
      const cur = out.get(country);
      const national = row.stayLevel !== 'city' || row.foodLevel !== 'city';
      if (!cur) { out.set(country, { min: row.dayEur, max: row.dayEur, national }); continue; }
      if (row.dayEur < cur.min) { cur.min = row.dayEur; cur.national = national; }
      if (row.dayEur > cur.max) cur.max = row.dayEur;
    }
    for (const c of out.values()) {
      c.minText = eurDay(c.min);
      c.maxText = eurDay(c.max);
      // Whole euros, as Explore's cards print a day; equal once rounded is
      // one figure, not a range.
      if (c.minText === c.maxText) c.max = c.min;
    }
    return out;
  }, [dayCosts, destinations]);
  // A ready-made trip's beds and days for the party, stop by stop through
  // the engine (lib/price/stay.js), the receipt's own. null when a stop is missing.
  const cityIndex = useMemo(() => {
    const m = new Map();
    for (const [id, d] of Object.entries(destinations)) {
      if (!d?.city || isGateway(d)) continue;
      m.set(`${String(d.iso2 || '').toUpperCase()}|${cityKeyName(cityLabel(d.city)).toLowerCase()}`, id);
    }
    return m;
  }, [destinations]);
  // A ready-made trip's card carries one price line (owner T490-e): "From
  // (estimate) a person a day", the day per person at the traveller's
  // Lifestyle from the cheapest town it sleeps in, read from the same cost
  // index as a country card, so the two never disagree. Null when no stop is
  // in the catalogue with a price.
  const tripDayCost = useCallback((cities) => cheapestDay((cities || []).map((c) => {
    const id = cityIndex.get(`${String(c.cc || '').toUpperCase()}|${cityKeyName(cityLabel(c.city)).toLowerCase()}`);
    return id ? dayCosts.get(id) : null;
  })), [cityIndex, dayCosts]);

  // Every city of the chosen countries for the map picker, plus any selected
  // strays from outside them (search picks stay visible on the map). From
  // 1024 px the steps after Stay show the picked stops alone, on the right.
  const stopsMapStep = railOn && ['Stays', 'Trips', 'Getting', 'Finish'].includes(stepName);
  const mapCities = useMemo(() => {
    if (stepName !== 'Stay' && !stopsMapStep) return [];
    const out = [];
    for (const c of (stepName === 'Stay' ? selectedCountries : [])) {
      for (const { id, dest } of c.cities) {
        // Same minimum-rating / nightly-budget narrowing as the list view,
        // so switching between Map and List shows the same candidate pool.
        if (!passesStayFilters(id, dest)) continue;
        out.push({
          id,
          city: cityLabel(dest.city),
          lat: dest.lat,
          lon: dest.lon,
          tierKey: cityTier(dest).key,
          score: dest.rating?.score ?? null,
          selected: (nights[id] || 0) > 0,
          nights: nights[id] || 0,
          isAnchor: id === anchorId,
          focused: id === focusedId,
        });
      }
    }
    // The stops map numbers its pins in trip order (the same numbers as the list).
    const orderOf = new Map(orderedIncludedIds.map((id, i) => [id, i + 1]));
    for (const id of (stopsMapStep ? orderedIncludedIds : includedIds)) {
      if (out.some((o) => o.id === id)) continue;
      const dest = destinations[id];
      if (!dest || dest.lat == null) continue;
      out.push({
        id, city: cityLabel(dest.city), lat: dest.lat, lon: dest.lon,
        tierKey: cityTier(dest).key, score: dest.rating?.score ?? null,
        selected: true, nights: nights[id] || 0,
        isAnchor: id === anchorId, focused: id === (stopsMapStep ? pickedStopId : focusedId),
        order: stopsMapStep ? orderOf.get(id) : 0,
      });
    }
    return out;
  }, [stepName, stopsMapStep, selectedCountries, nights, includedIds, orderedIncludedIds, anchorId, focusedId,
    pickedStopId, destinations, passesStayFilters]);
  return { nightlyFor, passesStayFilters, planned, flightPickOut, flightPickBack, priced, legEstimates, pricedModes, liveAnswers, flightWaiting, flightParty, onPickFlight, pricedFlight, bedEstimate, dayCosts, countryDayCost, tripDayCost, mapCities };
}
