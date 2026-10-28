/**
 * The traveller rating (Carta rating v5, Roadmap/2.10b-rating-v5.md). This is
 * the only module that turns a score into words: every screen asks it for the
 * band, the word, the class rank line, the confidence and the POI label, so
 * one place reads the same on a card, a page, a PDF and the planner.
 *
 * The cutoffs and the part weights come from config/rating.json, the file the
 * pipeline scores with, so the app can never drift from the model. Keeps the
 * filter slicer, the URL codec and the account sync speaking one language
 * about the 0-10 score.
 */
import RATING from '../../config/rating.json' with { type: 'json' };

export const RATING_MIN = 0;
export const RATING_MAX = 10;
// A range that imposes no constraint: the whole 0-10 scale.
export const FULL_RATING_RANGE = [RATING_MIN, RATING_MAX];

/** The five bands, best first (owner decision 2026-10-27). */
export const BANDS = Object.freeze(['exceptional', 'excellent', 'very_good', 'good', 'pleasant']);

/** Lower cutoff of each band: 9.0, 8.3, 7.6, 6.9, 6.0. Nothing under 6.0. */
export const BAND_CUTOFFS = Object.freeze({ ...RATING.bands.cutoffs });

/** The part weights of the score (appeal, beauty, depth, recognition). */
export const PART_WEIGHTS = Object.freeze(Object.fromEntries(
  Object.entries(RATING.weights_v5).filter(([k]) => !k.startsWith('_')),
));

/** The band a score falls in, or null under the lowest cutoff. */
export function bandForScore(score) {
  const s = Number(score);
  if (score == null || !Number.isFinite(s)) return null;
  for (const b of BANDS) if (s >= BAND_CUTOFFS[b]) return b;
  return null;
}

/** The band of a rating ({ score }), a nature row's v5 ({ score }) or a bare number. */
export function bandOf(r) {
  if (r == null) return null;
  return bandForScore(typeof r === 'number' ? r : r.score);
}

/** Rank of a band, 5 for Exceptional down to 1 for Pleasant, 0 for none. */
export function bandRank(band) {
  const i = BANDS.indexOf(band);
  return i < 0 ? 0 : BANDS.length - i;
}

/** True when a rating sits in `band` or above. */
export function bandAtLeast(r, band) {
  const have = bandRank(bandOf(r));
  return have > 0 && have >= bandRank(band);
}

/** The i18n key of a band's word. */
export function bandKey(band) {
  return band && BANDS.includes(band) ? `rating.band.${band}` : null;
}

/** A band's word in the UI language, '' for none. */
export function bandWord(t, band) {
  const k = bandKey(band);
  return k ? t(k) : '';
}

/** The score with one decimal, the way every screen prints it. */
export function scoreFigure(r) {
  const s = Number(typeof r === 'number' ? r : r?.score);
  return Number.isFinite(s) ? s.toFixed(1) : '';
}

/** "measured" for a hand or rubric appeal, "estimated" for the model's guess. */
export function confidenceKind(rating) {
  const c = rating?.confidence;
  if (c === 'curated' || c === 'rubric') return 'measured';
  if (c === 'estimated') return 'estimated';
  return null;
}

/**
 * Everything a screen prints for one rating: { figure, shown, band, word,
 * text, estimated }, or null when there is no score. `text` is
 * "8.9 Exceptional"; `shown` is the figure, "about 8.1" when estimated.
 */
export function ratingWords(rating, t) {
  if (!rating || rating.score == null || !Number.isFinite(Number(rating.score))) return null;
  const figure = scoreFigure(rating);
  const band = bandOf(rating);
  const word = bandWord(t, band);
  const estimated = confidenceKind(rating) === 'estimated';
  // An estimated score reads "about 8.1" (plan, Layer 1 "Estimated scores").
  const shown = estimated ? t('rating.about', { n: figure }) : figure;
  return {
    figure,
    shown,
    band,
    word,
    text: word ? `${shown} ${word}` : shown,
    estimated,
  };
}

// Only the top tenth of a class gets a rank line; below it the line says
// nothing a traveller can use.
const CLASS_RANK_MIN_PCT = 90;

/**
 * "Top 2% of villages in Europe" from rating.class_rank ({ class, pct,
 * scope }), or '' outside the top 10% of the class.
 */
export function classRankLine(rating, t) {
  const cr = rating?.class_rank;
  const pct = Number(cr?.pct);
  if (!cr?.class || !Number.isFinite(pct) || pct < CLASS_RANK_MIN_PCT) return '';
  const top = Math.max(1, Math.round(100 - pct));
  return t('rating.classRank', { pct: top, cls: t(`rating.class.${cr.class}`) });
}

/**
 * A nature row's regional rank in words: "Best walk in the region",
 * "#2 of 41 lakes in the region" (or "in Austria" when the scope is the
 * country). `place` is the country name for a country scope.
 */
export function natureRankLine(v5, t, { place } = {}) {
  const r = v5?.rank;
  if (!r || !(r.rank >= 1) || !(r.of >= 2)) return '';
  const where = r.scope === 'country' && place
    ? t('rating.rankIn', { place })
    : t('rating.rankInRegion');
  const unit = r.unit || 'items';
  if (r.rank === 1) return t(`rating.rankBest.${unit}`, { where });
  return t(`rating.rankOf.${unit}`, { n: r.rank, of: r.of, where });
}

/** The three POI labels, strongest first. */
export const POI_LABELS = Object.freeze(['must_see', 'recommended', 'worth_a_look']);

/**
 * A POI's label. The wire carries `label` since v19; a POI from live city
 * research (no label) falls back to its `rate` (3, 2, 1).
 */
export function poiLabel(item) {
  if (!item) return null;
  if (POI_LABELS.includes(item.label)) return item.label;
  const r = Number(item.rate);
  if (r >= 3) return 'must_see';
  if (r >= 2) return 'recommended';
  return 'worth_a_look';
}

/** A POI label's word in the UI language. */
export function poiLabelWord(t, label) {
  return POI_LABELS.includes(label) ? t(`rating.poi.${label}`) : '';
}

/** True when a band covers the whole scale (so it filters nothing out). */
export function isFullRatingRange(r) {
  return !Array.isArray(r) || r.length !== 2 || (r[0] <= RATING_MIN && r[1] >= RATING_MAX);
}

/** Clamp + order a restored [lo, hi] into the valid 0-10 domain. */
export function clampRatingRange(r) {
  if (!Array.isArray(r) || r.length !== 2) return [...FULL_RATING_RANGE];
  let [lo, hi] = r.map(Number);
  if (!Number.isFinite(lo)) lo = RATING_MIN;
  if (!Number.isFinite(hi)) hi = RATING_MAX;
  lo = Math.max(RATING_MIN, Math.min(RATING_MAX, lo));
  hi = Math.max(RATING_MIN, Math.min(RATING_MAX, hi));
  if (lo > hi) [lo, hi] = [hi, lo];
  return [lo, hi];
}

// The v4 minimum-tier links (mt=1..3) mapped onto v5 bands of the same
// cutoffs: 6.9 is Good, 7.8 sits in Very good, 8.7 in Excellent.
const LEGACY_TIER_BAND = { 1: 'good', 2: 'very_good', 3: 'excellent' };

/**
 * Map a legacy minimum-tier (1-3) onto the equivalent [cutoff, 10] band, so old
 * shared links / saved accounts still narrow sensibly.
 */
export function rangeFromMinTier(minTier) {
  const t = Math.max(0, Math.min(3, Number(minTier) || 0));
  if (!t) return [...FULL_RATING_RANGE];
  return [BAND_CUTOFFS[LEGACY_TIER_BAND[t]], RATING_MAX];
}

/** The lowest band whose cutoff a [lo, 10] range starts at, or null. */
export function bandFromRange(r) {
  if (isFullRatingRange(r)) return null;
  return bandForScore(r[0]);
}

/** The [cutoff, 10] range of "this band and up". */
export function rangeFromBand(band) {
  return BAND_CUTOFFS[band] != null ? [BAND_CUTOFFS[band], RATING_MAX] : [...FULL_RATING_RANGE];
}

// Legacy verdict values (the v4 tiers 1 to 3 in `xv=` links and saved
// filters) read as the v5 band of the same cutoff (the same map as `mt`).
/** The v5 band a legacy tier (1 to 3) stands for, or null. */
export function bandFromLegacyTier(tier) {
  return LEGACY_TIER_BAND[Number(tier)] || null;
}

/** The three "and up" steps the Explore rating filter offers, lowest first. */
export const FILTER_BANDS = Object.freeze(['good', 'very_good', 'excellent']);

/** The filter step a stored value names: a band, or a legacy tier "1" to "3". */
export function filterBand(value) {
  if (value == null || value === '') return null;
  if (BANDS.includes(value)) return value;
  return bandFromLegacyTier(value);
}

/**
 * The ink step (0 to 3) a band draws with where a drawing has only three
 * shades (the map's pin fill, the star colour class `rt-n`): Exceptional and
 * Excellent darkest, Very good next, Good and Pleasant lightest, none 0.
 */
export function inkStep(band) {
  const r = bandRank(band);
  if (r >= 4) return 3;
  if (r === 3) return 2;
  if (r >= 1) return 1;
  return 0;
}

/** The ink step of a band rank (0 to 5, the boot index's `r` column). */
export function inkStepFromRank(rank) {
  return inkStep(BANDS[BANDS.length - Number(rank)] || null);
}

/**
 * A nature row's rating (trail, beach, lake, mountain, cycling route) from
 * its v5 block: { score, band, confidence, rank, facts }, or { unscored: true }
 * when the row has no v5 score (listed without one), so the badge slot shows
 * the NotYet placeholder instead of a number. Null for no row.
 */
export function natureRating(row) {
  if (!row) return null;
  const v5 = row.v5;
  const s = Number(v5?.score);
  if (!v5 || v5.confidence === 'unscored' || v5.score == null || !Number.isFinite(s)) {
    return { score: null, unscored: true, facts: v5?.facts || null };
  }
  return {
    score: s,
    band: bandForScore(s),
    confidence: v5.confidence || null,
    rank: v5.rank || null,
    facts: v5.facts || null,
  };
}

/**
 * The facts row of a nature item, from v5.facts, as [{ key, text }] in the
 * UI language. A null fact is left out; the order is the plan's.
 */
export function natureFacts(facts, t) {
  if (!facts) return [];
  const out = [];
  const push = (key, text) => { if (text) out.push({ key, text }); };
  const word = (k) => { const s = t(k); return s && s !== k ? s : ''; };
  const num = (v) => Number.isFinite(Number(v)) && v !== null && v !== '';
  if (facts.difficulty) push('difficulty', word(`dest.diff.${facts.difficulty}`));
  if (num(facts.km)) push('km', t('rating.fact.km', { n: Math.round(Number(facts.km) * 10) / 10 }));
  if (num(facts.climb_m)) push('climb', t('rating.fact.climb', { n: Math.round(Number(facts.climb_m)) }));
  if (num(facts.hours)) push('hours', t('rating.fact.hours', { n: Math.round(Number(facts.hours) * 10) / 10 }));
  if (facts.loop === true) push('loop', word('rating.fact.loop'));
  else if (facts.loop === false) push('loop', word('rating.fact.oneWay'));
  if (facts.water_class) push('water', t('rating.fact.water', { cls: word(`rating.fact.waterClass.${String(facts.water_class).toLowerCase()}`) || facts.water_class }));
  if (facts.swimming) push('swimming', word(`rating.fact.swimming.${facts.swimming}`));
  if (facts.blue_flag === true) push('blue_flag', word('rating.fact.blueFlag'));
  if (facts.surface) push('surface', word(`rating.fact.surface.${facts.surface}`));
  if (facts.lifeguard === true) push('lifeguard', word('rating.fact.lifeguard'));
  if (facts.shore_access === true) push('shore', word('rating.fact.shoreAccess'));
  if (facts.way_up) push('way_up', word(`rating.fact.wayUp.${facts.way_up}`));
  if (num(facts.paved_share)) push('paved', t('rating.fact.paved', { pct: Math.round(Number(facts.paved_share) * 100) }));
  if (num(facts.traffic_free_share)) push('traffic_free', t('rating.fact.trafficFree', { pct: Math.round(Number(facts.traffic_free_share) * 100) }));
  if (facts.family === true) push('family', word('rating.fact.family'));
  return out;
}

/** The two names each rating part has had: v19 ships highlights and
 *  acclaim, v20 depth and recognition (T763 renames them in sync-data). */
export const PART_ALIASES = Object.freeze({
  appeal: ['appeal'],
  beauty: ['beauty'],
  depth: ['depth', 'highlights'],
  recognition: ['recognition', 'acclaim'],
});

/** One part's value (0 to 1) from rating.components under either name. */
export function ratingPart(rating, part) {
  const c = rating?.components;
  if (!c) return null;
  for (const k of PART_ALIASES[part] || [part]) {
    const v = Number(c[k]);
    if (c[k] != null && Number.isFinite(v)) return v;
  }
  return null;
}

/* ------------------------------------------------------------- gateways */

/**
 * T755: an airport row of a multi-airport city (`gateway_of` names the city
 * row) is never a place of its own: not a card, a pin, an Ask answer or a
 * stay. Flight search keeps reading it.
 */
export function isGateway(d) {
  return !!(d && d.gateway_of);
}

/**
 * The id a link to `id` should open: a gateway's city, followed at most a
 * few hops, else the id itself.
 */
export function gatewayCity(id, destinations) {
  let cur = id;
  for (let i = 0; i < 4; i += 1) {
    const d = destinations?.[cur];
    if (!d?.gateway_of || d.gateway_of === cur) return cur;
    cur = d.gateway_of;
  }
  return cur;
}

/* ------------------------------------------------------------- reasons */

// The reason sentence (rating.why) is English on the record; the other
// languages ship as one lazy file each, public/app_data/why_i18n/<lang>.json
// ({ id: reason }, written by sync-data, T762), fetched the first time a
// screen asks for that language. Served from the app host with the boot
// index (app_data is not a data-host path).
const whyFiles = new Map();
export function loadRatingWhy(lang) {
  if (!lang || typeof fetch !== 'function') return Promise.resolve({});
  if (!whyFiles.has(lang)) {
    whyFiles.set(lang, fetch(`/app_data/why_i18n/${encodeURIComponent(lang)}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => { whyFiles.delete(lang); return {}; }));
  }
  return whyFiles.get(lang);
}

/** The reason for place `id` in `lang`, English when the file lacks it.
 *  T789: English is a lazy file too; `rating.why` is read where a wire
 *  still carries it. */
export async function ratingWhy(id, rating, lang) {
  if (!id) return rating?.why || '';
  const en = rating?.why || (await loadRatingWhy('en'))?.[id] || '';
  if (!lang || lang === 'en') return en;
  const m = await loadRatingWhy(lang);
  return m?.[id] || en;
}
