/**
 * tripStory.js, a composed itinerary explained to a traveller rather than to
 * a scorer.
 *
 * pipeline/trips ships every trip with reason codes, never prose:
 *
 *   why:  [{k:'oneBed', city:'Salzburg', n:2}, {k:'unesco', n:3},
 *          {k:'railOnly'}, {k:'namedRoute', name:'Brenner Pass'},
 *          {k:'season', months:[5,6,7,8,9]}]
 *   warned: ['stay_prices_are_country_level', 'no_written_guide']
 *
 * and this file turns both into sentences through t(). Same arrangement as
 * mountainStory.js, lakeStory.js, beachStory.js and trailStory.js, for the
 * same three reasons: the text lands in all six UI languages, every sentence
 * on screen maps to exactly one field in the data so nothing can appear that
 * no source put there, and the wire stays small enough to load a country at
 * once.
 *
 * The warnings are the part that matters most here. Every other trip planner
 * on the market presents a generated itinerary with total confidence. This
 * one says which parts it could not verify, in the same voice as the rest of
 * the page, because a trip that admits its stay prices are country level
 * averages is more useful than one that does not.
 */
import { fmtMonthRanges } from '../browse/ClimateStrip.jsx';
import { eur } from './format.js';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** A list of names as a sentence fragment: "Bruges", "Bruges and Ghent",
 *  "Bruges, Ghent and Antwerp". The separator words are translated. */
export function nameList(names, t) {
  const rows = (names || []).filter(Boolean);
  if (!rows.length) return '';
  if (rows.length === 1) return rows[0];
  const last = rows[rows.length - 1];
  return t('trip.listAnd', { head: rows.slice(0, -1).join(', '), last });
}

/* ── The headline ──────────────────────────────────────────────────────── */

/**
 * What this trip is, in one line, built from place names and a day count.
 *
 * Deliberately not an adjective. "Four days in Salzburg, out to Berchtesgaden
 * and Hallstatt" is a fact a reader can check; "an unforgettable Alpine
 * escape" is a sentence any product could print about any place.
 */
export function tripHeadline(trip, t) {
  const cities = (trip.cities || trip.stops || []).map((s) => s.city);
  const days = trip.days;
  if (trip.archetype === 'base') {
    const outs = (trip.outs || trip.daytrips || []).map((o) => o.city);
    return outs.length
      ? t('trip.headBaseOut', { days, city: cities[0], outs: nameList(outs, t) })
      : t('trip.headBase', { days, city: cities[0] });
  }
  if (trip.archetype === 'loop') {
    return t('trip.headLoop', { days, city: cities[0], n: cities.length });
  }
  return cities.length > 2
    ? t('trip.headChainLong', { days, from: cities[0], to: cities[cities.length - 1], n: cities.length })
    : t('trip.headChain', { days, from: cities[0], to: cities[cities.length - 1] });
}

/** The shape of the trip as a short chip: "One base", "Three cities", "Loop". */
export function shapeLabel(trip, t) {
  const n = (trip.cities || trip.stops || []).length;
  if (trip.archetype === 'base') return t('trip.shapeBase');
  if (trip.archetype === 'loop') return t('trip.shapeLoop', { n });
  return t('trip.shapeChain', { n });
}

/** How you get around on it: "By train", "By car", "Train and coach". */
export function transportLabel(trip, t) {
  const key = { rail: 'trip.byRail', car: 'trip.byCar', mixed: 'trip.byMixed' }[trip.transport];
  return key ? t(key) : '';
}

/** "May to September", or an honest "best months differ by stop". */
export function seasonLabel(trip, t) {
  const months = trip.season || [];
  if (!months.length) return '';
  const range = fmtMonthRanges(months);
  return trip.seasonBasis === 'all'
    ? t('trip.seasonAll', { months: range })
    : t('trip.seasonSome', { months: range });
}

/* ── Why this trip ─────────────────────────────────────────────────────── */

// Reason code to i18n key. A function where the code carries a variant that
// deserves a sentence of its own rather than an interpolated word.
const WHY_KEY = {
  oneBed: (r) => (r.n ? 'trip.whyOneBedOut' : 'trip.whyOneBed'),
  railOnly: 'trip.whyRailOnly',
  lightTravel: 'trip.whyLightTravel',
  travelHeavy: 'trip.whyTravelHeavy',
  editorialRoute: 'trip.whyEditorialRoute',
  editorialPartial: 'trip.whyEditorialPartial',
  namedRoute: 'trip.whyNamedRoute',
  unesco: (r) => (r.n > 1 ? 'trip.whyUnescoMany' : 'trip.whyUnescoOne'),
  hiddenGem: 'trip.whyHiddenGem',
  walkable: 'trip.whyWalkable',
  quiet: 'trip.whyQuiet',
  season: 'trip.whySeason',
  // The coverage floor, said out loud. A country with four places worth a
  // night still gets trips, and the page says that is what happened rather
  // than presenting a short list as a considered shortlist.
  thinCoverage: 'trip.whyThinCoverage',
};

// Short chip labels for the card, where a sentence will not fit.
const TAG_KEY = {
  railOnly: 'trip.tagRail',
  unesco: 'trip.tagUnesco',
  hiddenGem: 'trip.tagGem',
  walkable: 'trip.tagWalkable',
  quiet: 'trip.tagQuiet',
  namedRoute: 'trip.tagNamedRoute',
  lightTravel: 'trip.tagLightTravel',
  oneBed: 'trip.tagOneBed',
};

function keyFor(map, reason) {
  const entry = map[reason.k];
  return typeof entry === 'function' ? entry(reason) : entry;
}

/**
 * Every sentence the data supports, in the order the pipeline emitted them,
 * which is the order they read best: what shape the trip is, what it is made
 * of, and what corroborates it. `max` caps how many go on a card.
 */
export function tripWhy(trip, t, max) {
  const out = [];
  for (const reason of trip.why || []) {
    const key = keyFor(WHY_KEY, reason);
    if (!key) continue;
    const params = { ...reason };
    if (reason.k === 'season') params.months = fmtMonthRanges(reason.months);
    if (reason.k === 'hiddenGem') params.cities = nameList(reason.cities, t);
    const line = t(key, params);
    // A key with no catalogue entry falls back to the key itself, which must
    // never reach the page as a sentence.
    if (!line || line === key) continue;
    out.push({ k: reason.k, line });
    if (max && out.length >= max) break;
  }
  return out;
}

/** Chip labels for the card. */
export function tripTags(trip, t, max = 3) {
  const out = [];
  for (const reason of trip.why || []) {
    const key = keyFor(TAG_KEY, reason);
    if (!key) continue;
    const label = t(key, reason);
    if (!label || label === key) continue;
    out.push({ code: reason.k, label });
    if (out.length >= max) break;
  }
  return out;
}

/* ── What we could not check ───────────────────────────────────────────── */

// Every soft warning the validator can raise, as a sentence a traveller can
// act on. A warning with no entry here is not shown, because an untranslated
// code on a page is worse than a warning left unsaid.
const WARN_KEY = {
  no_shared_season: 'trip.warnSeason',
  no_editorial_link: 'trip.warnNoEditorial',
  no_written_guide: 'trip.warnNoGuide',
  sights_are_spread_out: 'trip.warnSpread',
  stay_prices_are_country_level: 'trip.warnStayPrices',
  every_stop_is_crowded: 'trip.warnCrowded',
};

export function tripWarnings(trip, t) {
  const out = [];
  for (const code of trip.warned || []) {
    const key = WARN_KEY[code];
    if (!key) continue;
    const line = t(key);
    if (!line || line === key) continue;
    out.push({ code, line });
  }
  return out;
}

/** How much of this trip was verifiable, as a short phrase for the page. */
export function checkLabel(trip, t) {
  const n = (trip.warned || []).length;
  if (!n) return t('trip.checkClean');
  return t(n === 1 ? 'trip.checkOne' : 'trip.checkMany', { n });
}

/* ── The day by day ────────────────────────────────────────────────────── */

const DAY_KEY = {
  arrive: 'trip.dayArrive',
  base: 'trip.dayBase',
  travel: 'trip.dayTravel',
  daytrip: 'trip.dayOut',
  depart: 'trip.dayDepart',
};

/**
 * The title of one day: "Day 3, out to Hallstatt", "Day 5, on to Vienna".
 * `detail` is the full trip, because a travel day needs to name where it is
 * going and a day out needs to name where it went.
 */
export function dayTitle(day, detail, t) {
  const stop = detail.stops[day.stop];
  if (day.kind === 'daytrip') {
    const out = (detail.daytrips || []).find((x) => x.dest === day.daytrip);
    return t('trip.dayOut', { d: day.d, city: out ? out.city : stop.city });
  }
  if (day.kind === 'travel') {
    return t('trip.dayTravel', { d: day.d, city: stop.city });
  }
  const key = DAY_KEY[day.kind] || 'trip.dayBase';
  return t(key, { d: day.d, city: stop.city });
}

/** The travel line under a moving day: "2 h 20 by train, 253 km, about EUR 38".
 *  The fare goes through the app's own currency formatter: printed raw it
 *  reached the page as "about 38.46", which is a float, not a price. */
export function legLine(leg, t) {
  const h = Math.floor(leg.minutes / 60);
  const m = leg.minutes % 60;
  const time = h ? t('trip.legHm', { h, m: String(m).padStart(2, '0') })
    : t('trip.legM', { m });
  const mode = t(`trip.mode${cap(leg.mode)}`);
  return t('trip.legLine', { time, mode, km: leg.km, eur: eur(leg.eur) });
}

/** Theme chips, using the trip-kind vocabulary the rest of the app filters on. */
export const THEME_ORDER = ['history', 'art', 'city', 'coast', 'nature',
  'mountains', 'food', 'nightlife', 'romantic'];

export function themeLabel(theme, t) {
  const key = `trip.theme${cap(theme)}`;
  const word = t(key);
  return word === key ? '' : word;
}

/* ── Two view helpers that both trip screens need ──────────────────────── */

/**
 * A card sized thumbnail from a hero URL.
 *
 * The wire ships Wikipedia's 960 px rendering and a card is about 330 css px
 * wide, so splicing the path cuts the grid's image bytes to roughly a third.
 * 500 rather than a rounder number because Wikimedia thumbs come in a FIXED
 * size list: an arbitrary 640 answers HTTP 400.
 */
export function cardThumb(url) {
  return url && url.includes('/960px-') ? url.replace('/960px-', '/500px-') : url;
}

/**
 * ISO2 to the country name the rest of the app prints.
 *
 * Built from the catalogue rather than from a table here, because the
 * catalogue is where every other screen gets the spelling and a second list
 * would drift from it. The trip wire carries codes so a route crossing three
 * borders costs six bytes rather than sixty.
 */
export function countryNames(data) {
  const out = {};
  for (const d of Object.values(data?.destinations || {})) {
    if (d?.iso2 && d.country && !out[d.iso2]) out[d.iso2] = d.country;
  }
  return out;
}
