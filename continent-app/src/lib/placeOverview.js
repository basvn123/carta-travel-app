/**
 * The one overview of a place (T504, roadmap 1.5): what a place says in
 * Explore's list, on the map's selected-place card and in the phone's map
 * drawer. Pure, so the three can never disagree and node tests it
 * (tests/placeOverview.test.mjs). The drawing is browse/PlaceOverview.jsx.
 *
 * Five things, always in this order: the name, the region (with the
 * country), the month's score and its one reason, the price a person a day
 * in whole euros, the save control.
 */
import { countryName } from './countryName.js';

// Which kind of named area reads best as "the region" of a place: a region
// (Tuscany) before a coast (Amalfi Coast) before a range (Alps).
const AREA_RANK = { region: 0, coast: 1, mountains: 2 };

/**
 * The named area a place sits in, from the guided search data
 * (public/search/guided.json: `areas` and `d[id].a`), in the reader's
 * language, or null. About a third of the catalogue sits in one of the
 * forty areas; the rest shows the country alone.
 */
export function overviewRegion(guided, id, lang = 'en') {
  const ids = guided?.d?.[id]?.a;
  if (!ids || !ids.length || !Array.isArray(guided.areas)) return null;
  let best = null;
  for (const a of guided.areas) {
    if (!ids.includes(a.id)) continue;
    const rank = AREA_RANK[a.kind] ?? 3;
    if (!best || rank < best.rank) best = { rank, a };
  }
  if (!best) return null;
  const label = best.a.label || {};
  return label[lang] || label.en || null;
}

/**
 * The score the overview shows: with a month, the month's score once the
 * wire carries one (roadmap 2.13: `rating.month_scores[m]`), else the base
 * Score; without a month, the base Score (owner decision T469-c).
 */
export function overviewScore(p, month = null) {
  const r = p?.rating || null;
  const m = Number(month);
  const ms = r?.month_scores?.[m];
  if (!r || !m || ms == null || !Number.isFinite(Number(ms))) return r;
  return { ...r, score: Number(ms), month: m };
}

/**
 * The one reason, as a descriptor the component words through i18n. The
 * first that exists wins:
 *   { kind: 'why', text }       the guided question's answer ("Beach 3 km away")
 *   { kind: 'monthWhy', text }  the month score's own sentence (2.13)
 *   { kind: 'goodIn', month }   the month is one of the place's best months
 *   { kind: 'bestIn', months }  the best months, when the month is not one
 * or null when there is nothing measured to say. Never two reasons.
 */
export function overviewReason(p, { month = null, why = null } = {}) {
  if (why) return { kind: 'why', text: String(why) };
  const best = Array.isArray(p?.climate?.best) ? p.climate.best : [];
  const m = Number(month) || null;
  if (m) {
    const own = p?.rating?.month_why?.[m];
    if (own) return { kind: 'monthWhy', text: String(own) };
    if (best.includes(m)) return { kind: 'goodIn', month: m };
  }
  if (best.length) return { kind: 'bestIn', months: best };
  return null;
}

/**
 * The reason descriptor as one line in the reader's language. `monthName`
 * names one month inline ("October"), `monthRanges` words a set of months
 * ("May to Sep"); both come from the caller so this file stays pure.
 */
export function reasonText(reason, t, { monthName, monthRanges } = {}) {
  if (!reason) return null;
  if (reason.kind === 'why' || reason.kind === 'monthWhy') return reason.text;
  if (reason.kind === 'goodIn' && monthName) return t('gs.whyMonth', { month: monthName(reason.month) });
  if (reason.kind === 'bestIn' && monthRanges) return t('explore.bestMonths', { months: monthRanges(reason.months) });
  return null;
}

/** The region line: "Tuscany, Italy", or the country alone. */
export function regionLine(p, region, t) {
  const country = countryName(p?.iso2, p?.country);
  return region ? t('overview.regionCountry', { region, country }) : country;
}

/**
 * The dates line on a place card (T590, owner decision 5): the traveller's
 * own dates ("21 to 28 Nov"), the month they picked ("November"), or null
 * while the dates are Carta's or any time (a card never shows dates the
 * traveller did not set). `s` is the settings context (useSettings), `bcp47`
 * the reader's locale.
 */
export function tripDates(s, t, bcp47 = 'en-GB') {
  if (!s || s.dateFlex === 'any' || !s.departDate) return null;
  const parse = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    return y && m ? new Date(Date.UTC(y, m - 1, d || 1)) : null;
  };
  const fmt = (date, opts) => {
    try {
      return new Intl.DateTimeFormat(bcp47, { ...opts, timeZone: 'UTC' }).format(date);
    } catch {
      return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(date);
    }
  };
  const a = parse(s.departDate);
  if (!a) return null;
  if (s.dateFlex === 'month') return fmt(a, { month: 'long' });
  if (!s.ownDates || !s.returnDate) return null;
  const b = parse(s.returnDate);
  if (!b) return null;
  const sameMonth = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
  const start = sameMonth ? fmt(a, { day: 'numeric' }) : fmt(a, { day: 'numeric', month: 'short' });
  return t('settings.datesRange', { start, end: fmt(b, { day: 'numeric', month: 'short' }) });
}
