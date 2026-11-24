/**
 * seed.js, the one hand-over into Plan (G12 plan rethink, decision §6).
 *
 * Every tab that starts a trip (the door, a place, region or country page,
 * a journey, Saved, Ask, My trips, a booking, Samen) hands Plan a PlanSeed,
 * so nothing arrives as a bare country again:
 *
 *   { v: 1, source, ref: { kind, id } | null, label,
 *     places: [{ kind, id, iso2, name }],           a wish: Carta orders and sizes it
 *     stops: [{ dest, nights, dayActivities }],     a fixed route
 *     legModes: {}, transport: 'public'|'car'|null,
 *     when: { mode: 'exact'|'months'|'any', start, end, months, nights } | null,
 *     party: { kind, adults, kids, babies, kidAges } | null,
 *     budget: { eur, kind: 'total'|'day', per: 'person'|'group', mode: 'cap'|'soft'|'band' } | null,
 *     booked: { flights, stays, car, tickets } | null,   each a flag or booking rows (below)
 *     coplanners: [], groupId: null,
 *     avoidIso2: [],                                "somewhere new"
 *     spendRef: { eurPP, nights, planId } | null,   own logged spend, a reference line only
 *     pins: [] }                                    fields the source fixes; never asked again
 *
 * Booked rows (G12 B2, lane L4): `booked.flights` and `booked.stays` may
 * hold the bookings themselves, in the trip settings' import shape (the
 * rows parse-booking returns and tripSettings normalizeImport keeps):
 *   { kind: 'flight_out'|'flight_home'|'flight'|'stay', title, city,
 *     date: 'YYYY-MM-DD', eur: number|null (null = not printed), code, link }
 * A flight row's `city` is the town it lands in, a stay's the town it is in.
 * seedToSettings puts the rows in `imports`, so doors.js bookedTrip builds
 * the trip page from them; `true` alone says "booked" with nothing to place.
 *
 * The seed is not stored: it lives in memory (and flowMemory) until the
 * first save, and never goes in a URL. The budget keeps the stored shape
 * (`kind`, `per`, planner/flow/tripSettings.js) with a `mode` beside it.
 *
 *   makeSeed(raw)                        any object made a safe seed
 *   exploreAnswers(model)                what Explore's Settings give Plan (lib/settings readSettings)
 *   seedToSettings(seed, opts)           a trip's settings: default < style < Explore < seed
 *   missingEssentials(settings, opts)    the only two things that stop the flow
 *   routeSeed(seed, opts)                which landing the seed opens on
 *
 * Pure: no React, no store, so node tests hold it (tests/planSeed.test.mjs).
 */
import { BUDGET_MODES, defaultSettings, fromImports, markAnswered, normalizeSettings, BOOKED_KEYS, PARTY_KINDS } from '../../planner/flow/tripSettings.js';
import { withStyle } from '../../planner/flow/styleSeed.js';

export const SEED_VERSION = 1;
export const SEED_SOURCES = Object.freeze(['door', 'place', 'region', 'country', 'journey', 'trip', 'saved', 'ask', 'past', 'friends', 'booking', 'kept']);
/** The seed fields a source may fix (pins), each the planner question it answers. */
export const SEED_PINS = Object.freeze({ places: 'places', when: 'when', party: 'who', budget: 'g:budget', booked: 'booked', transport: 'g:around' });
/** The landings a seed opens on (decision §1.5, S7, S15). */
export const LANDINGS = Object.freeze(['list', 'found', 'trip', 'booked', 'choose']);

const PLACE_KINDS = ['place', 'region', 'country'];
const WHEN_MODES = ['exact', 'months', 'any'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO2_RE = /^[A-Z]{2}$/;
const MAX_PLACES = 6;
const MAX_STOPS = 12;

const str = (v, n = 80) => (typeof v === 'string' ? v.slice(0, n) : '');
const int = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const iso2Of = (v) => {
  const s = String(v || '').toUpperCase();
  return ISO2_RE.test(s) ? s : '';
};

function placesOf(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    if (!p || !PLACE_KINDS.includes(p.kind) || !p.id) continue;
    const id = str(String(p.id));
    if (out.some((x) => x.kind === p.kind && x.id === id)) continue;
    // The name is for the screens only (the planner's chips); the id is what counts.
    out.push({ kind: p.kind, id, iso2: iso2Of(p.iso2) || (p.kind === 'country' ? iso2Of(id) : ''), name: str(p.name) });
    if (out.length >= MAX_PLACES) break;
  }
  return out;
}

function stopsOf(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && x.dest)
    .slice(0, MAX_STOPS)
    .map((x) => ({
      dest: str(String(x.dest)),
      nights: int(x.nights, 1, 60, 1),
      dayActivities: Array.isArray(x.dayActivities) ? x.dayActivities.slice(0, 40) : [],
    }));
}

function whenOf(w) {
  if (!w || typeof w !== 'object' || !WHEN_MODES.includes(w.mode)) return null;
  const months = Array.isArray(w.months) ? [...new Set(w.months.map(Number).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b) : [];
  const start = ISO_RE.test(w.start || '') ? w.start : '';
  const end = ISO_RE.test(w.end || '') && w.end > start ? w.end : '';
  if (w.mode === 'exact' && !(start && end)) return null;
  if (w.mode === 'months' && !months.length) return null;
  return { mode: w.mode, start: w.mode === 'exact' ? start : '', end: w.mode === 'exact' ? end : '', months: w.mode === 'months' ? months : [], nights: int(w.nights, 1, 60, 7) };
}

function partyOf(p) {
  if (!p || typeof p !== 'object') return null;
  const kids = int(p.kids, 0, 19, 0);
  return {
    kind: Object.keys(PARTY_KINDS).includes(p.kind) ? p.kind : 'couple',
    adults: int(p.adults, 1, 20, 2),
    kids,
    babies: int(p.babies, 0, 10, 0),
    kidAges: Array.isArray(p.kidAges) ? p.kidAges.slice(0, kids).map((a) => int(a, 3, 11, 7)) : [],
  };
}

function budgetOf(b) {
  if (!b || typeof b !== 'object' || !(Number(b.eur) > 0)) return null;
  const kind = b.kind === 'day' ? 'day' : 'total';
  return {
    eur: int(b.eur, 1, 2000000, 0),
    kind,
    // A day budget is a person's (tripSettings budgetOfRaw); only a trip budget can be the group's.
    per: kind === 'total' && b.per === 'group' ? 'group' : 'person',
    mode: BUDGET_MODES.includes(b.mode) ? b.mode : 'soft',
  };
}

function bookedOf(b) {
  if (!b || typeof b !== 'object') return null;
  // A booked part is a flag or the bookings themselves (parse-booking's rows).
  const one = (v) => (Array.isArray(v) ? v.slice(0, 20) : Boolean(v));
  const out = Object.fromEntries(BOOKED_KEYS.map((k) => [k, one(b[k])]));
  return BOOKED_KEYS.some((k) => (Array.isArray(out[k]) ? out[k].length : out[k])) ? out : null;
}

function spendRefOf(r) {
  if (!r || typeof r !== 'object' || !(Number(r.eurPP) > 0)) return null;
  return { eurPP: Math.round(Number(r.eurPP)), nights: int(r.nights, 1, 60, 1), planId: str(String(r.planId || '')) || null };
}

/** Any object made a safe PlanSeed (unknown keys dropped, every value checked). */
export function makeSeed(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const legModes = r.legModes && typeof r.legModes === 'object'
    ? Object.fromEntries(Object.entries(r.legModes).filter(([k, v]) => typeof k === 'string' && typeof v === 'string').slice(0, MAX_STOPS))
    : {};
  return {
    v: SEED_VERSION,
    source: SEED_SOURCES.includes(r.source) ? r.source : 'door',
    ref: r.ref && r.ref.kind && r.ref.id ? { kind: str(String(r.ref.kind), 24), id: str(String(r.ref.id)) } : null,
    label: str(r.label),
    places: placesOf(r.places),
    stops: stopsOf(r.stops),
    legModes,
    transport: r.transport === 'public' || r.transport === 'car' ? r.transport : null,
    when: whenOf(r.when),
    party: partyOf(r.party),
    budget: budgetOf(r.budget),
    booked: bookedOf(r.booked),
    coplanners: Array.isArray(r.coplanners) ? r.coplanners.map((x) => str(String(x || ''), 64)).filter(Boolean).slice(0, 19) : [],
    groupId: r.groupId ? str(String(r.groupId), 64) : null,
    avoidIso2: Array.isArray(r.avoidIso2) ? [...new Set(r.avoidIso2.map(iso2Of).filter(Boolean))] : [],
    spendRef: spendRefOf(r.spendRef),
    pins: Array.isArray(r.pins) ? [...new Set(r.pins.filter((p) => Object.hasOwn(SEED_PINS, p)))] : [],
  };
}

/**
 * What Explore's Settings give Plan (decision §4), from lib/settings
 * readSettings' model: When and the length only when the traveller set them
 * (`whenSet`, `nightsSet`), else nothing, so a default never reads as a
 * choice; From when the traveller named a start place.
 *   -> { when: settings.when | null, nights: n | null, from: place | null }
 */
export function exploreAnswers(model) {
  if (!model) return { when: null, nights: null, from: null };
  const nights = model.nightsSet ? model.tripNights : null;
  let when = null;
  if (model.whenSet) {
    if (model.dateMode === 'dates' && model.dates) {
      when = { mode: 'exact', start: model.dates.start, end: model.dates.end, months: [], nights: model.nights };
    } else if (model.dateMode === 'month' && model.month) {
      when = { mode: 'months', start: '', end: '', months: [Number(model.month.slice(5, 7))], nights: nights ?? model.tripNights };
    } else {
      when = { mode: 'any', start: '', end: '', months: [], nights: nights ?? model.tripNights };
    }
  }
  const p = model.fromPlace;
  const from = p && Number.isFinite(Number(p.lat))
    ? { name: String(p.name || ''), lat: Number(p.lat), lng: Number(p.lng ?? p.lon), countryCode: String(p.countryCode || p.iso2 || '') }
    : null;
  return { when, nights, from };
}

/** The seed's places as the planner's named places (a region stands for its country). */
function namedPlaces(seed) {
  const fromStops = seed.stops.map((x) => ({ kind: 'place', id: x.dest }));
  const list = seed.places.length ? seed.places : fromStops;
  return list.map((p) => (p.kind === 'region' ? (p.iso2 ? { kind: 'country', id: p.iso2, iso2: p.iso2 } : null) : { kind: p.kind, id: p.id, iso2: p.iso2, name: p.name || '' }))
    .filter(Boolean);
}

/**
 * A trip's settings from a seed (decision §4 precedence: words > seed >
 * Explore > style > default; the words are read later, on the door's line).
 * Each answer is marked by where it came from: the style's 'style', Explore's
 * 'explore' (asked, prefilled), a pinned seed field 'seed' (never asked
 * again). A seed field the source gives but does not pin is written as a
 * prefill and left unanswered, so the flow asks it with that value.
 *
 *   opts: { style (the active or picked travel style), explore
 *           (exploreAnswers), base (settings to start from) }
 */
export function seedToSettings(rawSeed, { style = null, explore = null, base = null } = {}) {
  const seed = makeSeed(rawSeed);
  let s = withStyle(normalizeSettings(base || defaultSettings()), style);
  const ex = explore || { when: null, nights: null, from: null };
  if (ex.when) s = markAnswered(normalizeSettings({ ...s, when: ex.when }), 'when', 'explore');
  else if (ex.nights) s = normalizeSettings({ ...s, when: { ...s.when, nights: ex.nights } });
  if (ex.from) s = markAnswered(normalizeSettings({ ...s, from: ex.from }), 'from', 'explore');

  const pinned = new Set(seed.pins);
  const give = (field, patch) => {
    const id = SEED_PINS[field];
    let next = normalizeSettings({ ...s, ...patch });
    if (pinned.has(field)) next = markAnswered(next, id, 'seed');
    else if (next.answered.includes(id) && next.sources?.[id] !== 'screen') {
      // A prefill, not an answer: the question stays open with this value.
      const sources = { ...next.sources };
      delete sources[id];
      next = { ...next, answered: next.answered.filter((x) => x !== id), sources };
    }
    s = next;
  };
  const places = namedPlaces(seed);
  if (places.length) give('places', { places });
  if (seed.when) give('when', { when: seed.when });
  if (seed.party) give('party', { party: { ...s.party, ...seed.party, slowWalkers: s.party.slowWalkers } });
  if (seed.budget) {
    const people = (seed.party || s.party).adults + (seed.party || s.party).kids;
    const b = seed.budget.per === 'group'
      ? { kind: 'total', per: 'group', mode: seed.budget.mode, groupEur: seed.budget.eur, eur: Math.round(seed.budget.eur / Math.max(1, people)) }
      : { kind: seed.budget.kind, per: 'person', mode: seed.budget.mode, eur: seed.budget.eur };
    give('budget', { guide: { ...s.guide, budget: b } });
  }
  if (seed.booked) {
    // Booking rows go in as the trip's imports (fromImports also sets the
    // flags and, when no When was answered, the dates they print).
    const rows = ['flights', 'stays'].flatMap((k) => (Array.isArray(seed.booked[k]) ? seed.booked[k] : []));
    if (rows.length) s = fromImports(s, rows);
    const flags = Object.fromEntries(BOOKED_KEYS.map((k) => [k, Array.isArray(seed.booked[k]) ? seed.booked[k].length > 0 : Boolean(seed.booked[k])]));
    give('booked', { booked: { ...s.booked, ...Object.fromEntries(Object.entries(flags).filter(([, v]) => v)) } });
  }
  if (seed.transport) give('transport', { guide: { ...s.guide, around: seed.transport } });
  return s;
}

/**
 * The only two things that stop the flow (decision §1.3): no origin at all
 * (none on the trip, no app start or airport, and no booked flight that
 * fixes the way there), and children without ages. Everything else has a
 * visible default.
 *   opts: { origin (the app's home airport code or place), airports (codes in reach) }
 *   -> ['from'?, 'kidAges'?]
 */
export function missingEssentials(settings, { origin = null, airports = [] } = {}) {
  const s = normalizeSettings(settings);
  const out = [];
  if (!s.from && !origin && !(airports || []).length && !s.booked.flights) out.push('from');
  if (s.party.kids > 0 && s.party.kidAges.length < s.party.kids) out.push('kidAges');
  return out;
}

const PLACE_SOURCES = ['place', 'region', 'country'];

/**
 * Which landing a seed opens on (decision §1.5, §3.2):
 *   'choose'  a place, region or country page while a trip is open (S15:
 *             add it to that trip, or a new trip)
 *   'trip'    a fixed route (a journey, a library trip, Ask with stops, a
 *             kept trip, a friends plan with stops)
 *   'booked'  something booked: the trip page the bookings make (doors.js bookedTrip)
 *   'found'   one or more places known: a priced found trip
 *   'list'    nothing fixed yet (a month, a length, a budget, a past trip): Trips for you
 *   opts: { openTrip (the trip open in Plan, or null) }
 */
export function routeSeed(rawSeed, { openTrip = null } = {}) {
  const seed = makeSeed(rawSeed);
  if (openTrip && PLACE_SOURCES.includes(seed.source) && (seed.places.length || seed.ref)) return 'choose';
  if (seed.stops.length) return 'trip';
  const b = seed.booked;
  if (seed.source === 'booking' || (b && (b.flights === true || b.stays === true || (Array.isArray(b.flights) && b.flights.length) || (Array.isArray(b.stays) && b.stays.length)))) return 'booked';
  if (seed.places.length) return 'found';
  return 'list';
}

/**
 * A seed's fixed route as the trip planner's hand-over (App's
 * pendingSharedTrip, read by useTripPlannerEffects): the stops with their
 * nights and day activities, the label, the leg modes, car or public, and
 * the party when the seed names one. Dates only when the seed or Explore
 * gives exact ones; else the trip page asks for them (as before).
 *   opts: { explore (exploreAnswers) }  -> the hand-over, or null with no stops
 */
export function seedToSharedTrip(rawSeed, { explore = null } = {}) {
  const seed = makeSeed(rawSeed);
  const stops = seed.stops
    .map((x) => ({ destinationId: x.dest, nights: x.nights, activities: x.dayActivities.slice(0, 20).map((a) => String(a).slice(0, 80)) }))
    .filter((x) => x.destinationId && x.nights);
  if (!stops.length) return null;
  const when = seed.when || explore?.when || null;
  const out = {
    stops,
    label: seed.label,
    transportPref: seed.transport === 'car' ? 'owncar' : 'public',
    legModes: seed.legModes,
    tripStart: when?.mode === 'exact' ? when.start : '',
  };
  if (seed.party) Object.assign(out, { groupSize: seed.party.adults, children: seed.party.kids, babies: seed.party.babies });
  return out;
}

/**
 * G12 L6 (B2 deferral): what a seed that lands straight on the trip page
 * still has to say to that trip's settings. The hand-over (seedToSharedTrip)
 * carries only exact dates and the party; a month, a length or a budget the
 * source gave would be lost, and the trip page's assumption bar and budget
 * would read the defaults. Returns the settings with the seed's When and
 * budget (marked as the seed's when pinned), or the same object when the
 * seed gives neither.
 */
export function seedTripPatch(rawSeed, settings) {
  const seed = makeSeed(rawSeed);
  if (!seed.when && !seed.budget) return settings;
  const made = seedToSettings(seed, { base: settings });
  let s = normalizeSettings(settings);
  const take = (id, patch) => {
    s = normalizeSettings({ ...s, ...patch });
    if (made.answered.includes(id)) s = markAnswered(s, id, made.sources?.[id] || 'seed');
  };
  if (seed.when) take('when', { when: made.when });
  if (seed.budget) take('g:budget', { guide: { ...s.guide, budget: made.guide.budget } });
  return s;
}

/** True when the seed says nothing at all (an empty door): Plan's home, not a new trip. */
export function emptySeed(rawSeed) {
  const s = makeSeed(rawSeed);
  return !s.places.length && !s.stops.length && !s.when && !s.party && !s.budget && !s.booked && !s.avoidIso2.length && !s.spendRef && !s.coplanners.length && !s.transport;
}
