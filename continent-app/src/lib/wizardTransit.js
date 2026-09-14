/**
 * wizardTransit.js, the origin-first layer of the guided trip wizard.
 *
 * The wizard used to price everything from ONE departure airport (the app's
 * chosen origin). This module widens that to a real departure ADDRESS:
 *   - nearbyAirports()        every fare-carrying origin within reach of the
 *                             typed address (the traveller will happily drive
 *                             an hour to the airport that actually flies).
 *   - flyInOptionsMulti()     fly-in options across ALL of those airports at
 *                             once, read straight off the per-origin fare
 *                             slices (/fares/{IATA}.json), one entry per
 *                             (departure airport, arrival airport) pair.
 *   - countryTransitMatrix()  per-country transit + all-in trip estimate for
 *                             the Where step's card badges: cheapest flight
 *                             across the nearby airports, the drive there,
 *                             and flight/drive + stay + daily spending.
 *   - TRAVEL_STYLES           the three lifestyle tiers (budget / standard /
 *                             comfort) as one object each: the stay tier the
 *                             receipt prices beds at plus the eating-out
 *                             cadence the daily-spend line prices from.
 *
 * Everything here is estimates from the SAME models the planner prices with
 * afterwards (car_model, accommodation anchors, cost basket), so the badge a
 * traveller taps and the receipt they end on come from one source.
 */
import { haversineKm, drivingEstimate, accommodationPerPerson, groundSpendPerPerson } from './runtime_pricing.js';
import { gemScore } from './trip_planner_pricing.js';
import { destAnchor } from './origins.js';
import { fetchFares } from './appData.js';

/** How far from the typed address we look for a departure airport, and how
 *  many we keep. Ryanair concentrates on secondary airports, so the six
 *  best-connected within 200 km beat the single nearest every time. */
export const AIRPORT_SEARCH_KM = 200;
const MAX_AIRPORTS = 6;

/**
 * The three travel styles, each one answer that sets BOTH what a bed costs
 * (stay tier, priced from the accommodation anchors) and what a day costs
 * (eating-out cadence, priced from the per-city cost basket). Children count
 * as travellers at full price; the models carry no child rates and a made-up
 * discount would be a lie.
 */
export const TRAVEL_STYLES = [
  {
    key: 'budget',
    labelKey: 'wizard.styleBudget',
    subKey: 'wizard.styleBudgetSub',
    stayTier: 'private',
    lifestyle: {
      cadence: 'week',
      dinners_per_week: 2, lunches_per_week: 3, fastfood_per_week: 4,
      drinks_per_week: 4, club_nights_per_week: 0, coffees_per_day: 1,
      self_catered_days_per_week: 4,
    },
  },
  {
    key: 'standard',
    labelKey: 'wizard.styleStandard',
    subKey: 'wizard.styleStandardSub',
    stayTier: 'home',
    lifestyle: null, // the app's own defaults (meta.defaults.lifestyle)
  },
  {
    key: 'luxury',
    labelKey: 'wizard.styleLuxury',
    subKey: 'wizard.styleLuxurySub',
    stayTier: 'hotel4',
    lifestyle: {
      cadence: 'week',
      dinners_per_week: 6, lunches_per_week: 5, fastfood_per_week: 0,
      drinks_per_week: 8, club_nights_per_week: 1, coffees_per_day: 2,
      self_catered_days_per_week: 0,
    },
  },
];
export const STYLE_BY_KEY = Object.fromEntries(TRAVEL_STYLES.map((s) => [s.key, s]));

/** The daily-spend lifestyle for a style key: the preset, or the app defaults
 *  for 'standard'. */
export function styleLifestyle(styleKey, metaDefaults) {
  const s = STYLE_BY_KEY[styleKey];
  if (!s) return metaDefaults || null;
  return s.lifestyle || metaDefaults || null;
}

/**
 * Every fare-carrying departure airport within `maxKm` of a point, richest
 * route network first. Airports with zero coverage are dropped outright: an
 * airfield that flies nowhere is not a way into Europe.
 *
 * @returns [{ iata, name, city, km, coverage }]
 */
export function nearbyAirports(meta, lat, lon, { maxKm = AIRPORT_SEARCH_KM, limit = MAX_AIRPORTS } = {}) {
  if (lat == null || lon == null) return [];
  const origins = meta?.origins || {};
  const coverage = meta?.origin_coverage || {};
  const out = [];
  for (const [iata, o] of Object.entries(origins)) {
    if (o.lat == null || o.lon == null) continue;
    const km = haversineKm(lat, lon, o.lat, o.lon);
    if (km == null || km > maxKm) continue;
    const cov = coverage[iata] || 0;
    if (cov <= 0) continue;
    out.push({ iata, name: o.name || o.city || iata, city: o.city || iata, km: Math.round(km), coverage: cov });
  }
  // Route network first, distance breaks ties: the nearest airport is often
  // the one that barely flies anywhere.
  out.sort((a, b) => (b.coverage - a.coverage) || (a.km - b.km));
  return out.slice(0, limit);
}

/** Fetch the fare slices for a set of origin airports. Resolves to
 *  { iata: sliceOrNull }; fetchFares caches per origin, so re-calls are free. */
export async function loadFareSlices(iatas) {
  const codes = [...new Set((iatas || []).filter(Boolean))];
  const slices = await Promise.all(codes.map((c) => fetchFares(c)));
  const out = {};
  codes.forEach((c, i) => { out[c] = slices[i]; });
  return out;
}

/** Cheapest stored fare in a { date: eur } map, within the month prefix (when
 *  given) and never before `notBefore`. Same rule wizardFlights.minFare uses. */
function minFare(fares, monthPrefix, notBefore) {
  let best = null;
  for (const [date, eurV] of Object.entries(fares || {})) {
    if (eurV == null) continue;
    if (notBefore && date < notBefore) continue;
    if (monthPrefix && !date.startsWith(monthPrefix)) continue;
    if (!best || eurV < best.eur || (eurV === best.eur && date < best.date)) best = { date, eur: eurV };
  }
  return best;
}

/**
 * Fly-in options across several departure airports at once, read straight off
 * the per-origin fare slices, in the exact shape the Getting-there step already
 * renders (see wizardFlights.flyInOptions), plus:
 *   key      - `${origin}:${destId}`, unique per (departure, arrival) pair,
 *              because the SAME arrival airport can be reached from two home
 *              airports at two prices and both rows must be pickable.
 *   originKm - how far that departure airport sits from the typed address.
 *
 * One row per (origin, arrival airport). The map view dedupes to the cheapest
 * row per arrival; the airport matrix shows them all, grouped by departure.
 */
export function flyInOptionsMulti(destinations, countries, slices, {
  startDate = '', flexMonth = '', notBefore = '', airportKm = {},
} = {}) {
  // arrival anchor -> origin -> best candidate through any dest it serves
  const byPair = new Map();
  for (const [, d] of Object.entries(destinations || {})) {
    if (!d || !countries.has(d.country)) continue;
    const anchor = destAnchor(d);
    if (!anchor) continue;
    for (const [origin, slice] of Object.entries(slices || {})) {
      const rec = slice?.[anchor];
      if (!rec || !rec.out) continue;
      const exact = startDate && !(notBefore && startDate < notBefore)
        ? (rec.out[startDate] ?? null) : null;
      const cheapest = minFare(rec.out, startDate ? '' : flexMonth, notBefore);
      if (exact == null && !cheapest) continue;
      const key = `${anchor}|${origin}`;
      const cand = {
        origin,
        anchor,
        exact_eur: exact,
        cheapest,
        sort_eur: exact != null ? exact : cheapest.eur,
        has_exact: exact != null,
      };
      const cur = byPair.get(key);
      if (!cur
        || (cand.has_exact && !cur.has_exact)
        || (cand.has_exact === cur.has_exact && cand.sort_eur < cur.sort_eur)) {
        byPair.set(key, cand);
      }
    }
  }

  const out = [];
  for (const [, best] of byPair) {
    const airportDest = destinations[best.anchor]
      || Object.values(destinations).find((x) => x.iata === best.anchor);
    if (!airportDest || airportDest.lat == null) continue;
    out.push({
      id: airportDest.id,
      key: `${best.origin}:${airportDest.id}`,
      dest: airportDest,
      originKm: airportKm[best.origin] ?? null,
      gem_score: gemScore(airportDest),
      ...best,
    });
  }
  out.sort((a, b) => {
    if (a.has_exact !== b.has_exact) return a.has_exact ? -1 : 1;
    return a.sort_eur - b.sort_eur || b.gem_score - a.gem_score;
  });
  return out;
}

/** The cheapest row per arrival airport (for the map: one pin per city you
 *  fly to), keeping each row's own key so picking a pin picks a real pair. */
export function dedupeByArrival(options) {
  const seen = new Set();
  const out = [];
  for (const o of options) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push(o);
  }
  return out;
}

/** Rows grouped per departure airport, cheapest group first, for the airport
 *  matrix ("from Brussels ... / from Charleroi ..."). */
export function groupByDeparture(options, airports) {
  const byOrigin = new Map();
  for (const o of options) {
    if (!byOrigin.has(o.origin)) byOrigin.set(o.origin, []);
    byOrigin.get(o.origin).push(o);
  }
  const meta = Object.fromEntries((airports || []).map((a) => [a.iata, a]));
  const groups = [...byOrigin.entries()].map(([iata, rows]) => ({
    iata,
    airport: meta[iata] || { iata, name: iata, km: null },
    rows: rows.slice().sort((a, b) => a.sort_eur - b.sort_eur),
    cheapest: Math.min(...rows.map((r) => r.sort_eur)),
  }));
  groups.sort((a, b) => a.cheapest - b.cheapest);
  return groups;
}

/** Drive estimate from an arbitrary point to a destination, at the app's own
 *  car model. Null when there is no honest road estimate (islands, too far). */
export function driveOption(meta, from, dest, groupSize) {
  if (!from || from.lat == null) return null;
  const est = drivingEstimate(dest, { lat: from.lat, lon: from.lon }, { group_size: groupSize }, meta?.car_model || null);
  return est;
}

/**
 * The Where step's live pricing matrix: for every country, the cheapest way
 * in across the nearby airports, the drive, and a whole-trip per-person
 * estimate at the chosen travel style:
 *
 *   total_pp = cheapest transit + nights x (bed + daily spending)
 *
 * Bed and daily figures are read from the country's best-rated city, the same
 * city whose photograph fronts the card, so the number and the picture
 * describe one place.
 *
 * @returns Map country -> { flight: {eur, origin, anchor}|null,
 *   drive: {hours, eur_pp, km}|null, stay_pp_night, daily_pp,
 *   total_pp, transit: 'fly'|'drive' }
 */
export function countryTransitMatrix(allCountries, destinations, slices, {
  from = null, nights = 7, groupSize = 2, styleKey = 'standard',
  startDate = '', flexMonth = '', notBefore = '', meta = null, lifestyle = null,
} = {}) {
  const out = new Map();
  if (!allCountries?.length) return out;

  // One pass over the catalogue: cheapest fare per country across all slices.
  const flightByCountry = new Map();
  if (slices && Object.keys(slices).length) {
    for (const [, d] of Object.entries(destinations || {})) {
      if (!d) continue;
      const anchor = destAnchor(d);
      if (!anchor) continue;
      for (const [origin, slice] of Object.entries(slices)) {
        const rec = slice?.[anchor];
        if (!rec || !rec.out) continue;
        const exact = startDate && !(notBefore && startDate < notBefore)
          ? (rec.out[startDate] ?? null) : null;
        const best = exact != null ? { date: startDate, eur: exact }
          : minFare(rec.out, startDate ? '' : flexMonth, notBefore);
        if (!best) continue;
        const cur = flightByCountry.get(d.country);
        if (!cur || best.eur < cur.eur) {
          flightByCountry.set(d.country, { eur: best.eur, origin, anchor, date: best.date });
        }
      }
    }
  }

  // The traveller's own lifestyle panel is the base a style bends; Standard
  // defers to it entirely, so tuning the panel moves these badges too.
  const dailyLifestyle = styleLifestyle(styleKey, lifestyle || meta?.defaults?.lifestyle);
  const stayTier = STYLE_BY_KEY[styleKey]?.stayTier || 'home';
  const n = Math.max(1, nights);

  for (const c of allCountries) {
    const top = c.cities?.[0]?.dest || null; // best-rated: the card's own face
    if (!top) continue;

    const flight = flightByCountry.get(c.country) || null;
    const drive = from ? driveOption(meta, from, top, groupSize) : null;

    // Bed + daily spending, per person per night, at the chosen style.
    const a = accommodationPerPerson(top, n, startDate || null, null, groupSize, stayTier);
    const stayPP = a && a.total > 0 ? a.total / n : null;
    const g = groundSpendPerPerson(top, n, dailyLifestyle);
    const dailyPP = g && g.total > 0 ? g.total / n : null;

    const flyPP = flight ? flight.eur * 2 : null;       // out + back, rough
    const drivePP = drive ? drive.per_person : null;    // already round trip
    let transit = null;
    let transitPP = null;
    if (flyPP != null && (drivePP == null || flyPP <= drivePP)) { transit = 'fly'; transitPP = flyPP; }
    else if (drivePP != null) { transit = 'drive'; transitPP = drivePP; }

    const totalPP = transitPP != null && stayPP != null && dailyPP != null
      ? Math.round(transitPP + n * (stayPP + dailyPP))
      : null;

    out.set(c.country, {
      flight,
      drive: drive ? { hours: drive.drive_hours_one_way, eur_pp: drive.per_person, km: drive.road_km } : null,
      stay_pp_night: stayPP != null ? Math.round(stayPP) : null,
      daily_pp: dailyPP != null ? Math.round(dailyPP) : null,
      transit,
      total_pp: totalPP,
      nights: n,
    });
  }
  return out;
}
