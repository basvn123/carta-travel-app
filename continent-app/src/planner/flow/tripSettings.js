/**
 * tripSettings.js, every answer the planner asks for, in one place (T653).
 *
 * The new trip planner asks its questions one at a time (what is booked, who
 * is going, what matters most, when, from where, the help-me-choose answers,
 * the day rhythm) and keeps every answer here, so the gear icon can show them
 * all and change any of them later. Two answers are NOT stored here: where you
 * sleep and how you spend a day live in the app-wide choices (stay_tier and
 * lifestyle), because Explore and every price in the app read those too. The
 * settings sheet edits them in place rather than keeping a second copy.
 *
 * The planning engine (GuidedTripWizard and its steps) still reads the
 * plannerStore draft it always read. `draftPatch` writes the settings into
 * that draft, and `fromDraft` reads an older draft back, so a trip half
 * planned in the old wizard opens in the new flow with its answers kept.
 *
 * Plain JS with no React and no browser globals, so node tests can hold it.
 */

import SLOTS from '../../../config/slots.json' with { type: 'json' };
import { exactWindow, monthsByNext } from '../../lib/tripDates.js';

const wholeWhen = (w) => (w.mode === 'exact' ? exactWindow(w) : w);

export const SETTINGS_VERSION = 1;

/** What can already be booked. "Nothing" is the absence of all four. */
export const BOOKED_KEYS = ['flights', 'stays', 'car', 'tickets'];

/** Who is going, as the first answer on the Who screen. Each one sets the
 *  party counts it implies; the steppers then change them. */
export const PARTY_KINDS = {
  solo: { adults: 1, kids: 0 },
  couple: { adults: 2, kids: 0 },
  friends: { adults: 4, kids: 0 },
  family: { adults: 2, kids: 2 },
  group: { adults: 6, kids: 0 },
};

/** What matters most. Sets how flights, stays and suggestions are ranked. */
export const PRIORITIES = ['price', 'balance', 'comfort'];

/** How the dates are known. */
export const WHEN_MODES = ['exact', 'months', 'any', 'unsure'];

/** The help-me-choose answers. `likes` are countryMatch TRIP_TYPES keys. */
export const TRIP_SHAPES = ['one', 'towns', 'road', 'countries', 'oneway'];
export const LIKES = ['beach', 'hiking', 'lakes', 'culture', 'city', 'food', 'nightlife', 'hidden', 'cycling', 'ski', 'wellness', 'islands'];
export const WEATHER = ['warm', 'mild', 'snow', 'any'];
export const REACH = ['short', 'any', 'overland'];
export const AVOID = ['crowds', 'transfers', 'car', 'heat'];
/** Question 7 (T796): the price lines Carta may pick, from config/slots.json
 *  (every pickable slot that is live). The default is all of them. */
export const PICKABLE = SLOTS.slots.filter((r) => r.pickable && r.status === 'live').map((r) => r.id);
/** The trip finder's trade-off levers (T803), the values of config
 *  recommend.json `levers` (tests/recommendLevers pins them equal). Read
 *  here without the config, so the Plan tab's first load does not carry it. */
export const LEVER_VALUES = Object.freeze({
  flight: ['cheapest', 'quickest', 'times'],
  food: (SLOTS.slots.find((r) => r.id === 'food')?.options || []).map((o) => o.id),
  bases: ['one', 'several'],
});
const leversOf = (l) => Object.fromEntries(Object.entries(LEVER_VALUES)
  .filter(([k, vs]) => l && typeof l === 'object' && vs.includes(l[k]))
  .map(([k]) => [k, l[k]]));

/** The day rhythm, asked after the trip is planned. */
export const RHYTHM = {
  mornings: ['early', 'slow', 'onthego'],
  pace: ['packed', 'balanced', 'slow'],
  detail: ['hour', 'parts', 'list'],
  goal: ['culture', 'relax', 'outdoors', 'food'],
  food: ['street', 'local', 'fine', 'cook'],
  around: ['walk', 'transit', 'taxi', 'car'],
  steps: [5000, 10000, 15000, 20000],
};

export const VISIBILITY = ['private', 'friends', 'link'];

const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const someOf = (v, list) => (Array.isArray(v) ? [...new Set(v.filter((x) => list.includes(x)))] : []);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** A fresh trip: nothing answered yet. `answered` lists the questions the
 *  traveller has actually given (or accepted) an answer to, so a default is
 *  never mistaken for a choice. */
export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    answered: [],
    booked: { flights: false, stays: false, car: false, tickets: false },
    party: { kind: 'couple', adults: 2, kids: 0, kidAges: [], babies: 0, slowWalkers: false },
    priority: 'balance',
    when: { mode: 'exact', start: '', end: '', months: [], nights: 7 },
    from: null,
    guide: { shapes: [], shape: '', likes: [], weather: '', reach: '', avoid: [], budget: { kind: 'total', eur: 0 }, pick: [...PICKABLE] },
    rhythm: { mornings: '', pace: '', detail: '', goal: '', food: '', around: '', steps: 0 },
    trip: { name: '', visibility: 'private', cover: '', created: 0, buddies: [] },
    note: '',
    imports: [],
    daysHow: '',
    // T675 (row T659-a): a trip already under way ('now') asks where the
    // traveller is and until when, instead of When and Where from.
    kind: 'new',
    now: null,
    // T859: the places the traveller named (Tell Carta's words), countries
    // and towns: [{ kind: 'country' | 'place', id, name, iso2, country }].
    places: [],
    // T857 (row T856-c): where each answer came from, by question id:
    // 'words' (Tell Carta's sentence) or 'screen'. An id with no entry was
    // given on its screen, as every answer was before T857.
    sources: {},
  };
}

const SOURCES = ['words', 'screen'];
const PLACE_KINDS = ['country', 'place'];
/** A named place made safe, or null. */
function namedPlace(p) {
  if (!p || typeof p !== 'object' || !PLACE_KINDS.includes(p.kind) || !p.id) return null;
  return {
    kind: p.kind,
    id: String(p.id).slice(0, 80),
    name: String(p.name || '').slice(0, 80),
    iso2: String(p.iso2 || (p.kind === 'country' ? p.id : '')).slice(0, 2).toUpperCase(),
    country: String(p.country || '').slice(0, 80),
  };
}

/** A picked place ({ name, lat, lng, countryCode }) made safe, or null. */
function placeOf(p) {
  return p && typeof p === 'object' && Number.isFinite(Number(p.lat))
    ? { name: String(p.name || ''), lat: Number(p.lat), lng: Number(p.lng ?? p.lon), countryCode: String(p.countryCode || '') }
    : null;
}

/** Any stored object made safe: unknown keys dropped, every value checked. */
export function normalizeSettings(raw) {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const b = raw.booked || {};
  const p = raw.party || {};
  const w = raw.when || {};
  const g = raw.guide || {};
  const shapes = someOf(Array.isArray(g.shapes) ? g.shapes : (g.shape ? [g.shape] : []), TRIP_SHAPES);
  const r = raw.rhythm || {};
  const tr = raw.trip || {};
  const adults = clampInt(p.adults, 1, 20, d.party.adults);
  const kids = clampInt(p.kids, 0, 19, 0);
  const kidAges = Array.isArray(p.kidAges)
    ? p.kidAges.slice(0, kids).map((a) => clampInt(a, 3, 11, 7))
    : [];
  return {
    version: SETTINGS_VERSION,
    answered: Array.isArray(raw.answered) ? [...new Set(raw.answered.filter((x) => typeof x === 'string'))] : [],
    booked: Object.fromEntries(BOOKED_KEYS.map((k) => [k, Boolean(b[k])])),
    party: {
      kind: oneOf(p.kind, Object.keys(PARTY_KINDS), d.party.kind),
      adults,
      kids,
      kidAges,
      babies: clampInt(p.babies, 0, 10, 0),
      slowWalkers: Boolean(p.slowWalkers),
    },
    priority: oneOf(raw.priority, PRIORITIES, d.priority),
    // T815: two dates are made whole (an end on or before the start is
    // dropped, the nights follow the dates).
    when: wholeWhen({
      mode: oneOf(w.mode, WHEN_MODES, d.when.mode),
      start: isDate(w.start) ? w.start : '',
      end: isDate(w.end) ? w.end : '',
      months: Array.isArray(w.months) ? [...new Set(w.months.map(Number).filter((m) => m >= 1 && m <= 12))].sort((a, x) => a - x) : [],
      nights: clampInt(w.nights, 1, 60, d.when.nights),
    }),
    from: placeOf(raw.from),
    kind: raw.kind === 'now' ? 'now' : 'new',
    now: placeOf(raw.now),
    guide: {
      // T753: several shapes, or none for no preference. `shape` stays the
      // one shape when exactly one is picked, for readers of the old field.
      shapes,
      shape: shapes.length === 1 ? shapes[0] : '',
      likes: someOf(g.likes, LIKES).slice(0, 3),
      weather: oneOf(g.weather, WEATHER, ''),
      reach: oneOf(g.reach, REACH, ''),
      avoid: someOf(g.avoid, AVOID),
      budget: {
        kind: g.budget?.kind === 'total' ? 'total' : 'day',
        eur: clampInt(g.budget?.eur, 0, 100000, 0),
      },
      // T796: what Carta picks; a slot left out is the traveller's to choose.
      pick: Array.isArray(g.pick) ? someOf(g.pick, PICKABLE) : [...PICKABLE],
      // T803: the levers on Trips for you as last set; none set reads the answers.
      levers: leversOf(g.levers),
    },
    rhythm: {
      mornings: oneOf(r.mornings, RHYTHM.mornings, ''),
      pace: oneOf(r.pace, RHYTHM.pace, ''),
      detail: oneOf(r.detail, RHYTHM.detail, ''),
      goal: oneOf(r.goal, RHYTHM.goal, ''),
      food: oneOf(r.food, RHYTHM.food, ''),
      around: oneOf(r.around, RHYTHM.around, ''),
      steps: RHYTHM.steps.includes(Number(r.steps)) ? Number(r.steps) : 0,
    },
    trip: {
      name: String(tr.name || '').slice(0, 80),
      visibility: oneOf(tr.visibility, VISIBILITY, 'private'),
      cover: String(tr.cover || ''),
      created: Number(tr.created) > 0 ? Number(tr.created) : 0,
      // Who else is going, by first name (the crew the costs are split by);
      // the invite link goes out once the trip is saved to an account.
      buddies: Array.isArray(tr.buddies)
        ? tr.buddies.map((n) => String(n || '').trim().slice(0, 40)).filter(Boolean).slice(0, 19)
        : [],
    },
    note: String(raw.note || '').slice(0, 600),
    daysHow: oneOf(raw.daysHow, ['carta', 'self'], ''),
    imports: Array.isArray(raw.imports) ? raw.imports.slice(0, 20).map(normalizeImport).filter(Boolean) : [],
    places: Array.isArray(raw.places)
      ? raw.places.map(namedPlace).filter(Boolean).filter((p, i, a) => a.findIndex((x) => x.kind === p.kind && x.id === p.id) === i).slice(0, 6)
      : [],
    sources: raw.sources && typeof raw.sources === 'object'
      ? Object.fromEntries(Object.entries(raw.sources).filter(([k, v]) => typeof k === 'string' && SOURCES.includes(v)))
      : {},
  };
}

const IMPORT_KINDS = ['flight_out', 'flight_home', 'flight', 'stay', 'car', 'transfer', 'activity', 'other'];

/** One booking read from an uploaded file (parse-booking), kept so the
 *  planning steps can fill what it states. Only what the file printed. */
function normalizeImport(b) {
  if (!b || typeof b !== 'object' || !IMPORT_KINDS.includes(b.kind)) return null;
  // null and '' are "not printed", never a price of 0.
  const eur = b.eur == null || b.eur === '' ? NaN : Number(b.eur);
  return {
    kind: b.kind,
    title: String(b.title || '').slice(0, 120),
    city: String(b.city || '').slice(0, 80),
    date: isDate(b.date) ? b.date : '',
    eur: Number.isFinite(eur) && eur >= 0 ? Math.round(eur * 100) / 100 : null,
    code: String(b.code || '').slice(0, 40),
    link: /^https:\/\//.test(String(b.link || '')) ? String(b.link) : '',
  };
}

/**
 * What uploaded bookings say about the trip: which kinds are booked, and the
 * first and last dates printed. The caller merges it into the settings; a
 * field the traveller already answered is never overwritten here.
 */
export function fromImports(s, list) {
  const items = (list || []).map(normalizeImport).filter(Boolean);
  const kinds = new Set(items.map((b) => b.kind));
  const booked = { ...s.booked };
  if (kinds.has('flight') || kinds.has('flight_out') || kinds.has('flight_home')) booked.flights = true;
  if (kinds.has('stay')) booked.stays = true;
  if (kinds.has('car')) booked.car = true;
  if (kinds.has('activity')) booked.tickets = true;
  const dates = items.map((b) => b.date).filter(Boolean).sort();
  const when = !s.answered.includes('when') && dates.length
    // T815: one booked date keeps the old end only when it still comes
    // after it; the nights follow the dates (exactWindow in normalize).
    ? { ...s.when, mode: 'exact', start: dates[0], end: dates.length > 1 ? dates[dates.length - 1] : s.when.end }
    : s.when;
  return normalizeSettings({ ...s, booked, when, imports: [...s.imports, ...items].slice(0, 20) });
}

/** True when nothing is booked yet. */
export const nothingBooked = (s) => !BOOKED_KEYS.some((k) => s.booked[k]);

/** Whether the dates are fixed by what is booked. Flights and stays both
 *  carry dates, so the When question is not asked a second time. */
export const datesFromBookings = (s) => s.booked.flights || s.booked.stays;

/** The party size that prices are multiplied by (babies travel free). */
export const partySize = (s) => s.party.adults + s.party.kids;

/**
 * Mark a question as answered (returns a new settings object), and where the
 * answer came from: 'screen' (its own screen, the default) or 'words' (Tell
 * Carta's sentence, T857). Returns `s` itself when nothing changes.
 */
export function markAnswered(s, id, from = 'screen') {
  const has = s.answered.includes(id);
  const was = s.sources?.[id] || 'screen';
  if (has && was === from) return s;
  const sources = { ...(s.sources || {}) };
  if (from === 'screen') delete sources[id]; else sources[id] = from;
  return { ...s, answered: has ? s.answered : [...s.answered, id], sources };
}

/** The answers the traveller gave on a screen, not through the words. */
export function screenGiven(s) {
  return (s?.answered || []).filter((id) => (s.sources?.[id] || 'screen') === 'screen');
}

/** Apply a patch, normalize, and mark the question answered. */
export function answer(s, id, patch) {
  return markAnswered(normalizeSettings({ ...s, ...patch }), id);
}

/** Picking a party kind sets the counts it implies, keeping ages that still fit. */
export function withPartyKind(s, kind) {
  const base = PARTY_KINDS[kind] || PARTY_KINDS.couple;
  return normalizeSettings({
    ...s,
    party: { ...s.party, kind, adults: base.adults, kids: base.kids, kidAges: s.party.kidAges.slice(0, base.kids) },
  });
}

// ---- What the settings mean downstream ----

/** The Where quiz's spend answer, from what matters most. */
export const spendFor = (s) => ({ price: 'budget', comfort: 'luxury' }[s.priority] || 'standard');

/** How flights are ordered. Price first, or the fewest stops and best hours. */
export function flightRanking(s) {
  if (s.priority === 'price') return { sort: 'price', maxStops: 2 };
  if (s.priority === 'comfort') return { sort: 'comfort', maxStops: 0 };
  return { sort: 'balanced', maxStops: 1 };
}

/** The help-me-choose answers as the Where quiz's answer shape, which is what
 *  countryMatch.matchCountries ranks on. `spend` is the quiz's budget,
 *  standard or luxury; spendFor(s) reads it from what matters most. */
export function quizAnswers(s, spend = 'standard') {
  const g = s.guide;
  const types = [...g.likes];
  if (g.weather === 'snow' && !types.includes('ski')) types.push('ski');
  if (s.party.kind === 'family' && !types.includes('family')) types.push('family');
  const around = g.reach === 'overland' ? 'trainonly' : (g.avoid.includes('car') ? 'flytrain' : 'any');
  // Any moving shape means moving; only one place means a base; otherwise
  // a few stops (T753: the shapes are several now).
  const shapes = g.shapes || [];
  const pace = !shapes.length ? ''
    : shapes.some((x) => x === 'road' || x === 'countries' || x === 'oneway') ? 'moving'
      : shapes.every((x) => x === 'one') ? 'base' : 'fewstops';
  const avoid = [];
  if (g.avoid.includes('crowds')) avoid.push('crowds');
  if (g.avoid.includes('heat') || g.weather === 'mild') avoid.push('heat');
  if (g.avoid.includes('car')) avoid.push('car');
  if (g.avoid.includes('transfers')) avoid.push('longdays');
  // The Where quiz folds into its summary and shows its matches only when
  // every one of its questions has an answer. A question this flow did not
  // ask (reach behind booked flights, a skipped shape) takes the answer that
  // narrows least, so the matches are never held back by it.
  return {
    types: types.slice(0, 3),
    typesDone: types.length > 0,
    spend,
    around,
    distance: g.reach === 'short' ? 'short' : 'anywhere',
    pace: pace || 'fewstops',
    avoid,
  };
}

/** The day rhythm as the day planner's prefs. Unanswered stays undefined so
 *  the day planner keeps its own default. */
export function dayPrefs(s) {
  const r = s.rhythm;
  const startMin = { early: 8 * 60, onthego: 9 * 60 + 30, slow: 11 * 60 }[r.mornings];
  const pace = { packed: 'packed', balanced: 'balanced', slow: 'relaxed' }[r.pace];
  const steps = r.steps || ({ walk: 15000, transit: 10000, taxi: 5000, car: 5000 }[r.around]);
  return {
    dayStartMin: startMin,
    pace,
    detail: r.detail || undefined,
    steps: steps || undefined,
    food: { street: 'quick', local: 'sit', fine: 'sit', cook: 'picnic' }[r.food],
    stepFree: s.party.slowWalkers || undefined,
    groupSize: partySize(s),
  };
}

// ---- The old wizard draft, both ways ----

/** Settings read from a plannerStore draft (the old wizard's, or this flow's
 *  own once written). A draft that already carries `settings` wins. */
export function fromDraft(draft) {
  if (draft?.settings) return normalizeSettings(draft.settings);
  const s = defaultSettings();
  if (!draft || typeof draft !== 'object') return s;
  const wz = draft.wizard || {};
  const tv = draft.travelers || {};
  const td = draft.travelDates || {};
  const answered = [];
  const booked = { flights: Boolean(wz.booked?.travel), stays: Boolean(wz.booked?.stays), car: false, tickets: false };
  // A draft past step one has seen the Booked question.
  if ((Number(wz.step) || 1) > 1 || wz.stepName) answered.push('booked', 'who');
  const adults = Number(tv.adults) || 2;
  const kids = Number(tv.children) || 0;
  const kind = kids > 0 ? 'family' : adults === 1 ? 'solo' : adults === 2 ? 'couple' : adults <= 5 ? 'friends' : 'group';
  const flex = wz.dateMode === 'flex';
  const month = Number(String(wz.flexMonth || '').slice(5, 7)) || Number(wz.flexMonth) || 0;
  const when = flex
    ? { mode: month ? 'months' : 'any', start: '', end: '', months: month ? [month] : [], nights: Number(wz.flexNights) || 7 }
    : { mode: 'exact', start: td.startDate || '', end: td.endDate || '', months: [], nights: Number(td.durationNights) || 7 };
  if (flex || (td.startDate && td.endDate)) answered.push('when');
  if (draft.origin) answered.push('from');
  return normalizeSettings({
    ...s,
    answered,
    booked,
    party: { kind, adults, kids, kidAges: [], babies: Number(tv.babies) || 0, slowWalkers: false },
    when,
    from: draft.origin || null,
  });
}

/** The parts of a plannerStore draft the planning engine reads on mount,
 *  written from the settings. Merged into the draft by the caller. */
export function draftPatch(s, draft = {}, today = new Date()) {
  const wz = draft.wizard || {};
  const flex = s.when.mode !== 'exact';
  // T815: the next picked month to come, as Explore reads it (appSync), not
  // the first in calendar order.
  const m = monthsByNext(s.when.months, today)[0];
  return {
    settings: s,
    origin: s.from || draft.origin || null,
    travelers: {
      ...(draft.travelers || {}),
      adults: s.party.adults,
      children: s.party.kids,
      babies: s.party.babies,
    },
    travelDates: {
      ...(draft.travelDates || {}),
      isFlexible: flex,
      startDate: flex ? '' : s.when.start,
      endDate: flex ? '' : s.when.end,
      durationNights: s.when.nights,
      flexibleMonths: flex ? monthsByNext(s.when.months, today).map((x) => nextMonthKey(x, today)) : [],
    },
    wizard: {
      ...wz,
      booked: { travel: s.booked.flights, stays: s.booked.stays },
      dateMode: flex ? 'flex' : 'exact',
      // The wizard keys a flexible month as "YYYY-MM"; the next time it
      // comes round. Empty means any month.
      flexMonth: m ? nextMonthKey(m, today) : '',
      flexNights: s.when.nights,
    },
  };
}

/** "YYYY-MM" for the next time month m (1 to 12) comes round, this month
 *  included. Takes today as an argument so tests can pin it. */
export function nextMonthKey(m, today = new Date()) {
  const y = today.getFullYear();
  const now = today.getMonth() + 1;
  const year = m >= now ? y : y + 1;
  return `${year}-${String(m).padStart(2, '0')}`;
}

/**
 * The day rhythm as the AI day plan's preset (T674): the modal's vibe and
 * pace, and the plan-day profile the Edge Function validates (companions,
 * startTime HH:MM, steps, food sit|quick|picnic, stepFree, moods). `autoRun`
 * when the rhythm answers what the modal would ask (the pace and the goal),
 * so "Fill this day" asks nothing it already knows.
 */
export function dayAiPreset(s) {
  const r = s.rhythm;
  const companions = { solo: 'solo', couple: 'partner', friends: 'friends', family: 'family', group: 'group' }[s.party.kind] || null;
  const startTime = { early: '08:00', onthego: '09:30', slow: '11:00' }[r.mornings] || null;
  const steps = r.steps || ({ walk: 15000, transit: 10000, taxi: 5000, car: 5000 }[r.around]) || null;
  const food = { street: 'quick', local: 'sit', fine: 'sit', cook: 'picnic' }[r.food] || null;
  const moods = { culture: ['museums', 'sights'], relax: ['beach', 'views'], outdoors: ['nature', 'active'], food: ['food', 'local'] }[r.goal] || [];
  return {
    vibe: { culture: 'culture', outdoors: 'active', food: 'foodie' }[r.goal] || 'mix',
    pace: { packed: 'packed', balanced: 'balanced', slow: 'relaxed' }[r.pace] || 'balanced',
    autoRun: Boolean(r.pace && r.goal),
    profile: {
      companions,
      startTime,
      steps,
      food,
      stepFree: Boolean(s.party.slowWalkers),
      moods,
    },
  };
}

/**
 * The planning engine's own edits back into the settings (T675, row T653-a):
 * a date changed on its When, or a head count on its Who, so the gear never
 * shows the setup answer while the trip runs on other dates. `e` carries the
 * engine's dateMode ('exact' | 'flex'), startDate, endDate, flexMonth
 * ("YYYY-MM" or ''), the nights, and the head counts. An exact trip still
 * waiting for its second date keeps the old answer. Returns `s` itself when
 * nothing moved, so the store's no-op guard holds.
 */
export function withEngineEdits(s, e) {
  const nights = Number(e.nights) > 0 ? Number(e.nights) : s.when.nights;
  let when = s.when;
  if (e.dateMode === 'flex') {
    const m = Number(String(e.flexMonth || '').slice(5, 7)) || 0;
    when = m
      ? { mode: 'months', start: '', end: '', months: s.when.months.includes(m) ? s.when.months : [m], nights }
      : { mode: s.when.mode === 'unsure' ? 'unsure' : 'any', start: '', end: '', months: [], nights };
  } else if (e.startDate && e.endDate) {
    when = { mode: 'exact', start: e.startDate, end: e.endDate, months: [], nights };
  }
  const adults = Number(e.adults) > 0 ? Number(e.adults) : s.party.adults;
  const kids = Number(e.kids) >= 0 ? Number(e.kids) : s.party.kids;
  const babies = Number(e.babies) >= 0 ? Number(e.babies) : s.party.babies;
  const sameWhen = JSON.stringify(when) === JSON.stringify(s.when);
  const sameParty = adults === s.party.adults && kids === s.party.kids && babies === s.party.babies;
  if (sameWhen && sameParty) return s;
  return normalizeSettings({
    ...s,
    when,
    party: sameParty ? s.party : { ...s.party, adults, kids, babies, kidAges: s.party.kidAges.slice(0, kids) },
  });
}
