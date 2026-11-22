/**
 * The facts My trips draws as graphics (G12, the "your atlas" redesign):
 * nights per year and per month, the four extremes, straight-line distance,
 * saved places per country, the year each country was first visited, the
 * trip log order and the year card's data.
 *
 * Every function takes trips in one plain shape, built by the panel from
 * the past plans and their memories:
 *   { id, title, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | null, nights,
 *     countries: [code], stops: [{ id, city, country, lat, lon }],
 *     grade: 0..10 | null, spendPP: euros | null }
 * Nights are counted on the night's own date, so a trip over New Year adds
 * to both years. Examples are never passed in: the record counts only the
 * traveller's own trips.
 *
 * Pure: no React, no i18n, no storage.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const parse = (iso) => (ISO_RE.test(iso || '') ? Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) : null);

/** Each night of a trip as [year, month 1..12]. Without an end the trip's
 *  own night count is laid from the start. */
export function nightDates(trip) {
  const s = parse(trip?.start);
  if (s == null) return [];
  const e = parse(trip.end);
  const n = e != null && e > s ? Math.round((e - s) / DAY_MS) : Math.max(0, Math.round(Number(trip.nights) || 0));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(s + i * DAY_MS);
    out.push([d.getUTCFullYear(), d.getUTCMonth() + 1]);
  }
  return out;
}

/** The year a trip belongs to: the year it started. */
export const tripYear = (trip) => (ISO_RE.test(trip?.start || '') ? Number(trip.start.slice(0, 4)) : null);

/** Nights per year, oldest first: [{ year, nights }]. Years with trips but
 *  no nights (a day trip) still appear with 0. */
export function nightsPerYear(trips = []) {
  const by = new Map();
  trips.forEach((t) => {
    const y = tripYear(t);
    if (y != null && !by.has(y)) by.set(y, 0);
    nightDates(t).forEach(([yr]) => by.set(yr, (by.get(yr) || 0) + 1));
  });
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([year, nights]) => ({ year, nights }));
}

/** Nights per month, January first (12 numbers), optionally for one year. */
export function nightsPerMonth(trips = [], { year = null } = {}) {
  const m = Array(12).fill(0);
  trips.forEach((t) => nightDates(t).forEach(([yr, mo]) => { if (year == null || yr === year) m[mo - 1] += 1; }));
  return m;
}

const stopsOf = (trips) => {
  const seen = new Map();
  trips.forEach((t) => (t.stops || []).forEach((s) => {
    if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return;
    const key = s.id || `${s.city}|${s.lat}|${s.lon}`;
    if (!seen.has(key)) seen.set(key, s);
  }));
  return [...seen.values()];
};

/** The furthest north, south, east and west stop the traveller stayed at:
 *  { n, s, e, w } (each a stop), or null without a located stop. */
export function extremes(trips = []) {
  const all = stopsOf(trips);
  if (!all.length) return null;
  const pick = (better) => all.reduce((a, b) => (better(b, a) ? b : a));
  return {
    n: pick((b, a) => b.lat > a.lat),
    s: pick((b, a) => b.lat < a.lat),
    e: pick((b, a) => b.lon > a.lon),
    w: pick((b, a) => b.lon < a.lon),
  };
}

/** Great-circle distance in km between two { lat, lon }. */
export function straightKm(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return null;
  const t = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * t) / 2) ** 2
    + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(((b.lon - a.lon) * t) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

/** A trip's stops joined in order, in straight lines (not the road). */
export function routeKm(stops = []) {
  const located = stops.filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon));
  let km = 0;
  for (let i = 1; i < located.length; i += 1) km += straightKm(located[i - 1], located[i]);
  return km;
}

/** Saved places per country, most first, then by name: [{ country, n }]. */
export function savedPerCountry(saves = []) {
  const by = new Map();
  saves.forEach((s) => { if (s?.country) by.set(s.country, (by.get(s.country) || 0) + 1); });
  return [...by.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([country, n]) => ({ country, n }));
}

/** The year each country was first visited: { [code]: year }. */
export function firstVisitYear(trips = []) {
  const out = {};
  [...trips].filter((t) => tripYear(t) != null).sort((a, b) => a.start.localeCompare(b.start))
    .forEach((t) => (t.countries || []).forEach((c) => { if (c && out[c] == null) out[c] = tripYear(t); }));
  return out;
}

const gradeOf = (t, grades) => {
  const g = grades && t.id in grades ? grades[t.id] : t.grade;
  return Number.isFinite(g) ? g : null;
};

/** The trip log: rated trips by the traveller's own grade, highest first
 *  (a tie goes to the newer trip), and the unrated ones, newest first.
 *  `grades` holds grades given in place before they are saved. */
export function tripLogOrder(trips = [], grades = null) {
  const newer = (a, b) => String(b.start || '').localeCompare(String(a.start || ''));
  const rated = trips.filter((t) => gradeOf(t, grades) != null)
    .map((t) => ({ ...t, grade: gradeOf(t, grades) }))
    .sort((a, b) => b.grade - a.grade || newer(a, b));
  const unrated = trips.filter((t) => gradeOf(t, grades) == null).sort(newer);
  return { rated, unrated };
}

/** The year card's data for one year (the latest with trips when the asked
 *  year has none): { years, year, trips, nights, countries, months,
 *  avgGrade, hasMoney }. hasMoney is false without logged spend, which
 *  switches the money item off. */
export function yearCard(trips = [], year = null, grades = null) {
  const years = [...new Set(trips.map(tripYear).filter((y) => y != null))].sort((a, b) => a - b);
  const yr = years.includes(year) ? year : (years[years.length - 1] ?? null);
  const tv = trips.filter((t) => tripYear(t) === yr);
  const months = nightsPerMonth(tv);
  const gs = tv.map((t) => gradeOf(t, grades)).filter((g) => g != null);
  return {
    years,
    year: yr,
    trips: tv,
    nights: months.reduce((a, b) => a + b, 0),
    countries: [...new Set(tv.flatMap((t) => t.countries || []))],
    months,
    avgGrade: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null,
    hasMoney: tv.some((t) => Number.isFinite(t.spendPP) && t.spendPP > 0),
  };
}
