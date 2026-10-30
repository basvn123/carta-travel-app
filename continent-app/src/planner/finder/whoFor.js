/**
 * "Who this trip is for" (T871, owner 2026-10-29: Go "for now"): one short
 * paragraph on the trip page, built from a template over the trip's own
 * facts, so every claim in it is true. No AI writes it.
 *
 * Up to four sentences, each from one fact, each in its own shape so the
 * paragraph never reads as a loop:
 *
 *   who and what   the party (solo, a couple, friends, a family, a group) and
 *                  the likes the trip matches best (match bars of 50 per cent
 *                  and up, the strongest two), else the nights
 *   the route      one base ("you unpack once"), two (the nights in each and
 *                  how you move between them), or more (first, middle, last)
 *   the month      the day highs that month (taste.tmax_by_month) as a word
 *                  and a figure, then the crowds (taste.crowd_by_month)
 *   a car          only when a place on the route is hard to see without one
 *                  and the trip does not drive already
 *
 * A fact the data does not hold drops its sentence; nothing is guessed. The
 * words come from tf.who.* keys in six languages, and the result goes
 * through stripDashes. Pure: no React, no fetch.
 */
import { stripDashes } from '../../lib/format.js';
import { monthName } from '../../lib/dates.js';
import { cityLabel } from '../../lib/placeName.js';
import { crowdTier, dayHighs } from '../../lib/recommend/compare.js';
import { joinList, matchBars } from './finderText.js';

/** The party kinds the template has a sentence for. */
export const WHO_KINDS = Object.freeze(['solo', 'couple', 'friends', 'family', 'group']);

/** The likes the template can name (question 2's answers). */
export const WHO_LIKES = Object.freeze([
  'beach', 'hiking', 'lakes', 'culture', 'city', 'food', 'nightlife', 'hidden', 'cycling', 'ski', 'wellness', 'islands',
]);

/** The ways between two stops the template can name. */
export const WHO_WAYS = Object.freeze(['train', 'bus', 'car', 'fly', 'ferry']);

/** A like counts as matched from this share of the trip's match bar. */
export const LIKE_MIN = 50;

/** The day high (whole degrees) each word starts at. */
const BANDS = [[29, 'hot'], [23, 'warm'], [17, 'mild'], [10, 'cool'], [-99, 'cold']];
export const bandOf = (hi) => (Number.isFinite(hi) ? BANDS.find(([min]) => hi >= min)[1] : null);

/** Which party sentence: the answer's own kind, else read from the head count. */
export function whoKind(trip, settings = null) {
  const k = settings?.party?.kind;
  if (WHO_KINDS.includes(k)) return k;
  const p = trip.party || {};
  if ((p.children || 0) + (p.babies || 0) > 0) return 'family';
  const adults = p.adults || 1;
  return adults === 1 ? 'solo' : adults === 2 ? 'couple' : 'friends';
}

/** The strongest matched likes, at most two. */
export function whoLikes(trip) {
  return matchBars(trip).filter((b) => b.pct >= LIKE_MIN && WHO_LIKES.includes(b.key)).map((b) => b.key)
    .filter((k, i, a) => a.indexOf(k) === i)
    .slice(0, 2);
}

const nightsText = (t, n) => t(n === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n });

/** The way between the first two stops, from the trip's own quote; null when it is not one the template names. */
function wayOf(trip) {
  const mode = trip.quote?.legs?.[0]?.mode || null;
  if (mode === 'drive' || mode === 'owncar') return 'car';
  return WHO_WAYS.includes(mode) ? mode : null;
}

/** Does a place on the route need a car the trip does not already have? */
function needsCar(trip, destinations) {
  if (trip.transport === 'owncar' || trip.transport === 'car') return false;
  const local = trip.slots?.find((s) => s.id === 'local')?.pick?.id;
  if (local === 'car') return false;
  return trip.places.some((p) => {
    const d = destinations?.[p.id];
    return Boolean(d?.local_transport?.car_needed || d?.taste?.car_need);
  });
}

/**
 * The paragraph's sentences, each { key, text }, in order. `t` is the i18n
 * function; `settings` the trip's answers (for the party's kind).
 */
export function whoForSentences(trip, { settings = null, destinations = {}, t, lang = 'en' }) {
  const out = [];
  const kind = whoKind(trip, settings);
  const likes = whoLikes(trip);
  if (likes.length) {
    out.push({ key: 'open', text: t(`tf.who.open.${kind}`, { likes: joinList(likes.map((k) => t(`tf.who.like.${k}`)), lang) }) });
  } else if (trip.nights > 0) {
    out.push({ key: 'open', text: t(`tf.who.plain.${kind}`, { nights: nightsText(t, trip.nights) }) });
  }

  const names = trip.places.map((p) => cityLabel(destinations?.[p.id]?.city || '')).filter(Boolean);
  if (names.length === trip.places.length && names.length) {
    if (names.length === 1) {
      out.push({ key: 'route', text: t('tf.who.one', { place: names[0] }) });
    } else if (names.length === 2) {
      const way = wayOf(trip);
      const vars = {
        first: names[0], second: names[1],
        firstNights: nightsText(t, trip.places[0].nights), secondNights: nightsText(t, trip.places[1].nights),
      };
      out.push({ key: 'route', text: way ? t('tf.who.two', { ...vars, by: t(`tf.who.by.${way}`) }) : t('tf.who.twoPlain', vars) });
    } else {
      out.push({ key: 'route', text: t('tf.who.many', { first: names[0], middle: joinList(names.slice(1, -1), lang), last: names[names.length - 1] }) });
    }
  }

  const highs = dayHighs(trip, destinations);
  const band = highs ? bandOf(highs.hi) : null;
  if (band && trip.month) {
    const range = highs.lo === highs.hi ? t('tf.cmp.high', { lo: highs.hi }) : t('tf.cmp.highs', { lo: highs.lo, hi: highs.hi });
    out.push({ key: 'month', text: t(`tf.who.month.${band}`, { month: monthName(trip.month, lang), highs: range }) });
  }
  const crowd = crowdTier(trip, destinations);
  if (crowd != null && crowd >= 0 && crowd <= 3) out.push({ key: 'crowd', text: t(`tf.who.crowd.${Math.round(crowd)}`) });

  if (needsCar(trip, destinations)) out.push({ key: 'car', text: t('tf.who.car') });
  return out.map((s) => ({ ...s, text: stripDashes(s.text) }));
}

/** The paragraph as one string ('' when no fact gives a sentence). */
export function whoFor(trip, ctx) {
  return whoForSentences(trip, ctx).map((s) => s.text).join(' ');
}
