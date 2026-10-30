/**
 * doorTrips.js, the trips two of the four doors make (T864, T865, plan flow
 * v3 Batch D), on the trip finder's own engine so a door's figure is the
 * finder's figure and the planner's.
 *
 *   flightRows(input)  Find my flight first: one row per place the answers
 *                      allow, each a one-base trip priced by quoteTrip with
 *                      the flight there and home from every airport in reach
 *                      (T861 door to door), cheapest flight for the group
 *                      first. Narrowed by every answer already given: the
 *                      named places (or, with none, the likes and weather
 *                      through matchCountries), the dates or month, the
 *                      nights, the airports in reach, the budget.
 *   knowTrip(input)    I know where I'm going: a priced draft route through
 *                      the named places (the towns in the order named, the
 *                      nights split the planner's way; a named country gives
 *                      the finder's best trip in it).
 *
 * input is the trip finder's (buildCandidates): { data, countryInsights,
 * layerIndexes, settings, taste, origin, flights, lifestyle, stayTier, today }.
 * Pure and node-runnable (tests/doorTrips.test.mjs).
 */
import RECOMMEND from '../../../config/recommend.json' with { type: 'json' };
import { matchCountries } from '../countryMatch.js';
import { qualityOf } from '../match.js';
import { isGateway } from '../rating.js';
import { quizAnswers, spendFor } from '../../planner/flow/tripSettings.js';
import {
  bestMonth, datesFor, fliesThere, gatewayFor, namedPool, setupMonth, splitNights, tasteFor, transportFor,
} from './candidates.js';
import { priceCandidate } from './trips.js';
import { rankTrips, budgetOf } from './rank.js';
import { buildTrips } from './trips.js';

/** How many places a flight list is built from, and how many rows it may show. */
export const FLIGHT_FIRST = Object.freeze({ pool: 48, perCountry: 4, rows: 30 });

const up = (x) => String(x || '').toUpperCase();

/** The home airports' swept files (the origin's first), as gatewayFor reads them. */
function homeFilesOf(input) {
  return [input.flights, ...Object.values(input.data?.flightsBy || {})]
    .filter((f, i, all) => f && all.findIndex((g) => g?.from === f.from) === i);
}

/** The best rated places with a photograph, a few a country, when no like narrows them. */
function openPool(destinations, month, perCountry) {
  const rows = Object.entries(destinations)
    .filter(([, d]) => d && d.lat != null && !isGateway(d) && d.image?.url)
    .map(([id, d]) => ({ id, iso2: up(d.iso2), q: qualityOf(d, month) ?? d.rating?.score ?? 0 }))
    .sort((a, b) => b.q - a.q);
  const per = new Map();
  const out = [];
  for (const r of rows) {
    const n = per.get(r.iso2) || 0;
    if (n >= perCountry) continue;
    per.set(r.iso2, n + 1);
    out.push(r.id);
  }
  return out;
}

/**
 * The places a flight list is built from, best first: the named places (a
 * named town itself, a named country's best places), else the countries the
 * likes and weather match with their best places, else the catalogue's best.
 */
export function flightPlaces(input) {
  const { data, countryInsights = null, layerIndexes = {}, settings, taste = null, origin = null, today } = input;
  const destinations = data?.destinations || {};
  const month = setupMonth(settings, today);
  const { pool, perCountry } = FLIGHT_FIRST;
  const named = namedPool(settings.places, { destinations, month });
  if (named) {
    const ids = [];
    for (const { ids: list, town } of named) {
      for (const id of town ? list.slice(0, 1) : list.slice(0, pool)) if (!ids.includes(id)) ids.push(id);
    }
    return ids.slice(0, pool);
  }
  const matched = matchCountries({
    destinations,
    insights: countryInsights,
    layerIndexes,
    answers: quizAnswers(settings, spendFor(settings)),
    month,
    origin: origin?.lat != null ? { lat: origin.lat, lon: origin.lon } : null,
    taste: tasteFor(settings, taste),
    topN: perCountry,
  });
  if (matched.length) return matched.flatMap((c) => (c.topPlaces || []).slice(0, perCountry)).slice(0, pool);
  return openPool(destinations, month, perCountry).slice(0, pool);
}

/** A one-base candidate at `id`, or null when it cannot fly (no swept gateway). */
function oneBase(id, input, homeFiles, { swept = true } = {}) {
  const { data, settings, origin = null, today } = input;
  const destinations = data?.destinations || {};
  const d = destinations[id];
  if (!d) return null;
  const month = setupMonth(settings, today) ?? bestMonth([d], settings.guide.weather, today);
  const dates = datesFor(settings, month, today);
  if (!dates.out) return null;
  const gateway = gatewayFor([id], { destinations, flights: homeFiles, out: dates.out, origin: origin?.iata || null });
  if (!gateway || (swept && !gateway.swept)) return null;
  return {
    country: d.country,
    iso2: d.iso2,
    shape: 'one',
    transport: 'auto',
    places: [{ id, nights: dates.nights }],
    gateway,
    month,
    dates: { out: dates.out, back: dates.back },
    datesFromSetup: dates.fromSetup,
    nights: dates.nights,
    signals: { countryScore: 0, countryReasons: [], topType: null, bestMonth: null, gaps: [] },
  };
}

/** The flight slot's priced pick, both ways, or null. */
export function flightOf(trip) {
  const slot = trip?.slots?.find((s) => s.id === 'flight');
  const facts = slot?.pick?.facts;
  if (!slot || !(slot.eurGroup > 0) || !facts?.out || !facts?.back) return null;
  if (facts.source !== 'swept' && facts.source !== 'live') return null;
  return { eurGroup: slot.eurGroup, eur: slot.eur, facts };
}

/**
 * Find my flight first (T864): the rows, cheapest flight for the group
 * first. One row per place, and one place per arrival airport (two towns
 * served by one airport would be the same flight twice). A trip a person
 * over the budget is left out when a budget was given; a flight over it on
 * its own always is.
 *
 *   -> [{ trip, flight: { eurGroup, eur, facts } }]
 */
export function flightRows(input, { limit = FLIGHT_FIRST.rows } = {}) {
  const homeFiles = homeFilesOf(input);
  if (!homeFiles.length) return [];
  const rows = [];
  const airports = new Set();
  for (const id of flightPlaces(input)) {
    const c = oneBase(id, input, homeFiles);
    if (!c || airports.has(c.gateway.iata)) continue;
    const trip = priceCandidate(c, input);
    const flight = flightOf(trip);
    if (!flight) continue;
    const budget = budgetOf(input.settings, trip.nights);
    if (budget && (flight.eur > budget || (trip.total?.perPerson ?? 0) > budget)) continue;
    airports.add(c.gateway.iata);
    rows.push({ trip, flight });
  }
  rows.sort((a, b) => (a.flight.eurGroup - b.flight.eurGroup)
    || ((a.flight.facts.stops ?? 0) - (b.flight.facts.stops ?? 0))
    || a.trip.id.localeCompare(b.trip.id));
  return rows.slice(0, limit);
}

/** The named towns the catalogue holds, in the order named (at most config towns.maxPlaces + 1). */
function namedTowns(settings, destinations) {
  return (settings.places || [])
    .filter((p) => p.kind === 'place' && destinations[p.id])
    .map((p) => p.id)
    .filter((id, i, a) => a.indexOf(id) === i)
    .slice(0, RECOMMEND.candidates.towns.maxPlaces + 1);
}

/**
 * I know where I'm going (T865): one priced trip through the named places,
 * or null when none can be built. Named towns are the route, in the order
 * named, the nights split the planner's way (a town for every night at
 * most); with only countries named, the finder's best trip among them
 * (its candidates are the named pool, T859).
 */
export function knowTrip(input) {
  const { data, settings, origin = null, taste = null, today } = input;
  const destinations = data?.destinations || {};
  const towns = namedTowns(settings, destinations);
  if (towns.length) {
    const dests = towns.map((id) => destinations[id]);
    const month = setupMonth(settings, today) ?? bestMonth(dests, settings.guide.weather, today);
    const dates = datesFor(settings, month, today);
    const ids = towns.slice(0, Math.max(1, dates.nights));
    const nights = splitNights(dates.nights, ids.length);
    const shape = ids.length > 1 ? 'towns' : 'one';
    const flies = fliesThere(settings);
    const first = destinations[ids[0]];
    const c = {
      country: first.country,
      iso2: first.iso2,
      shape,
      transport: transportFor(shape, settings),
      places: ids.map((id, i) => ({ id, nights: nights[i] })),
      gateway: flies ? gatewayFor(ids, { destinations, flights: homeFilesOf(input), out: dates.out, origin: origin?.iata || null }) : null,
      month,
      dates: dates.out ? { out: dates.out, back: dates.back } : null,
      datesFromSetup: dates.fromSetup,
      nights: dates.nights,
      signals: { countryScore: 0, countryReasons: [], topType: null, bestMonth: null, gaps: [] },
    };
    return priceCandidate(c, input);
  }
  if (!(settings.places || []).some((p) => p.kind === 'country')) return null;
  const ranked = rankTrips(buildTrips(input), { settings, taste, data });
  return ranked[0] || null;
}
