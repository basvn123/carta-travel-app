/**
 * tripGuide.js — helpers for the guided ("Let us guide you") trip builder:
 * country/flag grouping and short human "insight" lines for cities.
 */
import { gemScore } from './trip_planner_pricing.js';

/** ISO-3166 alpha-2 → the corresponding flag emoji (regional indicators). */
export function isoToFlag(iso2) {
  if (!iso2 || iso2.length !== 2) return '🏳️';
  const cc = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  const A = 0x1F1E6;
  const base = 'A'.charCodeAt(0);
  return String.fromCodePoint(A + cc.charCodeAt(0) - base) + String.fromCodePoint(A + cc.charCodeAt(1) - base);
}

/** Group destinations into countries, each with a flag and its cities ranked
 *  by how special they are (gemScore). Countries sorted alphabetically. */
export function countriesFromData(destinations) {
  const map = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    if (!d || d.lat == null) continue;
    if (!map.has(d.country)) {
      map.set(d.country, { country: d.country, iso2: d.iso2, flag: isoToFlag(d.iso2), cities: [] });
    }
    map.get(d.country).cities.push({ id, dest: d });
  }
  for (const c of map.values()) {
    c.cities.sort((a, b) => gemScore(b.dest) - gemScore(a.dest));
  }
  return [...map.values()].sort((a, b) => a.country.localeCompare(b.country));
}

const CAT_WORDS = {
  village: 'charming village', oldtown: 'historic old town', medieval: 'medieval town',
  fairytale: 'fairytale town', coast: 'coastal escape', beach: 'beach town',
  island: 'island getaway', alps: 'alpine base', mountains: 'mountain town',
  lake: 'lakeside town', valley: 'mountain valley', wine: 'wine country',
  countryside: 'countryside retreat', nightlife: 'nightlife hub', party: 'party town',
  luxury: 'luxury escape', city: 'city break', capital: 'capital city',
};

/** A short, human tagline for a city card. Prefers the curated blurb; otherwise
 *  composes one from category + heritage/beauty/things-to-do signals. */
export function cityInsight(dest) {
  if (!dest) return '';
  if (dest.blurb && dest.blurb.trim()) return dest.blurb.trim();
  const cats = dest.categories || [];
  const word = cats.map((c) => CAT_WORDS[c]).find(Boolean);
  const lead = word ? word.charAt(0).toUpperCase() + word.slice(1) : 'Worth a stop';
  const extras = [];
  if (dest.beauty?.unesco) extras.push('UNESCO');
  const nAct = (dest.activities && dest.activities.items ? dest.activities.items.length : 0);
  if (nAct) extras.push(`${nAct} things to do`);
  return extras.length ? `${lead} · ${extras.join(' · ')}` : lead;
}

/** The catalogued things-to-do for a city, as [{ name, kind }]. */
export function cityActivities(dest, limit = 14) {
  const items = dest?.activities?.items || [];
  return items.slice(0, limit);
}
