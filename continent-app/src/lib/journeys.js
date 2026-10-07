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

/* The separators a v2.0 line puts between its parts, kept as written. */
const LINE_SEP = /(\s\/\s|\s\xB7\s|;\s+|\.\s+)/;
/* A part that opens with a figure: "38 km", "+470 m", "€40", "~3 h". */
const FIGURE_START = /^[~+\-−]?\s*[€£]?\d/;

/** The day's measured line in parts, so a page can set the figures in mono
 *  and the words in sans, and put an estimate mark on the one figure the
 *  ledger calls an estimate (T162, closing T143-h and T146-f). Each part
 *  carries the separator that goes before it, so the parts joined are the
 *  line exactly as written.
 *
 *  A v2.1 object gives one part per figure, keyed by its dayStats field, then
 *  the note. A v2.0 string is split only between its own parts: the run of
 *  parts that open with a figure ("38 km / 470 m ascent / 70% hardpack, 30%
 *  paved") stays mono as one part, and from the first part that opens with a
 *  word ("two unlit tunnels", "Water: cafés at both sites") the rest is the
 *  note, in sans. No word is changed, only the face it is set in. */
export function dayStatsParts(stats, lang) {
  if (!stats) return [];
  if (typeof stats === 'string') {
    const bits = stats.split(LINE_SEP);   // text, sep, text, sep, ...
    let lead = '';
    let i = 0;
    while (i < bits.length && FIGURE_START.test(bits[i].trim())) {
      lead += bits[i] + (i + 1 < bits.length && FIGURE_START.test((bits[i + 2] || '').trim()) ? bits[i + 1] : '');
      i += 2;
    }
    if (!lead) return [{ key: 'note', text: stats, mono: false, sep: '' }];
    if (i >= bits.length) return [{ key: 'line', text: stats, mono: true, sep: '' }];
    return [
      { key: 'line', text: lead, mono: true, sep: '' },
      { key: 'note', text: bits.slice(i).join(''), mono: false, sep: bits[i - 1] },
    ];
  }
  const num = (n) => Number(n).toLocaleString(lang, { maximumFractionDigits: 1 });
  const time = stats.timeMin || {};
  const parts = [
    ['distanceKm', Number.isFinite(stats.distanceKm) ? `${num(stats.distanceKm)} km` : ''],
    ['ascentM', Number.isFinite(stats.ascentM) ? `+${num(stats.ascentM)} m` : ''],
    ['descentM', Number.isFinite(stats.descentM) ? `-${num(stats.descentM)} m` : ''],
    ['timeMin', formatRange(time.low, time.high, minutesText)],
    ['spendEur', eurRange(stats.spendEur, lang)],
  ].filter(([, text]) => text).map(([key, text]) => ({ key, text, mono: true }));
  if (stats.note) parts.push({ key: 'note', text: String(stats.note), mono: false });
  return parts.map((part, i) => ({ ...part, sep: i ? ', ' : '' }));
}

/** The measured line under a day title as one string: a v2.0 string as
 *  written, or a v2.1 dayStats object as "52 km, +160 m, 3 h to 4 h, €3 to
 *  €4, asphalt". */
export function dayStatsLine(stats, lang) {
  return dayStatsParts(stats, lang).map((part) => part.sep + part.text).join('');
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
  return monthLabel(trip?.provenance?.ingestedAt, lang);
}

/** "2026-03-14" -> "March 2026" in the reader's language; null when the
 *  value is not a usable date. */
export function monthLabel(iso, lang) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || '');
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

/* ── Per-figure confidence (T146, spec K3) ────────────────────────────────
   A generated trip carries `figures`: one row per numeric figure, saying
   whether it is sourced (a page gave it), derived (computed from other
   figures) or estimated (general knowledge). Only the figures this page
   shows are counted, so the footer sentence is true of what is on screen:
   the budget rows, the week total and per-day range, each day's measured
   line, a stay's price and an airport transfer. A trip without `figures`
   (all 253 published v2.0 trips) has no ledger, and the page says nothing
   about it rather than guessing. */
const SHOWN_FIGURE = /^(?:budget\.(?:breakdown\.(?:accommodation|food|transport|activities)|totalEur|perDayEur)|gateways\[\d+\]\.transferMin|itinerary\[\d+\]\.dayStats\.(?:distanceKm|ascentM|descentM|timeMin|spendEur)|accommodationStrategy\[\d+\]\.priceEur)$/;
const CONFIDENCE = ['sourced', 'derived', 'estimated'];
/* The figures that are prices (T093). The same list as PRICE_PATTERNS in
   Trips/carta-unified/carta-unified/pipeline/accuracy.py; keep them equal. */
const PRICE_FIGURE = /^(?:budget\.(?:breakdown\.(?:accommodation|food|transport|activities)|totalEur|perDayEur)|eurRate|itinerary\[\d+\]\.dayStats\.spendEur|accommodationStrategy\[\d+\]\.priceEur)$/;

/** A figure a reader should look at before booking: an estimate, or a
 *  figure the ledger flags (the critic's dispute). */
function needsCheck(row) {
  return row.confidence === 'estimated' || (typeof row.flag === 'string' && row.flag.trim() !== '');
}

export function figureLedger(trip) {
  if (!Array.isArray(trip?.figures)) return null;
  const rows = trip.figures.filter((r) => r && SHOWN_FIGURE.test(r.path || '') && CONFIDENCE.includes(r.confidence));
  if (!rows.length) return null;
  const count = (c) => rows.filter((r) => r.confidence === c).length;
  const latest = rows.map((r) => r.checkedAt || '').sort().pop();
  const checks = rows.filter(needsCheck);
  return {
    by: new Map(rows.map((r) => [r.path, r.confidence])),
    total: rows.length,
    sourced: count('sourced'),
    derived: count('derived'),
    estimated: count('estimated'),
    checkedAt: latest || null,
    /* T093: the rows the reader should check, and whether a price is one. */
    toCheck: checks.length,
    volatile: checks.some((r) => PRICE_FIGURE.test(r.path)),
  };
}

/**
 * The two signals behind the "check before you book" line (T093, spec J4).
 * One rule, in one place, the same as pipeline/accuracy.py: with a ledger,
 * the count is the shown figures that are estimated or flagged and volatile
 * means one of them is a price; without a ledger (a v2.0 trip) the count is
 * the trip's own verifyFlagCount and volatile means there is at least one.
 * So the line and the figure footer under it can never disagree: they are
 * read off the same rows. `from` says which rule applied.
 */
export function accuracySignals(trip, ledger) {
  if (ledger) {
    return { count: ledger.toCheck, volatile: ledger.volatile, from: 'ledger' };
  }
  const n = Number(trip?.verifyFlagCount);
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return { count, volatile: count > 0, from: 'record' };
}

/** True when any of the figure paths is an estimate. */
export function anyEstimated(ledger, ...paths) {
  return !!ledger && paths.some((p) => ledger.by.get(p) === 'estimated');
}

/** The estimate marks a day's measured line needs: true when any of its
 *  shown figures is estimated. */
export function dayEstimated(ledger, index) {
  return ['distanceKm', 'ascentM', 'descentM', 'timeMin', 'spendEur']
    .some((k) => dayFigureEstimated(ledger, index, k));
}

/** True when one figure of a day's measured line is an estimate. */
export function dayFigureEstimated(ledger, index, key) {
  return !!ledger && ledger.by.get(`itinerary[${index}].dayStats.${key}`) === 'estimated';
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

/* ── One sentence, three exits, one human detail (T171, spec M7 + M8 + M10) ─ */

const stripBold = (s) => String(s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

/* Sentence split that does not cut at "St.", "km.", "e.g." or a decimal. */
const ABBR = /(?:\b(?:St|Mt|Dr|Mr|Mrs|Ms|vs|e\.g|i\.e|c|approx|no|km|m|ca)\.)$/i;
function sentences(text) {
  const clean = stripBold(text);
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-Z"\u201C\u00C0-\u00DE])/);
  const out = [];
  for (const p of parts) {
    if (out.length && ABBR.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

const NUMBER_WORD = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|forty|fifty|hundred|thousand)\b/i;
const MAX_LINE = 190;

function clip(sentence) {
  if (sentence.length <= MAX_LINE) return sentence;
  const cut = sentence.slice(0, MAX_LINE);
  const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(': '), cut.lastIndexOf('; '));
  return `${(at > 80 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(' '))).replace(/[,;:]$/, '')}.`;
}

/**
 * The one-line reason this week exists. Looks in the authored hook, then the
 * summary: the first sentence of 40 to 190 characters that carries a number
 * (a digit or a number word), else the first sentence, clipped at a clause.
 * Returns { line, rest } where rest is the source text minus that sentence,
 * so the fold under it does not say it twice; null when there is no prose.
 */
export function hookLine(trip) {
  for (const key of ['hook', 'summary']) {
    if (key === 'summary' && trip?.summaryGenerated) continue;
    const list = sentences(trip?.[key]);
    if (!list.length) continue;
    const fits = (s) => s.length >= 40 && s.length <= MAX_LINE;
    const pick = list.find((s) => fits(s) && (/\d/.test(s) || NUMBER_WORD.test(s))) || list.find(fits) || list[0];
    const rest = list.filter((s) => s !== pick).join(' ');
    return { line: clip(pick), source: key, rest };
  }
  // A generated trip has no authored prose worth quoting. Build the line from
  // the days themselves: how many, where, and the first and last stop.
  const days = trip?.itinerary || [];
  const head = (d) => String(d?.title || '').split(':')[0].trim();
  const place = [trip?.subRegion || trip?.country].filter(Boolean).join('');
  if (days.length > 1 && place && head(days[0]) && head(days[days.length - 1])) {
    return { built: { n: days.length, place, first: head(days[0]), last: head(days[days.length - 1]) }, source: 'built', rest: '' };
  }
  return null;
}

/**
 * A detail only someone who went would know: the first pro tip that carries
 * a figure, else the first tip, trimmed to two sentences. Null when none.
 */
export function humanDetail(trip) {
  const tips = (trip?.proTips || []).map(stripBold).filter(Boolean);
  if (!tips.length) return null;
  const tip = tips.find((s) => /\d/.test(s)) || tips[0];
  const list = sentences(tip);
  const out = list.slice(0, 2).join(' ');
  return out.length > 260 ? list[0] : out;
}

/** Every card of every style, once, from the index. Resolves [] when absent. */
export function loadAllJourneyCards() {
  return loadJourneyIndex().then((ix) => {
    if (!ix) return [];
    return Promise.all(ix.types.map((tp) => loadJourneyType(tp.slug)
      .then((rows) => (rows || []).map((r) => ({ ...r, type: tp.slug })))))
      .then((lists) => lists.flat());
  });
}

const mid = (c) => (c?.eur ? (c.eur.low + c.eur.high) / 2 : null);

/**
 * Three computed ways out of a trip, from difficulty, cost and place; nothing
 * hand-picked. easier: one step gentler (or the nearest gentler) in the same
 * country and style first, widening to country, then style. cheaper: at least
 * 15 percent lower in total, the least change of character first. nearby:
 * same country, another style, closest in price. A slot with no candidate
 * even after widening is left out, and the page shows what it has.
 * `cards` is the whole library; `me` is this trip's card or the full trip.
 */
export function journeyExits(me, cards) {
  if (!me || !Array.isArray(cards)) return [];
  const cc = me.cc || me.countryCode;
  const type = me.type || me.tripTypeSlug;
  const myDiff = me.diff ?? me.profile?.difficulty;
  const myMid = mid(me.eur ? me : { eur: me.budget?.totalEur ? { low: me.budget.totalEur.low, high: me.budget.totalEur.high } : null });
  const others = cards.filter((c) => c.id !== me.id);
  const used = new Set();
  const take = (list, score) => {
    const ranked = list.filter((c) => !used.has(c.id)).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
    if (!ranked.length) return null;
    used.add(ranked[0].id);
    return ranked[0];
  };
  const sameC = (c) => (c.cc === cc ? 3 : 0);
  const sameT = (c) => (c.type === type ? 2 : 0);
  const exits = [];

  if (Number.isFinite(myDiff) && myDiff > 1) {
    const easier = others.filter((c) => Number.isFinite(c.diff) && c.diff < myDiff);
    const pick = take(easier, (c) => sameC(c) + sameT(c) - Math.abs(c.diff - (myDiff - 1)) * 1.5
      - (myMid && mid(c) ? Math.abs(mid(c) - myMid) / myMid : 0));
    if (pick) exits.push({ kind: 'easier', card: pick });
  }
  if (myMid) {
    const cheaper = others.filter((c) => mid(c) && mid(c) <= myMid * 0.85);
    const pick = take(cheaper, (c) => sameC(c) + sameT(c)
      - Math.abs((c.diff ?? myDiff ?? 0) - (myDiff ?? 0)) - (myMid - mid(c)) / myMid);
    if (pick) exits.push({ kind: 'cheaper', card: pick });
  }
  const near = others.filter((c) => c.cc === cc && c.type !== type);
  const nearPick = take(near.length ? near : others.filter((c) => c.type !== type),
    (c) => sameC(c) - (myMid && mid(c) ? Math.abs(mid(c) - myMid) / myMid : 0));
  if (nearPick) exits.push({ kind: 'nearby', card: nearPick });
  // The gentlest or cheapest trip in the library has no easier or cheaper
  // sibling. Fill the empty slot with another trip in the same country, or
  // failing that the nearest in price, so no page is a dead end.
  while (exits.length < 3) {
    const more = take(others.filter((c) => c.cc === cc).length ? others.filter((c) => c.cc === cc) : others,
      (c) => sameT(c) - (myMid && mid(c) ? Math.abs(mid(c) - myMid) / myMid : 0));
    if (!more) break;
    exits.push({ kind: 'nearby', card: more });
  }
  return exits;
}
