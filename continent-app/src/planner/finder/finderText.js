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
import { SLOT_ROWS, slotTotals } from '../../lib/recommend/slots.js';
import { stayTierFor } from '../../lib/recommend/adapters/stay.js';
import { keepHidden, repriceTrip } from '../../lib/recommend/trips.js';
import { doorMinutes } from '../../lib/recommend/compare.js';
import { partyText } from '../../lib/party.js';

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
  if (f.hub) vars.hub = cityLabel(f.hub);
  // A persona reason names the trip's places as one list (persona.js).
  if (Array.isArray(f.places)) vars.places = joinList(f.places.map(cityLabel), lang);
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
  if (g.persona && g.persona !== 'mix') out.push({ id: 'persona', q: 'g:persona', label: optionLabel(t, 'g:persona', g.persona) });
  for (const v of g.shapes || []) out.push({ id: `shape:${v}`, q: 'g:shape', label: optionLabel(t, 'g:shape', v) });
  for (const v of g.likes || []) out.push({ id: `like:${v}`, q: 'g:likes', label: likeLabel(t, v) });
  if (g.weather && g.weather !== 'any') out.push({ id: 'weather', q: 'g:weather', label: optionLabel(t, 'g:weather', g.weather) });
  if (g.reach && g.reach !== 'any' && !settings.booked.flights) out.push({ id: 'reach', q: 'g:reach', label: optionLabel(t, 'g:reach', g.reach) });
  if (g.around && g.around !== 'mix' && settings.way !== 'car' && !settings.booked.car) out.push({ id: 'around', q: 'g:around', label: optionLabel(t, 'g:around', g.around) });
  for (const v of g.avoid || []) out.push({ id: `avoid:${v}`, q: 'g:avoid', label: optionLabel(t, 'g:avoid', v) });
  if (g.budget?.eur > 0) {
    const people = settings.party.adults + settings.party.kids;
    // A group budget reads back as the group's own total (plan flow walk).
    const label = g.budget.per === 'group' && g.budget.groupEur > 0 && people > 1
      ? t('pf.chip.budgetGroup', { eur: formatMoney(g.budget.groupEur, { locale }), n: people })
      : t(g.budget.kind === 'day' ? 'tf.chip.budgetDay' : 'tf.chip.budget', { eur: formatMoney(g.budget.eur, { locale }) });
    out.push({ id: 'budget', q: 'g:budget', label });
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

/**
 * The towns of the home airports a search flies from (T867): every ticked
 * airport in reach (data.meta.home_airports, nearest first), else the one
 * origin, each town once ("Brussels, Charleroi and Lille" with joinList).
 */
export function airportTowns(data, origin = null) {
  const rows = Array.isArray(data?.meta?.home_airports) ? data.meta.home_airports : [];
  const towns = (rows.length ? rows.map((a) => a.city || a.iata) : [origin?.name || origin?.iata]).filter(Boolean);
  return [...new Set(towns)];
}

/** The places the traveller named (T859), as chips that reopen Tell Carta. */
export function placeChips(settings) {
  return (settings.places || [])
    .map((p) => ({ id: `place:${p.kind}:${p.id}`, q: 'tell', label: p.kind === 'place' ? cityLabel(p.name) : p.name }))
    .filter((c) => c.label);
}

/** Who goes ("2 adults, 1 child") as a chip that reopens Who is going. */
export function partyChip(settings, t) {
  const p = settings.party || {};
  return { id: 'who', q: 'who', label: partyText(t, { adults: p.adults || 1, children: p.kids || 0, babies: p.babies || 0 }) };
}

/**
 * The answers in one line on Trips for you (T868, rows T859-b): the named
 * places first, then from, when, who and the likes; the other answers are
 * counted ("+3 more") and listed under Edit answers.
 *   -> { line: string, rest: number, chips: every chip, in the line's order first }
 */
export function answersLine(settings, { t, lang = 'en', originName = '', when = null, trip = null, locale } = {}) {
  const places = placeChips(settings);
  const base = answerChips(settings, { t, lang, originName, when, trip, locale });
  const pick = (id) => base.find((c) => c.id === id);
  const likes = base.filter((c) => c.id.startsWith('like:'));
  const lead = [pick('from'), pick('when'), partyChip(settings, t)].filter(Boolean);
  const parts = [
    places.length ? joinList(places.map((c) => c.label), lang) : '',
    ...lead.map((c) => c.label),
    // Each like its own part: a like's label may hold an "and" itself
    // ("Food and wine"), so joining them as a list read "hiking and food and wine".
    ...likes.map((c) => (lang === 'de' ? c.label : c.label.toLocaleLowerCase(lang))),
  ].filter(Boolean);
  const shown = new Set([...lead, ...likes].map((c) => c.id));
  const others = base.filter((c) => !shown.has(c.id));
  return { line: parts.join(', '), rest: others.length, chips: [...places, ...lead, ...likes, ...others] };
}

/** A clock time "06:15" in minutes after midnight, or null. */
const clock = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * How long the way there takes, in minutes, for "Shortest trip there"
 * (T868): door to door where the flight carries its minutes
 * (compare.js doorMinutes), else the flight's clock times plus the
 * gateway transfer (local times, so a time zone crossed reads an hour
 * off), else the transfer alone for a trip with no flight (by train or
 * car); null when nothing is known.
 */
export function thereMinutes(trip) {
  const door = doorMinutes(trip);
  if (door != null) return door;
  const flight = trip.slots?.find((s) => s.id === 'flight');
  const out = flight?.pick?.facts?.out;
  const transfer = Number.isFinite(trip.gateway?.minutes) ? trip.gateway.minutes : null;
  const dep = clock(out?.dep);
  const arr = clock(out?.arr);
  if (dep != null && arr != null) return ((arr - dep + 1440) % 1440) + (transfer || 0);
  if (!out && flight?.pick?.id === 'drive' && transfer != null) return transfer;
  return null;
}

/** The sorts on Trips for you (T868): the engine's own order first. */
export const SORTS = Object.freeze(['match', 'cheapest', 'shortest']);

/**
 * The trips in one sort, a new array: 'match' keeps the ranked order;
 * 'cheapest' by the group's total (a trip whose total leaves a line out
 * after the ones that do not); 'shortest' by thereMinutes, the unknown
 * last. Ties keep the ranked order.
 */
export function sortTrips(trips, sort = 'match') {
  if (sort !== 'cheapest' && sort !== 'shortest') return trips.slice();
  const at = new Map(trips.map((x, i) => [x.id, i]));
  const keyOf = sort === 'cheapest'
    ? (x) => [totalLeavesOut(x) ? 1 : 0, Number.isFinite(x.total?.group) ? x.total.group : Number.isFinite(x.total?.perPerson) ? x.total.perPerson : Infinity]
    : (x) => { const m = thereMinutes(x); return [m == null ? 1 : 0, m ?? Infinity]; };
  const keys = new Map(trips.map((x) => [x.id, keyOf(x)]));
  return trips.slice().sort((a, b) => {
    const ka = keys.get(a.id);
    const kb = keys.get(b.id);
    return (ka[0] - kb[0]) || (ka[1] - kb[1]) || (at.get(a.id) - at.get(b.id));
  });
}

/** How many people the group total is for: every seat and every baby (the preview's count). */
export const groupHead = (trip) => Math.max(1, (trip.party?.head ?? ((trip.party?.adults || 0) + (trip.party?.children || 0))) + (trip.party?.babies || 0));

/**
 * The card's one line (T869): the strongest reason, then the catch, each
 * as its sentence ("Beach 2 min away. Busy in July."). Either may be
 * missing; '' when both are.
 */
export function cardLine(trip, { t, lang = 'en' }) {
  const reason = trip.reasons?.[0] ? factText(trip.reasons[0], { t, lang }) : '';
  const caught = trip.catch ? factText(trip.catch, { t, lang }) : '';
  return { reason, caught };
}

const STAY_LINES = new Set(['home', 'dorm', 'private', 'room', 'hotel', 'hotel2', 'hotel3', 'hotel4', 'hotel5']);

/** The trip's nights from the setup: the dates' own length, else the nights asked. */
const nightsOf = (w) => (w.mode === 'exact' && w.start && w.end
  ? Math.max(1, Math.round((Date.parse(`${w.end}T12:00:00Z`) - Date.parse(`${w.start}T12:00:00Z`)) / 86400000))
  : w.nights);

/**
 * The stages of real work in the traveller's words (T867): the flights
 * from the towns of the airports in reach and when ("Flights from
 * Brussels and Eindhoven in December"), the stays for who goes and how
 * long ("Hotels for 2 adults, 7 nights"), then matching the places to what
 * they like. A stage with nothing to do has no line: with no home airport
 * there is no flight line.
 *
 *   -> [{ key: 'flights' | 'stays' | 'likes', text }]
 */
export function stageLines(settings, { t, lang = 'en', when, data = null, origin = null, stayTier = null }) {
  const g = settings.guide;
  const out = [];
  const towns = airportTowns(data, origin);
  if (g.reach === 'overland') {
    const from = settings.from?.name || origin?.name || '';
    if (from) out.push({ key: 'flights', text: t('tf.load.overland', { city: from }) });
  } else if (towns.length) {
    const city = joinList(towns, lang);
    const w = settings.when;
    let text = t('tf.load.flightsAny', { city });
    if (w.mode === 'exact' && when?.start) {
      text = t('tf.load.flights', { city, dates: when.end ? t('tf.chip.dates', { start: when.start, end: when.end }) : when.start });
    } else if (w.mode === 'months' && when?.start) {
      text = t('tf.stage.flightsIn', { city, months: when.start });
    }
    out.push({ key: 'flights', text });
  }
  const stayRow = SLOT_ROWS.find((r) => r.id === 'stay');
  const tier = stayTierFor({ stayTier: stayTier || null, priority: settings.priority }, stayRow);
  const p = settings.party || {};
  const who = partyText(t, { adults: p.adults || 1, children: p.kids || 0, babies: p.babies || 0 });
  out.push({ key: 'stays', text: t(`tf.stage.stay.${STAY_LINES.has(tier) ? tier : 'home'}`, { who, n: nightsOf(settings.when) }) });
  const likes = g.likes.map((k) => likeLabel(t, k)).map((x) => (lang === 'de' ? x : x.toLocaleLowerCase(lang)));
  // A like whose label is words of its own ("Food and wine") joins with a
  // comma, so the line never reads "hiking and food and wine".
  const joined = likes.some((x) => /\s/.test(x)) ? likes.join(', ') : joinList(likes, lang);
  out.push({ key: 'likes', text: likes.length ? t('tf.load.likes', { likes: joined }) : t('tf.load.likesAny') });
  return out;
}

