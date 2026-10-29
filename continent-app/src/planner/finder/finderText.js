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
import { slotTotals } from '../../lib/recommend/slots.js';
import { keepHidden, repriceTrip } from '../../lib/recommend/trips.js';

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

/**
 * The trip's photos (T810): each place's own photo in trip order, then,
 * when no place has one, the best known place of the same country that
 * does, so a card never stands without a picture. Each is { url, city,
 * iso2, credit, id }; [] only when the country has no photo at all.
 */
const COUNTRY_PHOTO = new WeakMap();
function countryPhoto(destinations, iso2) {
  if (!destinations || !iso2) return null;
  let byCountry = COUNTRY_PHOTO.get(destinations);
  if (!byCountry) {
    byCountry = new Map();
    for (const d of Object.values(destinations)) {
      if (!d?.image?.url || !d.iso2) continue;
      const was = byCountry.get(d.iso2);
      if (!was || (d.rating?.fame || 0) > (was.rating?.fame || 0)) byCountry.set(d.iso2, d);
    }
    COUNTRY_PHOTO.set(destinations, byCountry);
  }
  return byCountry.get(iso2) || null;
}
const photoOf = (d, id) => ({ url: d.image.url, city: d.city || '', iso2: d.iso2 || null, credit: d.image.credit || null, id });

export function tripPhotos(trip, destinations) {
  const out = [];
  const seen = new Set();
  for (const p of trip.places) {
    const d = destinations?.[p.id];
    if (!d?.image?.url || seen.has(d.image.url)) continue;
    seen.add(d.image.url);
    out.push(photoOf(d, p.id));
  }
  if (!out.length) {
    const d = countryPhoto(destinations, trip.iso2 || firstPlace(trip, destinations)?.iso2);
    if (d) out.push(photoOf(d, d.id || null));
  }
  return out;
}

// A POI's weight: must-see, then recommended, then the rest (appData's rate).
const RATE = { must_see: 3, recommended: 2, worth_a_look: 1 };

/**
 * What to see and do at one place (T811): the place's POIs (public/poi
 * shards) that have a photo, the best first (its label, then its
 * significance), one per name, at most `n`. Each is { name, kind, img,
 * desc, category }.
 */
export function topSights(pois, n = 4) {
  const seen = new Set();
  return (pois || [])
    .filter((x) => x?.img && x.name)
    .map((x, i) => ({ x, i, rate: x.rate ?? RATE[x.label] ?? 1, sig: Number.isFinite(x.sig) ? x.sig : 0 }))
    .sort((a, b) => b.rate - a.rate || b.sig - a.sig || a.i - b.i)
    .filter(({ x }) => (seen.has(x.name) ? false : (seen.add(x.name), true)))
    .slice(0, n)
    .map(({ x }) => ({ name: x.name, kind: x.kind || '', img: x.img, desc: x.desc || '', category: x.category || '' }));
}

/** The budget as a badge on the card (T810): "231 under budget" with the money formatter's symbol, or over in the warning tone; null without a budget. */
export function budgetBadge(trip, { locale } = {}) {
  const b = trip.budget;
  if (!b?.eur || !Number.isFinite(b.delta)) return null;
  // Totals carry cents (T818): within half a euro is on budget, never "0 under".
  if (Math.round(b.delta) === 0) return { key: 'tf.budget.on', vars: { eur: formatMoney(b.eur, { locale }) }, over: false };
  return { key: b.delta < 0 ? 'tf.card.under' : 'tf.card.over', vars: { eur: formatMoney(Math.abs(b.delta), { locale }) }, over: b.delta > 0 };
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

/**
 * The trip with one slot replaced (a swap in the preview or a picker), then
 * priced again as a whole (T819, trips.js repriceTrip): one quote of the
 * trip with every swap in it, so its lines and total are the planner's to
 * the cent and the budget badge moves with them. `sumSlots` is what a trip
 * without its pricing context falls back to.
 */
export function withSlot(trip, next, sumSlots = slotTotals) {
  const slots = trip.slots.map((s) => (s.id === next.id ? next : s));
  const swapped = keepHidden(trip, { ...trip, slots });
  if (trip.ctx || trip.base?.ctx) return repriceTrip(swapped);
  const total = sumSlots(slots);
  return keepHidden(trip, {
    ...swapped,
    total,
    budget: trip.budget ? { eur: trip.budget.eur, delta: total.perPerson - trip.budget.eur } : null,
  });
}

/** "Google Flights, checked 14:05" or "... checked 26 Oct": the flight row's own words. */
export function checkedText(t, checked, lang = 'en', now = Date.now()) {
  if (!Number.isFinite(checked)) return '';
  const at = new Date(checked);
  const today = new Date(now).toDateString() === at.toDateString();
  return today
    ? t('flight.checked', { time: at.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })
    : t('flight.checkedDay', { date: at.toLocaleDateString(lang, { day: 'numeric', month: 'short' }) });
}

/** A flight's stops in words: "Direct", "1 stop", "2 stops". */
export const stopsText = (t, n) => (n == null ? '' : n === 0 ? t('flight.direct') : n === 1 ? t('flight.stop1') : t('flight.stops', { n }));

/** Carta's pick on a receipt row, in a few words. */
export function pickLine(slot, { t, airline = (c) => c }) {
  if (slot.owner === 'you') return t('tf.rc.yours');
  const p = slot.pick;
  if (!p) return '';
  if (slot.id === 'flight' && p.facts?.out && p.id !== 'yours') {
    const o = p.facts.out;
    const name = airline(o.airline);
    return o.dep && o.arr ? t('tf.rc.flightPick', { airline: name, dep: o.dep, arr: o.arr }) : name || t(p.labelKey);
  }
  return t(p.labelKey);
}

/** "Why this price": one plain line per slot on where its figure comes from. */
export function whyLine(slot, trip, { t, lang = 'en', destinations = {} }) {
  if (slot.eur == null) return t(slot.id === 'activities' ? 'tf.why.activities' : 'tf.why.missing');
  if (slot.owner === 'you') return t('tf.why.typical');
  const p = slot.pick || {};
  switch (slot.id) {
    case 'flight':
      if (p.id === 'yours') return t('tf.why.flightYours');
      if (p.id === 'drive') return t('tf.why.drive');
      return checkedText(t, p.facts?.checked, lang) || t('tf.why.flightSwept');
    case 'stay':
      return t('tf.why.stay', { tier: t(p.labelKey), n: trip.nights, places: tripName(trip, destinations, lang) });
    case 'food':
      return t(`tf.why.food.${['cook', 'mix', 'out'].includes(p.id) ? p.id : 'custom'}`);
    case 'local':
      return t(`tf.why.local.${['public', 'car', 'owncar'].includes(p.id) ? p.id : 'public'}`);
    default:
      return '';
  }
}
