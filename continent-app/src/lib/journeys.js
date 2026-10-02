/**
 * journeys.js, the curated trip library: 253 editorial week-long trips in
 * ten styles (cycling, trail running, city, cozy towns, road trips, hiking,
 * culinary, winter sports, nature escapes, water sports), written by hand
 * and unified by the Trips/carta-unified pipeline.
 *
 * Three artifacts, written by pipeline/journeys/build_wire.py:
 *   /journeys/index.json          the ten styles, a hero photo and count each
 *   /journeys/type/{slug}.json    one style's trips as CARDS
 *   /journeys/journey/{id}.json   one trip in full: 7 days, budget, logistics
 *
 * Same repo gotcha as trips.js and friends: under public/ a missing JSON is
 * served as the SPA index with status 200, so every fetch checks the content
 * type and resolves null instead of throwing on "<!doctype".
 */

import { dataUrl } from './dataHost.js';
import { formatRange } from './format.js';

const SLUG_RE = /^[a-z-]{3,30}$/;
const ID_RE = /^[a-z]{2}-[a-z0-9-]{3,90}$/;

function isJson(res) {
  return res.ok && (res.headers.get('content-type') || '').includes('json');
}

function loadJson(url) {
  return fetch(dataUrl(url))
    .then((r) => (isJson(r) ? r.json() : null))
    .catch(() => null);
}

const cache = new Map();

function cached(url) {
  if (!cache.has(url)) cache.set(url, loadJson(url));
  return cache.get(url);
}

/** The ten styles, in schema order, each with n, countries and a hero. */
export function loadJourneyIndex() {
  return cached('/journeys/index.json').then((raw) => {
    if (!raw || !Array.isArray(raw.types)) return null;
    const types = raw.types.filter((t) => t && t.slug && t.n > 0);
    return types.length ? { ...raw, types } : null;
  });
}

/** Every trip of one style, as cards, or null. */
export function loadJourneyType(slug) {
  const key = String(slug || '');
  if (!SLUG_RE.test(key)) return Promise.resolve(null);
  return cached(`/journeys/type/${key}.json`).then((raw) => {
    if (!raw || !Array.isArray(raw.trips)) return null;
    return raw.trips.filter((t) => t && t.id);
  });
}

/** One trip in full, or null. */
export function loadJourney(id) {
  const key = String(id || '');
  if (!ID_RE.test(key)) return Promise.resolve(null);
  return cached(`/journeys/journey/${encodeURIComponent(key)}.json`)
    .then((raw) => ((raw && raw.id && Array.isArray(raw.itinerary)) ? raw : null));
}

/* ── Labels ──────────────────────────────────────────────────────────────── */

// Style slug -> the i18n key naming it. The wire's own `name` field is the
// English fallback for a slug this map has not met.
export const TYPE_LABEL_KEY = {
  cycling: 'journey.typeCycling',
  'trail-running': 'journey.typeTrailRunning',
  city: 'journey.typeCity',
  'cozy-towns': 'journey.typeCozyTowns',
  'road-trip': 'journey.typeRoadTrip',
  hiking: 'journey.typeHiking',
  culinary: 'journey.typeCulinary',
  'winter-sports': 'journey.typeWinterSports',
  'nature-escape': 'journey.typeNatureEscape',
  'water-sports': 'journey.typeWaterSports',
};

export const typeLabel = (slug, t, fallback = '') => {
  const key = TYPE_LABEL_KEY[slug];
  return key ? t(key) : (fallback || slug);
};

// Difficulty labels are a five-word enum in the schema; translated here.
const DIFF_KEY = {
  Easy: 'journey.diffEasy',
  Moderate: 'journey.diffModerate',
  Active: 'journey.diffActive',
  Demanding: 'journey.diffDemanding',
  Expert: 'journey.diffExpert',
};

export const diffLabel = (label, t) => (DIFF_KEY[label] ? t(DIFF_KEY[label]) : (label || ''));

/** "May, Jun, Sep" from a month-number array, in the app language. */
export function monthsShort(months, lang) {
  if (!Array.isArray(months) || !months.length) return '';
  try {
    const fmt = new Intl.DateTimeFormat(lang, { month: 'short' });
    return months
      .filter((m) => m >= 1 && m <= 12)
      .map((m) => fmt.format(new Date(2026, m - 1, 1)))
      .join(', ');
  } catch {
    return months.join(', ');
  }
}

/** "€950 to €1,400" from a {low, high} pair, or '' when the record has neither.
 *  The join itself lives in format.js formatRange, the only place a range is
 *  written. */
export function eurRange(pair, lang) {
  if (!pair) return '';
  return formatRange(pair.low, pair.high, (n) => `€${Math.round(n).toLocaleString(lang)}`);
}

/* ── Schema v2.1 typed fields ─────────────────────────────────────────────
   A generated trip (Trips/carta-unified/carta-unified/schema/
   trip.generated.schema.json, task T143) stores as typed values what a v2.0
   trip wrote as a sentence: the day's measured line, the packing list, the
   advisories, the hotel price. The page renders both shapes; each helper
   below returns the v2.0 string unchanged and formats the v2.1 object, so
   the 253 published trips look exactly as before. */

/** 210 -> "3 h 30 min", 45 -> "45 min". Units are symbols, not words. */
export function minutesText(min) {
  if (!Number.isFinite(min)) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** The mono line under a day title: a v2.0 string as written, or a v2.1
 *  dayStats object as "52 km, +160 m, 3 h to 4 h, €3 to €4, asphalt". */
export function dayStatsLine(stats, lang) {
  if (!stats) return '';
  if (typeof stats === 'string') return stats;
  const num = (n) => Number(n).toLocaleString(lang, { maximumFractionDigits: 1 });
  const time = stats.timeMin || {};
  return [
    Number.isFinite(stats.distanceKm) ? `${num(stats.distanceKm)} km` : '',
    Number.isFinite(stats.ascentM) ? `+${num(stats.ascentM)} m` : '',
    Number.isFinite(stats.descentM) ? `-${num(stats.descentM)} m` : '',
    formatRange(time.low, time.high, minutesText),
    eurRange(stats.spendEur, lang),
    stats.note || '',
  ].filter(Boolean).join(', ');
}

/** One packing entry: a v2.0 sentence, or v2.1 {item, whyThisTrip}. */
export function packingText(note) {
  if (!note || typeof note === 'string') return note || '';
  const item = String(note.item || '').trim();
  const why = String(note.whyThisTrip || '').trim();
  return [item && !/[.!?]$/.test(item) ? `${item}.` : item, why].filter(Boolean).join(' ');
}

/** One advisory: a v2.0 sentence, or v2.1 {trigger, consequence, whatToDo}.
 *  `doLine` wraps the remedy in the reader's language. */
export function riskText(item, doLine) {
  if (!item || typeof item === 'string') return item || '';
  const trigger = String(item.trigger || '').trim();
  return [
    trigger && !/[.!?]$/.test(trigger) ? `${trigger}.` : trigger,
    item.consequence,
    item.whatToDo ? doLine(item.whatToDo) : '',
  ].filter(Boolean).join(' ');
}

/** A stay's price: v2.1 priceEur as a range ahead of its note, or the v2.0
 *  priceNote, which carries its figures inside the sentence. */
export function stayPriceText(stay, lang) {
  const range = eurRange(stay?.priceEur, lang);
  return [range, stay?.priceNote].filter(Boolean).join(' ');
}

/**
 * The source prose carries **bold** markers. Rendered as segments rather
 * than dangerouslySetInnerHTML, so harvested text can never become markup.
 */
export function boldSegments(text) {
  const parts = String(text || '').split('**');
  return parts.map((chunk, i) => ({ text: chunk, bold: i % 2 === 1 }));
}

/**
 * The month a trip was last checked, written out in the reader's language
 * ("September 2026"). It comes from provenance.ingestedAt, the date the trip
 * entered the catalogue; null when the trip has no usable date, so the page
 * falls back to the bare data year rather than printing a guess.
 */
export function lastCheckedMonth(trip, lang) {
  const m = /^(\d{4})-(\d{2})/.exec(trip?.provenance?.ingestedAt || '');
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  try {
    return new Intl.DateTimeFormat(lang || 'en', { month: 'long', year: 'numeric' })
      .format(new Date(Number(m[1]), month - 1, 1));
  } catch {
    return null;
  }
}

/**
 * What the index can say about its own coverage, from the index alone: how
 * many trips, in how many countries, and how many of those countries have
 * fewer than half of the styles. Counts, not adjectives.
 */
export function coverageFacts(index) {
  const types = index?.types || [];
  const styles = types.length;
  const perCountry = new Map();
  for (const tp of types) {
    for (const cc of tp.countries || []) perCountry.set(cc, (perCountry.get(cc) || 0) + 1);
  }
  const half = Math.ceil(styles / 2);
  let thin = 0;
  perCountry.forEach((n) => { if (n < half) thin += 1; });
  return {
    trips: types.reduce((a, tp) => a + (tp.n || 0), 0),
    countries: perCountry.size,
    styles,
    thin,
    stylesIn: (cc) => perCountry.get(cc) || 0,
  };
}
