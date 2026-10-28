/**
 * The words and figures the trip finder's screens draw (TF2, T797 to T800),
 * as pure functions of a priced trip (lib/recommend) and the answers, so a
 * node test holds them and no component computes a price.
 *
 * Every figure here is read from the trip's own slots: the card, the
 * receipt and the picker cannot disagree, because none of them adds
 * anything up beyond what slots.js already did.
 */
import { formatMoney } from '../../lib/money.js';
import { monthName } from '../../lib/dates.js';
import { cityLabel } from '../../lib/placeName.js';
import { QUESTIONS } from '../flow/questions.js';

/** How many trips before "Show more trips" (the CountryMatchCards page). */
export const PAGE = 6;

/** A list in the reader's language: "Bled and Ljubljana". */
export function joinList(items, lang = 'en') {
  const xs = items.filter(Boolean);
  try {
    return new Intl.ListFormat(lang === 'en' ? 'en-GB' : lang, { style: 'long', type: 'conjunction' }).format(xs);
  } catch {
    return xs.join(', ');
  }
}

/** The trip's name: its places, joined the way the app joins place names. */
export function tripName(trip, destinations, lang = 'en') {
  return joinList(trip.places.map((p) => cityLabel(destinations?.[p.id]?.city || '')), lang);
}

/** The first place's catalogue record, for the card's photo. */
export function firstPlace(trip, destinations) {
  return destinations?.[trip.places[0]?.id] || null;
}

const slotOf = (trip, id) => trip.slots.find((s) => s.id === id) || null;

/**
 * The three figures under the total, a person, whole euros: the flight, the
 * stay and the days (food plus getting around). A figure the data does not
 * have is null (drawn as NotYet), never 0.
 */
export function threeFigures(trip) {
  const eur = (id) => slotOf(trip, id)?.eur ?? null;
  const food = eur('food');
  const local = eur('local');
  return {
    flight: eur('flight'),
    stay: eur('stay'),
    days: food == null && local == null ? null : (food || 0) + (local || 0),
  };
}

/** The cost bar's segments: every slot with a figure, in slot order. */
export function barSegments(trip) {
  return trip.slots.filter((s) => s.eur != null && s.eur > 0).map((s) => ({ id: s.id, labelKey: s.labelKey, eur: s.eur }));
}

/**
 * The inclusions line, from the slots: each slot is in (Carta's pick with a
 * figure), yours (the traveller chooses it; its typical price is in the
 * total) or notYet (no figure: out of the sum).
 */
export function inclusions(trip) {
  return trip.slots.map((s) => ({
    id: s.id,
    labelKey: s.labelKey,
    state: s.eur == null ? 'notYet' : s.owner === 'you' ? 'yours' : 'in',
  }));
}

/** Does the trip's total leave a line out (a slot with no figure, things to do aside)? */
export function totalLeavesOut(trip) {
  return trip.slots.some((s) => s.eur == null && s.id !== 'activities');
}

/** A signed whole-euro difference, the way the plan total writes one: "+€24", "-€24". */
export function signedMoney(delta, { precision = 'whole', locale } = {}) {
  if (!Number.isFinite(delta)) return '';
  const abs = formatMoney(Math.abs(delta), { precision, locale });
  return `${delta < 0 ? '-' : '+'}${abs}`;
}

/** The budget ruler as one sentence's key and figures, or null with no budget. */
export function budgetLine(trip, { locale } = {}) {
  const b = trip.budget;
  if (!b?.eur) return null;
  const eur = formatMoney(b.eur, { locale });
  if (b.delta === 0) return { key: 'tf.budget.on', vars: { eur } };
  return {
    key: b.delta < 0 ? 'tf.budget.under' : 'tf.budget.over',
    vars: { delta: formatMoney(Math.abs(b.delta), { locale }), eur },
    over: b.delta > 0,
    // Where the trip's total sits on the ruler, 0 to 1, the budget at 1 when under.
    fill: Math.max(0, Math.min(1, trip.total.perPerson / Math.max(b.eur, trip.total.perPerson))),
  };
}

/** A like's own label, the one question 2 shows. */
export const likeLabel = (t, key) => t(`pf.like.${key}`);

/**
 * A reason or the catch (reasons.js { key, facts }) as its sentence: each
 * fact in the traveller's words (the like's label, the month's name, the
 * place's name, money through formatMoney).
 */
export function factText(item, { t, lang = 'en' }) {
  if (!item?.key) return '';
  const f = item.facts || {};
  const vars = { ...f };
  if (f.like) vars.like = likeLabel(t, f.like);
  if (f.month) vars.month = monthName(f.month, lang);
  if (f.place) vars.place = cityLabel(f.place);
  if (f.best) vars.best = cityLabel(f.best);
  if (Number.isFinite(f.over)) vars.over = formatMoney(f.over, { locale: lang });
  if (Number.isFinite(f.eur)) vars.eur = formatMoney(f.eur, { locale: lang });
  return t(item.key, vars);
}

/** The match bars per like, strongest first, as whole percentages. */
export function matchBars(trip) {
  const m = trip.match;
  if (!m) return [];
  return (m.bars || [])
    .filter((b) => b.kind === 'like')
    .map((b) => ({ key: b.key, pct: Math.round(Math.max(0, Math.min(1, b.p)) * 100), place: b.place || null }))
    .sort((a, b) => b.pct - a.pct);
}

/** The question that most likely widens an empty result: budget, then reach. */
export function widenQuestion(settings, guide) {
  if (settings.guide.budget?.eur > 0 && guide.includes('g:budget')) return 'g:budget';
  if (settings.guide.reach && settings.guide.reach !== 'any' && guide.includes('g:reach')) return 'g:reach';
  return guide[0];
}

/** An option's label from its question, by value. */
function optionLabel(t, id, value) {
  const o = QUESTIONS[id]?.options?.find((x) => x.value === value);
  return o?.labelKey ? t(o.labelKey) : '';
}

/**
 * The answers as chips, in the traveller's words, each naming the question
 * it reopens: from, when (or the trip's own length and month when the setup
 * has no dates), shape, likes, weather, reach, avoid, budget.
 *
 * ctx: { t, lang, originName, when (whenText), trip (the first trip, for
 *        the length chip), locale }
 */
export function answerChips(settings, { t, lang = 'en', originName = '', when = null, trip = null, locale } = {}) {
  const g = settings.guide;
  const out = [];
  if (originName) out.push({ id: 'from', q: 'from', label: t('tf.chip.from', { city: originName }) });
  if (settings.when.mode === 'exact' && settings.when.start && when?.start) {
    out.push({ id: 'when', q: 'when', label: when.end ? t('tf.chip.dates', { start: when.start, end: when.end }) : when.start });
  } else if (trip?.nights && trip?.month) {
    out.push({ id: 'when', q: 'when', label: t('tf.chip.nightsIn', { n: trip.nights, month: monthName(trip.month, lang) }) });
  }
  for (const v of g.shapes || []) out.push({ id: `shape:${v}`, q: 'g:shape', label: optionLabel(t, 'g:shape', v) });
  for (const v of g.likes || []) out.push({ id: `like:${v}`, q: 'g:likes', label: likeLabel(t, v) });
  if (g.weather && g.weather !== 'any') out.push({ id: 'weather', q: 'g:weather', label: optionLabel(t, 'g:weather', g.weather) });
  if (g.reach && g.reach !== 'any' && !settings.booked.flights) out.push({ id: 'reach', q: 'g:reach', label: optionLabel(t, 'g:reach', g.reach) });
  for (const v of g.avoid || []) out.push({ id: `avoid:${v}`, q: 'g:avoid', label: optionLabel(t, 'g:avoid', v) });
  if (g.budget?.eur > 0) {
    const eur = formatMoney(g.budget.eur, { locale });
    out.push({ id: 'budget', q: 'g:budget', label: t(g.budget.kind === 'day' ? 'tf.chip.budgetDay' : 'tf.chip.budget', { eur }) });
  }
  return out.filter((c) => c.label);
}
