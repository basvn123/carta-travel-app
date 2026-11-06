// The four tools (ROADMAP F7). Pure functions: (data, input) -> plain object.
// All read-only. Prices come from the app's own engine (lib/price/priceDay),
// so a figure here is the figure Explore shows for the same question.
import { priceDay, priceRequest } from '../../../continent-app/src/lib/price/index.js';
import { safeText } from './text.js';

export const STAY_TIERS = ['dorm', 'private', 'room', 'home', 'hotel2', 'hotel3', 'hotel4', 'hotel5'];
export const MAX_RESULTS = 25;
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export class ToolError extends Error {}

function card(d) {
  return {
    id: d.id,
    name: safeText(d.city, 80),
    country: safeText(d.country, 60),
    iso2: d.iso2 || null,
    tier: d.tier,
    lat: d.lat ?? null,
    lon: d.lon ?? null,
    categories: (d.categories || []).slice(0, 8),
    rating: d.rating?.score ?? null,
    blurb: safeText(d.blurb, 160),
  };
}

function requestFor({ adults = 2, children = 0, stay = 'home', nights = 1 }) {
  const seats = adults + children;
  const req = priceRequest({ choices: { group_size: seats, children, stay_tier: stay } });
  return { req: { ...req, nights }, seats };
}

/** search_places: text, country, category and tier filters, best rated first. */
export function searchPlaces(data, { query, country, category, tier, limit = 10 } = {}) {
  const { destinations } = data.catalogue();
  const q = norm(query);
  const cc = country ? String(country).toUpperCase() : null;
  const out = [];
  for (const d of Object.values(destinations)) {
    if (cc && d.iso2 !== cc && norm(d.country) !== norm(country)) continue;
    if (tier && d.tier !== tier) continue;
    if (category && !(d.categories || []).includes(category)) continue;
    let rank = 0;
    if (q) {
      const city = norm(d.city);
      if (city === q) rank = 3;
      else if (city.startsWith(q)) rank = 2;
      else if (city.includes(q) || norm(d.country).includes(q) || norm(d.blurb).includes(q)) rank = 1;
      else continue;
    }
    out.push({ rank, d });
  }
  out.sort((a, b) => b.rank - a.rank || (b.d.rating?.score ?? -1) - (a.d.rating?.score ?? -1) || String(a.d.id).localeCompare(String(b.d.id)));
  const n = Math.min(Math.max(1, limit), MAX_RESULTS);
  return { total: out.length, places: out.slice(0, n).map((x) => card(x.d)) };
}

/** place_facts: one place by id, with the day price at the app's default request. */
export function placeFacts(data, { id }) {
  const { destinations } = data.catalogue();
  const d = destinations[id];
  if (!d) throw new ToolError(`Unknown place id: ${id}. Use search_places to find ids.`);
  const day = priceDay(d, priceRequest({}), destinations);
  const c = d.costs || {};
  return {
    ...card(d),
    guide: safeText(d.guide?.text, 400),
    guide_source: d.guide?.url || null,
    day_price: day && {
      assumption: 'two adults, an entire place, easygoing lifestyle, the year average, per person per day',
      day_eur: r2(day.dayEur),
      bed_eur: r2(day.stayEur),
      food_eur: r2(day.foodEur),
      bed_quality: day.lines?.find((l) => l.key === 'bed')?.quality ?? null,
    },
    costs_eur: {
      meal_cheap: c.meal_cheap_eur ?? null, meal_mid: c.meal_mid_eur ?? null,
      coffee: c.coffee_eur ?? null, drink_out: c.drink_out_eur ?? null,
    },
    beds_eur_per_night: d.accommodation?.beds
      ? Object.fromEntries(Object.entries(d.accommodation.beds).filter(([, v]) => typeof v === 'number'))
      : null,
    beds_captured: d.accommodation?.captured || null,
    best_months: d.climate?.best || null,
    crowding: d.crowding ? { tier: d.crowding.tier, label: safeText(d.crowding.label, 40) } : null,
    designations: (d.designations || []).slice(0, 5).map((x) => safeText(x.name, 80)),
    activities: (d.activities?.items || []).slice(0, 8).map((a) => ({ name: safeText(a.name, 80), kind: safeText(a.kind, 40) })),
    image_credit: safeText(d.image?.credit, 120),
  };
}

/**
 * price_trip: stays only (bed, food and the engine's other day lines). Flights
 * and ground legs are NOT included; the result says so. total = dayEur x seats
 * x nights per stop, the engine's own identity.
 */
export function priceTrip(data, { stops, adults = 2, children = 0, stay = 'home' }) {
  const { destinations } = data.catalogue();
  if (!Array.isArray(stops) || !stops.length) throw new ToolError('stops must list at least one place.');
  const parts = [];
  let total = 0;
  const missing = [];
  for (const s of stops) {
    const d = destinations[s.id];
    if (!d) throw new ToolError(`Unknown place id: ${s.id}. Use search_places to find ids.`);
    const { req, seats } = requestFor({ adults, children, stay, nights: s.nights });
    const row = priceDay(d, req, destinations);
    if (!row || row.dayEur == null) { missing.push(s.id); continue; }
    const t = r2(row.dayEur * seats * s.nights);
    total += t;
    parts.push({ id: d.id, name: safeText(d.city, 80), nights: s.nights, day_eur_per_person: r2(row.dayEur), total_eur: t });
  }
  const nights = stops.reduce((a, s) => a + s.nights, 0);
  return {
    currency: 'EUR',
    party: { adults, children, stay },
    nights,
    stops: parts,
    unpriced_stops: missing,
    total_eur: r2(total),
    includes: 'bed, food and the engine day lines for each stop, for the whole party',
    excludes: 'flights, trains and other legs between stops, activities, car hire unless chosen in the app',
  };
}

/** list_trips: the ready-made library trips, filtered, with their budget range. */
export function listTrips(data, { country, trip_type, max_days, limit = 10 } = {}) {
  const cc = country ? String(country).toUpperCase() : null;
  const t = norm(trip_type);
  const out = data.trips().filter((j) => {
    if (cc && j.countryCode !== cc && !(j.countries || []).some((c) => c.code === cc)) return false;
    if (t && norm(j.tripType) !== t && norm(j.tripTypeSlug) !== t) return false;
    if (max_days && j.durationDays > max_days) return false;
    return true;
  });
  const n = Math.min(Math.max(1, limit), MAX_RESULTS);
  return {
    total: out.length,
    trips: out.slice(0, n).map((j) => ({
      id: j.id,
      title: safeText(j.title, 120),
      country: safeText(j.country, 60),
      country_code: j.countryCode,
      trip_type: safeText(j.tripType, 40),
      days: j.durationDays,
      best_months: j.bestPeriod?.monthNames || null,
      budget_total_eur: j.budget?.totalEur || null,
      budget_note: safeText(j.budget?.totalNote, 160),
      summary: safeText(j.summary, 300),
    })),
  };
}
