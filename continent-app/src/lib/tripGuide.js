/**
 * tripGuide.js - helpers for the guided ("Let us guide you") trip builder:
 * country/flag grouping and short human "insight" lines for cities.
 */
import { gemScore } from './trip_planner_pricing.js';

/** ISO-3166 alpha-2 → the corresponding flag emoji (regional indicators).
 *  Note: Windows has no flag glyphs, so these render as the two letters there -
 *  prefer `flagUrl()` for actual flag artwork. */
export function isoToFlag(iso2) {
  if (!iso2 || iso2.length !== 2) return '🏳️';
  const cc = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  const A = 0x1F1E6;
  const base = 'A'.charCodeAt(0);
  return String.fromCodePoint(A + cc.charCodeAt(0) - base) + String.fromCodePoint(A + cc.charCodeAt(1) - base);
}

/** Real flag artwork (PNG) for an ISO-3166 alpha-2 code, via flagcdn.com - the
 *  same external-image approach the app already uses for Wikipedia photos and
 *  the basemap. `w` is one of flagcdn's supported widths (20/40/80/160/…). */
export function flagUrl(iso2, w = 40) {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return null;
  return `https://flagcdn.com/w${w}/${iso2.toLowerCase()}.png`;
}

/** Group destinations into countries, each with a flag and its cities ranked
 *  by how special they are (gemScore). Countries sorted alphabetically. */
export function countriesFromData(destinations) {
  const map = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    if (!d || d.lat == null) continue;
    if (!map.has(d.country)) {
      map.set(d.country, {
        country: d.country, iso2: d.iso2, flag: isoToFlag(d.iso2),
        flagImg: flagUrl(d.iso2), cities: [], _latSum: 0, _lonSum: 0,
      });
    }
    const c = map.get(d.country);
    c.cities.push({ id, dest: d });
    c._latSum += d.lat;
    c._lonSum += d.lon;
  }
  for (const c of map.values()) {
    c.cities.sort((a, b) => gemScore(b.dest) - gemScore(a.dest));
    // Centroid = mean of the country's city coordinates - good enough to drop a
    // clickable pin roughly where the country sits on the map.
    c.centroid = { lat: c._latSum / c.cities.length, lon: c._lonSum / c.cities.length };
    delete c._latSum; delete c._lonSum;
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
  return extras.length ? `${lead}, ${extras.join(', ')}` : lead;
}

/** The catalogued things-to-do for a city, as [{ name, kind }]. */
export function cityActivities(dest, limit = 14) {
  const items = dest?.activities?.items || [];
  return items.slice(0, limit);
}

/** The Wikipedia lead-photo URL for a destination (or null). */
export function cityImage(dest) {
  return dest?.image?.url || null;
}

/** The set of "What do you enjoy?" interest keys used by the guided wizard.
 *  Kept here so the wizard's tiles and the activity filter stay in sync. */
export const INTEREST_KEYS = [
  'museums', 'outdoors', 'food', 'shopping', 'nightlife', 'culture',
  'photo', 'cafes', 'architecture', 'beaches', 'sports', 'wellness',
];

// Which interests each catalogued activity-kind speaks to. Most sights are
// culture/architecture/museums, so those are what the interest filter can
// actually thin down; kinds not listed here are always kept.
const KIND_INTERESTS = {
  Museum: ['museums'],
  Church: ['culture', 'architecture'],
  Cathedral: ['culture', 'architecture'],
  Monastery: ['culture'],
  Synagogue: ['culture'],
  Mosque: ['culture'],
  Castle: ['architecture', 'photo'],
  Palace: ['architecture', 'photo'],
  Tower: ['architecture', 'photo'],
  Bridge: ['architecture', 'photo'],
  Theatre: ['culture'],
  Square: ['culture', 'photo'],
};

/** Rank + filter a city's things-to-do by the traveller's chosen interests.
 *  Items whose kind matches an interest are kept; when interests are set we drop
 *  the non-matching ones so the picks stay relevant ("someone who doesn't care
 *  about culture doesn't want that") - unless that would leave the city empty,
 *  in which case we fall back to the full (capped) list so it's still pickable. */
export function activitiesForInterests(dest, interests, limit = 14) {
  const items = dest?.activities?.items || [];
  if (!interests || interests.size === 0) return items.slice(0, limit);
  const matches = items.filter((it) => {
    const tags = KIND_INTERESTS[it.kind];
    // Unmapped kinds are neutral: keep them so niche sights aren't lost.
    if (!tags) return true;
    return tags.some((t) => interests.has(t));
  });
  return (matches.length ? matches : items).slice(0, limit);
}
