/**
 * Viantra's own places in the shape search reads (G12). Built from
 * `data.destinations` (lite records carry city, country, categories and the
 * town's position, lib/bootIndex.js RANK_FIELDS), so search needs no list
 * of its own. A multi-airport city's other airports are left out, as
 * Explore leaves them out (`gateway_of`, T755).
 */
import { foldName } from '../searchIndex.js';

/** "Luberon (Gordes)" -> ["Luberon (Gordes)", "Luberon", "Gordes"] folded. */
function foldsOf(city) {
  const out = new Set([foldName(city)]);
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(city || '');
  if (m) {
    out.add(foldName(m[1]));
    for (const part of m[2].split(/[,/]/)) out.add(foldName(part));
  }
  out.delete('');
  return [...out];
}

/** 'Venice (Marco Polo)' -> 'Venice'. */
export function cityPart(name) {
  const m = /^(.*?)\s*\(.*\)\s*$/.exec(name || '');
  return (m ? m[1] : name || '').trim();
}

export function cartaPlaces(data) {
  const dests = data?.destinations;
  if (!dests) return [];
  const out = [];
  for (const [id, d] of Object.entries(dests)) {
    if (!d || d.gateway_of) continue;
    const lat = d.city_lat ?? d.lat;
    const lon = d.city_lon ?? d.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const airport = d.tier === 'airport';
    out.push({
      id: d.id || id,
      // An airport-tier record is the city's own place, named after its
      // airport ('London (Heathrow)'); search shows the city, never the
      // airport (decision.md APPROVED: no airport talk). Gems keep their
      // whole name: there the brackets hold the village ('Luberon (Gordes)').
      city: airport ? cityPart(d.city) : (d.city || ''),
      airport,
      country: d.country || '',
      iso2: d.iso2 || '',
      lat,
      lon,
      categories: d.categories || [],
      folds: foldsOf(d.city || ''),
    });
  }
  return out;
}

const R = 6371;
const rad = (x) => (x * Math.PI) / 180;

/** Great-circle distance in km. */
export function kmBetween(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function inBox(p, bbox) {
  return !!bbox && p.lon >= bbox[0] && p.lat >= bbox[1] && p.lon <= bbox[2] && p.lat <= bbox[3];
}
