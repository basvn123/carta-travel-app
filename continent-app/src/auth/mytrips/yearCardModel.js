/**
 * The year card's content (G12 Phase F): what the studio shows and the
 * canvas draws, from lib/atlasFacts' yearCard() and the studio's choices.
 * Pure, so the preview and the PNG can never disagree.
 */
import { extremes } from '../../lib/atlasFacts.js';

/** Width over height per format; the PNG is always 1080 wide. */
export const FORMATS = { story: 9 / 16, post: 4 / 5, square: 1 };
export const PNG_W = 1080;
export const pngSize = (fmt) => ({ w: PNG_W, h: Math.round(PNG_W / (FORMATS[fmt] || FORMATS.post)) });

/**
 * The four styles, as token names (01-tokens.css): ground, ink, land, been,
 * the month bars and the empty months. No black on any of them.
 */
export const THEMES = {
  umber: { bg: '--umber-700', fg: '--neutral-0', land: '--umber-600', been: '--umber-100', mo: '--umber-100', off: '--umber-600' },
  zand: { bg: '--umber-100', fg: '--umber-800', land: '--umber-200', been: '--umber-600', mo: '--umber-600', off: '--umber-200' },
  steen: { bg: '--neutral-50', fg: '--umber-800', land: '--neutral-200', been: '--umber-600', mo: '--umber-600', off: '--neutral-200' },
  zon: { bg: '--sun-100', fg: '--umber-800', land: '--umber-100', been: '--umber-500', mo: '--sun-400', off: '--umber-100' },
};

export const ITEMS = ['map', 'countries', 'nights', 'trips', 'months', 'extremes', 'grade', 'money'];
export const DEFAULT_ITEMS = ['map', 'countries', 'nights', 'trips', 'months'];
export const TITLE_MAX = 26;

/** The studio's starting choices. */
export const defaultStudio = () => ({ title: null, fmt: 'story', theme: 'umber', photo: '', items: DEFAULT_ITEMS, year: null });

/** A day as the traveller logged it this year: the mean of spend per person per night. */
export function dayOf(trips = []) {
  const days = trips.filter((x) => Number.isFinite(x.spendPP) && x.spendPP > 0 && x.nights > 0).map((x) => x.spendPP / x.nights);
  return days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
}

/**
 * The card as words and figures.
 *   card   yearCard() output
 *   cfg    the studio's choices
 *   fmt    { t, nf(n, digits), money(n), month(index0) }
 * Returns { title, insight, nums: [[value, label]], months, map, photo, theme, fmt }.
 */
export function yearCardModel(card, cfg, { t, nf = String, money = String, month = String }) {
  const on = new Set(cfg.items || DEFAULT_ITEMS);
  const tv = card.trips || [];
  const title = (cfg.title || '').trim() || t('mt.ycIn', { year: card.year });
  let insight = '';
  const ex = on.has('extremes') && tv.length > 1 ? extremes(tv) : null;
  const top = card.months.indexOf(Math.max(...card.months));
  if (ex && ex.n && ex.s) insight = ex.n.city === ex.s.city ? ex.n.city : t('mt.ycFromTo', { a: ex.n.city, b: ex.s.city });
  else if (card.months.some((v) => v > 0)) insight = t('mt.ycMostIn', { month: month(top) });
  const n = card.countries.length;
  const nums = [];
  if (on.has('countries')) nums.push([String(n), t(n === 1 ? 'mt.ycLand1' : 'mt.ycLandN')]);
  if (on.has('nights')) nums.push([String(card.nights), t('mt.ycNights')]);
  if (on.has('trips')) nums.push([String(tv.length), t(tv.length === 1 ? 'mt.ycTrip1' : 'mt.ycTripN')]);
  if (on.has('grade') && card.avgGrade != null) nums.push([nf(card.avgGrade, 1), t('mt.ycGrade')]);
  const day = card.hasMoney ? dayOf(tv) : null;
  if (on.has('money') && day != null) nums.push([money(day), t('mt.ycDay')]);
  return {
    title,
    insight,
    nums,
    months: on.has('months') ? card.months : null,
    map: on.has('map'),
    been: card.countries,
    photo: cfg.photo || '',
    theme: THEMES[cfg.theme] ? cfg.theme : 'umber',
    fmt: FORMATS[cfg.fmt] ? cfg.fmt : 'story',
  };
}
