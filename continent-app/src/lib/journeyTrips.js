/**
 * journeyTrips.js (T669): the curated journeys library (258 weeks, lib/
 * journeys.js) offered as ready trips in the trip planner, beside the
 * pipeline's trips layer (lib/trips.js).
 *
 * A journey names its places in words ("Makarska", "Brela") and its gateway
 * airport by code; the planner works in catalogue destination ids. This is
 * the one bridge: a town name is resolved within the journey's countries to
 * the catalogue's best rated row of that name, the gateway's code is itself
 * a catalogue id, and a journey whose towns cannot be found in the catalogue
 * is not offered at all, rather than offered with an invented stop.
 *
 * Plain JS, node testable.
 */
import { cityKeyName } from './placeName.js';

/** The prefix that tells a journey's card id from a trips-layer id. */
export const JOURNEY_PREFIX = 'j:';

export const isJourneyId = (id) => typeof id === 'string' && id.startsWith(JOURNEY_PREFIX);

const norm = (s) => cityKeyName(String(s || '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * "IT|florence" -> the best rated catalogue id of that town in that country.
 * Built once per catalogue.
 */
export function buildCityIndex(destinations) {
  const best = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    const iso = String(d?.iso2 || '').toUpperCase();
    if (!iso || !d?.city) continue;
    const key = `${iso}|${norm(d.city)}`;
    const cur = best.get(key);
    if (!cur || (d.rating?.score || 0) > (cur.score || 0)) best.set(key, { id, score: d.rating?.score || 0 });
  }
  return new Map([...best].map(([k, v]) => [k, v.id]));
}

/** A place name to a catalogue id, trying each of the journey's countries. */
function resolve(name, ccs, index) {
  const n = norm(name);
  if (!n) return null;
  for (const cc of ccs) {
    const hit = index.get(`${cc}|${n}`);
    if (hit) return hit;
  }
  return null;
}

function countriesOf(cardOrDetail) {
  const out = new Set();
  if (cardOrDetail?.cc) out.add(String(cardOrDetail.cc).toUpperCase());
  if (cardOrDetail?.countryCode) out.add(String(cardOrDetail.countryCode).toUpperCase());
  for (const c of cardOrDetail?.countries || []) {
    const code = typeof c === 'string' ? c : c?.code;
    if (code) out.add(String(code).toUpperCase());
  }
  return [...out];
}

/**
 * A journey's library card as a ready-trip card the planner's Trips step can
 * rank and draw: the towns it visits that the catalogue knows (the gateway
 * when none of them is), its length, its photograph and its line. Null when
 * no stop can be resolved.
 */
export function journeyToTripCard(card, index, destinations) {
  if (!card?.id) return null;
  const ccs = countriesOf(card);
  const seen = new Set();
  const cities = [];
  for (const name of card.visits || []) {
    const id = resolve(name, ccs, index);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const d = destinations?.[id];
    cities.push({ city: d?.city || name, cc: String(d?.iso2 || ccs[0] || '').toUpperCase(), id });
  }
  if (!cities.length && card.gw && destinations?.[card.gw]) {
    const d = destinations[card.gw];
    cities.push({ city: d.city, cc: String(d.iso2 || ccs[0] || '').toUpperCase(), id: card.gw });
  }
  if (!cities.length) return null;
  const days = Number(card.days) || 0;
  const pd = card.pd && Number.isFinite(card.pd.low) && Number.isFinite(card.pd.high)
    ? Math.round((card.pd.low + card.pd.high) / 2)
    : null;
  return {
    id: `${JOURNEY_PREFIX}${card.id}`,
    journey: true,
    title: card.title || '',
    cc: ccs[0] || '',
    countries: ccs,
    days,
    nights: Math.max(1, days - 1),
    // Curated by hand: ranked with the strongest of the generated trips.
    score: 9,
    // Its own fold key, so two journeys never collapse into one card.
    archetype: `journey:${card.id}`,
    pace: card.tags?.includes('one-base') ? 'base' : 'moving',
    scale: 'region',
    themes: card.tags || [],
    season: card.months || [],
    cities,
    img: card.hero?.url ? { url: card.hero.url } : null,
    why: card.sub || '',
    summary: card.summary || '',
    cost: pd != null ? { per_day_eur: pd } : null,
  };
}

/**
 * A journey's detail file as the planner's stops: its base towns in order,
 * each with the nights its itinerary sleeps there (an itinerary day's
 * sleepRef names the base by position, from 1), the trip's nights shared
 * evenly when the itinerary does not say, and the card's towns or gateway
 * when the journey names no bases. Returns { stops:[{dest, nights}], missing }.
 */
export function journeyStops(detail, card, index, destinations) {
  const ccs = countriesOf(detail || card);
  const nightsTotal = Math.max(1, (Number(detail?.durationDays) || Number(card?.days) || 2) - 1);
  const bases = (detail?.basecamps || []).map((name) => resolve(name, ccs, index));
  let stops = [];
  let missing = 0;
  if (bases.length) {
    const counts = new Array(bases.length).fill(0);
    for (const day of detail?.itinerary || []) {
      const ref = Number(day?.sleepRef);
      if (Number.isInteger(ref) && ref >= 1 && ref <= bases.length) counts[ref - 1] += 1;
    }
    const counted = counts.reduce((a, b) => a + b, 0);
    bases.forEach((id, i) => {
      if (!id || !destinations?.[id]) { missing += 1; return; }
      const n = counted ? counts[i] : 0;
      stops.push({ dest: id, nights: n });
    });
    if (!counted && stops.length) {
      // No sleep references: share the nights, the first bases taking any rest.
      const each = Math.floor(nightsTotal / stops.length);
      let rest = nightsTotal - each * stops.length;
      stops = stops.map((s) => ({ ...s, nights: Math.max(1, each + (rest-- > 0 ? 1 : 0)) }));
    }
    stops = stops.filter((s) => s.nights > 0);
  }
  if (!stops.length) {
    const fromCard = card?.cities?.[0]?.id || (card?.gw && destinations?.[card.gw] ? card.gw : null)
      || (detail?.gatewayAirportCode && destinations?.[detail.gatewayAirportCode] ? detail.gatewayAirportCode : null);
    if (fromCard) stops = [{ dest: fromCard, nights: nightsTotal }];
  }
  // Two bases that resolve to one town merge their nights.
  const merged = [];
  for (const s of stops) {
    const last = merged[merged.length - 1];
    if (last && last.dest === s.dest) last.nights += s.nights;
    else merged.push({ ...s });
  }
  return { stops: merged, missing };
}
