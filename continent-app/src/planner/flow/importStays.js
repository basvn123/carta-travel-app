/**
 * importStays.js (T675, row T657-b): the stays read from uploaded bookings
 * (settings.imports, kind 'stay') as the planning engine's Your stays rows:
 * which catalogue town each one is in, how many nights, and what it cost.
 *
 * A booking prints its town in words and its check-in date; it does not
 * print the nights. So a stay runs until the next stay's check-in, and the
 * last one until the trip ends. A stay whose nights cannot be read takes an
 * even share of the trip's nights. Two bookings in one town are one stop.
 * A town the catalogue does not hold is left out rather than guessed: the
 * traveller adds it by hand, as before.
 *
 * Plain JS, node testable.
 */
import { cityKeyName } from '../../lib/placeName.js';
import { haversineKm } from '../../lib/nearby.js';

const norm = (s) => cityKeyName(String(s || '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const DAY = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

/** "lisbon" -> the best rated catalogue id of that name. Built per call. */
function cityIndex(destinations) {
  const best = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    const k = norm(d?.city);
    if (!k) continue;
    const cur = best.get(k);
    const score = d.rating?.score || 0;
    if (!cur || score > cur.score) best.set(k, { id, score });
  }
  return best;
}

/**
 * [{ id, nights, eur }] in check-in order, from the imports and the trip's
 * When ({ end, nights }). `eur` is the stay's whole price when printed.
 */
export function staysFromImports(imports, destinations, when = {}) {
  const index = cityIndex(destinations);
  const stays = (imports || [])
    .filter((b) => b && b.kind === 'stay')
    .map((b) => ({ id: index.get(norm(b.city))?.id || index.get(norm(b.title))?.id || null, date: b.date || '', eur: b.eur }))
    .filter((b) => b.id)
    .sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : 0));
  if (!stays.length) return [];
  const share = Math.max(1, Math.round((Number(when.nights) || stays.length * 2) / stays.length));
  const rows = [];
  stays.forEach((s, i) => {
    const nextDate = stays[i + 1]?.date || when.end || '';
    const gap = s.date && nextDate ? daysBetween(s.date, nextDate) : 0;
    const nights = Math.max(1, Math.min(21, gap > 0 ? gap : share));
    const same = rows.find((r) => r.id === s.id);
    const eur = Number(s.eur) > 0 ? Math.round(Number(s.eur)) : 0;
    if (same) {
      same.nights = Math.min(21, same.nights + nights);
      same.eur += eur;
    } else {
      rows.push({ id: s.id, nights, eur });
    }
  });
  return rows;
}

/**
 * The catalogue town a traveller on the road is in (T675, row T659-a): the
 * nearest one within `maxKm` of the picked place, else null (no stop is
 * invented for a place the catalogue does not cover).
 */
export function nearestStop(place, destinations, maxKm = 40) {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null;
  let best = null;
  for (const [id, d] of Object.entries(destinations || {})) {
    const lat = d?.city_lat ?? d?.lat;
    const lon = d?.city_lon ?? d?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const km = haversineKm(place.lat, place.lng, lat, lon);
    if (km <= maxKm && (!best || km < best.km || (km === best.km && (d.rating?.score || 0) > best.score))) {
      best = { id, km, score: d.rating?.score || 0 };
    }
  }
  return best ? best.id : null;
}

/**
 * Where an uploaded outbound flight lands, as the catalogue town the engine's
 * "Where do you land?" takes (the first flight out by date, else a flight of
 * unknown direction), or '' when the town is not in the catalogue.
 */
export function arrivalFromImports(imports, destinations) {
  const index = cityIndex(destinations);
  const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));
  const list = (imports || []).filter(Boolean);
  const out = [...list.filter((b) => b.kind === 'flight_out'), ...list.filter((b) => b.kind === 'flight')];
  for (const b of out.sort(byDate)) {
    const id = index.get(norm(b.city))?.id;
    if (id) return id;
  }
  return '';
}
