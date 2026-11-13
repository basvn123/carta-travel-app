/**
 * travelStyles.js, the traveller's named ways of travelling (owner,
 * 2026-11-12: "create some different trip settings, and then dependent on
 * who you travel with, choose one", "maybe blend those in").
 *
 * A travel style is one named bundle of the two halves Carta asks about:
 *
 *   How you stay   who comes, where you sleep, how you eat and drink, how you
 *                  get there and what matters most. These are the app-wide
 *                  choices every price reads (stay_tier, lifestyle,
 *                  transport_mode, the party), so the active style IS those
 *                  choices: editing any of them anywhere edits the style.
 *   How you explore one base or moving around, the persona, what you like and
 *                  avoid, how you get around there, when the day starts and
 *                  how full it is. These are the trip planner's answers
 *                  (planner/flow/tripSettings.js guide and rhythm); a new
 *                  trip starts from the active style's, marked as given by
 *                  the style, so the planner does not ask them again.
 *
 * One style is active at a time, app-wide (the Apple Focus model: switching
 * is cheaper than editing). A saved trip keeps the answers it was planned
 * with; switching style never reprices a saved trip by itself.
 *
 * Kept in `choices.travel_styles` ({ list, active }), so the account sync
 * that already carries `choices` carries the styles too, and mirrored in
 * localStorage under STYLES_KEY (the URL mirror only keeps its own keys).
 *
 * Plain JS with no React and no browser globals, so node tests can hold it.
 */
import { PROFILES } from './lifestyleProfiles.js';
import { DEFAULT_LIFESTYLE } from './runtime_pricing.js';
import RECOMMEND from '../../config/recommend.json' with { type: 'json' };

export const STYLES_VERSION = 1;
export const STYLES_KEY = 'carta.travelStyles.v1';
/** More than six turns the picker back into a settings page (research r5). */
export const MAX_STYLES = 6;

/** A colour world per style (carta-design "Tones"), so a style is known at a
 *  glance in the header and on its card before its name is read. */
export const TONES = ['sun', 'lagoon', 'umber', 'sea', 'mist'];
/** Who comes, the same kinds as the planner's Who question. */
export const WHO_KINDS = ['solo', 'couple', 'friends', 'family', 'group'];
export const STAY_TIERS = ['dorm', 'private', 'home', 'room', 'hotel2', 'hotel3', 'hotel4', 'hotel5'];
export const WAYS = ['any', 'plane', 'train', 'bus', 'car'];
export const AROUND = ['public', 'taxi', 'car', 'mix'];
export const PRIORITIES = ['price', 'balance', 'comfort'];
/** One base, a few towns from a base or two, a road trip, several countries
 *  (tripSettings TRIP_SHAPES without the legacy 'oneway'). */
export const SHAPES = ['one', 'towns', 'road', 'countries'];
export const PERSONAS = [...RECOMMEND.persona.ids];
export const LIKES = ['beach', 'hiking', 'lakes', 'culture', 'city', 'food', 'nightlife', 'hidden', 'cycling', 'ski', 'wellness', 'islands'];
export const AVOID = ['crowds', 'transfers', 'heat'];
export const MORNINGS = ['early', 'onthego', 'slow'];
/** The taste profile's own two facets (lib/taste.js SIZES, QUIET): kept in
 *  the style so "Your travel style" and the travel styles are one thing. */
export const SIZES = ['city', 'town', 'village', 'mix'];
export const QUIET = ['quiet', 'lively'];
export const PACE = ['slow', 'balanced', 'packed'];

const PARTY = {
  solo: { adults: 1, kids: 0 },
  couple: { adults: 2, kids: 0 },
  friends: { adults: 4, kids: 0 },
  family: { adults: 2, kids: 2 },
  group: { adults: 6, kids: 0 },
};

/**
 * The starting styles, one per kind of company. Each is a sensible guess a
 * traveller then makes their own; the names are i18n keys until renamed.
 * The bed and the table are the Lifestyle panel's own tiers and presets, so
 * a template never prices anything the panel could not.
 */
export const TEMPLATES = {
  solo: {
    nameKey: 'styles.t.solo', tone: 'sun',
    who: { kind: 'solo', adults: 1, kids: 0, babies: 0, slowWalkers: false },
    stay: 'private', table: 'Backpacker', way: 'any', priority: 'price',
    explore: { shapes: ['towns'], personas: ['cities', 'lively'], likes: [], avoid: [], around: 'public', size: 'city', quiet: 'lively' },
    days: { mornings: 'early', pace: 'packed' },
  },
  couple: {
    nameKey: 'styles.t.couple', tone: 'umber',
    who: { kind: 'couple', adults: 2, kids: 0, babies: 0, slowWalkers: false },
    stay: 'hotel3', table: 'Foodie', way: 'any', priority: 'balance',
    explore: { shapes: ['towns'], personas: ['towns', 'hidden'], likes: [], avoid: ['crowds'], around: 'public', size: 'town', quiet: 'quiet' },
    days: { mornings: 'slow', pace: 'balanced' },
  },
  friends: {
    nameKey: 'styles.t.friends', tone: 'lagoon',
    who: { kind: 'friends', adults: 4, kids: 0, babies: 0, slowWalkers: false },
    stay: 'home', table: 'Nightlife', way: 'any', priority: 'price',
    explore: { shapes: ['one', 'towns'], personas: ['lively', 'coast'], likes: [], avoid: [], around: 'mix', size: 'mix', quiet: 'lively' },
    days: { mornings: 'slow', pace: 'balanced' },
  },
  family: {
    nameKey: 'styles.t.family', tone: 'sea',
    who: { kind: 'family', adults: 2, kids: 2, babies: 0, slowWalkers: false },
    stay: 'home', table: 'Family', way: 'any', priority: 'balance',
    explore: { shapes: ['one'], personas: ['slow', 'coast'], likes: [], avoid: ['transfers', 'heat'], around: 'car', size: 'mix', quiet: 'quiet' },
    days: { mornings: 'onthego', pace: 'slow' },
  },
  group: {
    nameKey: 'styles.t.group', tone: 'mist',
    who: { kind: 'group', adults: 6, kids: 0, babies: 0, slowWalkers: false },
    stay: 'home', table: 'Easygoing', way: 'any', priority: 'price',
    explore: { shapes: ['one'], personas: ['hubtrips'], likes: [], avoid: ['transfers'], around: 'public' },
    days: { mornings: 'onthego', pace: 'balanced' },
  },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const someOf = (v, list, max = 99) => (Array.isArray(v) ? [...new Set(v.filter((x) => list.includes(x)))].slice(0, max) : []);

/** The lifestyle counts made safe (the same keys the Lifestyle panel keeps). */
function lifestyleOf(raw) {
  const base = { ...DEFAULT_LIFESTYLE };
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, cadence: raw.cadence === 'day' ? 'day' : 'week' };
  for (const k of Object.keys(base)) {
    if (k === 'cadence') continue;
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n * 10) / 10;
  }
  return out;
}

const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** One style made safe: unknown keys dropped, every value checked. */
export function normalizeStyle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw.who || {};
  const kind = oneOf(w.kind, WHO_KINDS, 'couple');
  const adults = clampInt(w.adults, 1, 20, PARTY[kind].adults);
  const e = raw.explore || {};
  // "mix" only alone, as the planner's persona question keeps it, then three.
  const allP = someOf(e.personas, PERSONAS);
  const personas = (allP.length > 1 ? allP.filter((p) => p !== 'mix') : allP).slice(0, 3);
  const d = raw.days || {};
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 24) : newId(),
    // A name the traveller typed, or '' for the template's own (nameKey).
    name: String(raw.name || '').trim().slice(0, 40),
    nameKey: typeof raw.nameKey === 'string' && /^styles\.t\.[a-z]+$/.test(raw.nameKey) ? raw.nameKey : '',
    template: oneOf(raw.template, TEMPLATE_IDS, ''),
    tone: oneOf(raw.tone, TONES, 'umber'),
    who: {
      kind,
      adults,
      kids: clampInt(w.kids, 0, 19, 0),
      babies: clampInt(w.babies, 0, 10, 0),
      slowWalkers: Boolean(w.slowWalkers),
    },
    stay: oneOf(raw.stay, STAY_TIERS, 'home'),
    lifestyle: lifestyleOf(raw.lifestyle),
    way: oneOf(raw.way, WAYS, 'any'),
    priority: oneOf(raw.priority, PRIORITIES, 'balance'),
    explore: {
      shapes: someOf(e.shapes, SHAPES),
      personas,
      likes: someOf(e.likes, LIKES, 3),
      avoid: someOf(e.avoid, AVOID),
      around: oneOf(e.around, AROUND, ''),
      size: oneOf(e.size, SIZES, ''),
      quiet: oneOf(e.quiet, QUIET, ''),
    },
    days: {
      mornings: oneOf(d.mornings, MORNINGS, ''),
      pace: oneOf(d.pace, PACE, ''),
    },
  };
}

/** The whole store made safe: at most MAX_STYLES, ids unique, the active one
 *  a style that exists (or '' while there are none). */
export function normalizeStyles(raw) {
  const list = [];
  const seen = new Set();
  for (const r of Array.isArray(raw?.list) ? raw.list : []) {
    const s = normalizeStyle(r);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    list.push(s);
    if (list.length >= MAX_STYLES) break;
  }
  // '' on purpose is "no style": the choices came from elsewhere (a saved
  // trip loaded over them), so they must not be written into a style.
  const active = list.some((s) => s.id === raw?.active) ? raw.active : (raw?.active === '' ? '' : (list[0]?.id || ''));
  return { version: STYLES_VERSION, list, active };
}

/** A new style from a template (or from the choices as they stand, for
 *  "make your own"). `choices` fills what a template does not decide. */
export function styleFromTemplate(templateId, choices = {}) {
  const t = TEMPLATES[templateId];
  if (!t) return styleFromChoices({ tone: 'umber' }, choices);
  return normalizeStyle({
    id: newId(),
    nameKey: t.nameKey,
    template: templateId,
    tone: t.tone,
    who: t.who,
    stay: t.stay,
    lifestyle: { ...(PROFILES[t.table] || DEFAULT_LIFESTYLE), cadence: 'week', coffees_per_day: (PROFILES[t.table] || DEFAULT_LIFESTYLE).coffees_per_day },
    way: t.way,
    priority: t.priority,
    explore: t.explore,
    days: t.days,
  });
}

/** The party kind the head counts read as, for a style made from choices. */
export function kindOfCounts(adults, kids) {
  if (kids > 0) return 'family';
  if (adults <= 1) return 'solo';
  if (adults === 2) return 'couple';
  return adults <= 5 ? 'friends' : 'group';
}

/**
 * The style with its "how you stay" half read from the app's choices. Called
 * whenever those choices move, so the active style follows every edit made
 * through the Lifestyle panel, the settings line or the planner.
 * Returns `style` itself when nothing moved.
 */
export function styleFromChoices(style, choices = {}) {
  const seats = clampInt(choices.group_size, 1, 20, 2);
  const kids = clampInt(choices.children, 0, 19, 0);
  const babies = clampInt(choices.babies, 0, 10, 0);
  const adults = Math.max(1, seats - kids);
  const base = normalizeStyle(style) || normalizeStyle({});
  // The kind stays the traveller's word ("friends" for three) while it still
  // fits the counts; a family with no children left is no longer a family.
  const kindFits = (k) => (k === 'family' ? kids > 0 : k === 'solo' ? adults === 1 && kids === 0 : kids === 0 || k === 'group');
  const kind = kindFits(base.who.kind) ? base.who.kind : kindOfCounts(adults, kids);
  const next = normalizeStyle({
    ...base,
    who: { ...base.who, kind, adults, kids, babies },
    stay: choices.stay_tier || base.stay,
    lifestyle: choices.lifestyle || base.lifestyle,
    way: choices.transport_mode || base.way,
  });
  return sameStay(next, base) && style && style.id === next.id ? style : next;
}

function sameStay(a, b) {
  return a.who.kind === b.who.kind && a.who.adults === b.who.adults && a.who.kids === b.who.kids
    && a.who.babies === b.who.babies && a.stay === b.stay && a.way === b.way
    && JSON.stringify(a.lifestyle) === JSON.stringify(b.lifestyle);
}

/** The app choices a style sets when it becomes active (merged by the caller). */
export function choicesFromStyle(style) {
  const s = normalizeStyle(style);
  if (!s) return {};
  return {
    group_size: s.who.adults + s.who.kids,
    children: s.who.kids,
    babies: s.who.babies,
    stay_tier: s.stay,
    lifestyle: { ...s.lifestyle },
    transport_mode: s.way,
  };
}

/** Whether the app's choices already say what this style says, so the
 *  header can tell "With the kids" from "With the kids, changed". */
export function choicesMatchStyle(style, choices = {}) {
  const want = choicesFromStyle(style);
  return Object.keys(want).every((k) => JSON.stringify(want[k]) === JSON.stringify(k === 'lifestyle' ? { ...DEFAULT_LIFESTYLE, ...(choices[k] || {}) } : choices[k]));
}

// ---- The store's moves (each returns a new store) ----

export function addStyle(store, style) {
  const st = normalizeStyles(store);
  if (st.list.length >= MAX_STYLES) return st;
  const s = normalizeStyle(style);
  return normalizeStyles({ list: [...st.list, s], active: s.id });
}

export function updateStyle(store, id, patch) {
  const st = normalizeStyles(store);
  return normalizeStyles({ ...st, list: st.list.map((s) => (s.id === id ? normalizeStyle({ ...s, ...patch, id }) : s)) });
}

export function removeStyle(store, id) {
  const st = normalizeStyles(store);
  const list = st.list.filter((s) => s.id !== id);
  return normalizeStyles({ list, active: st.active === id ? (list[0]?.id || '') : st.active });
}

export function duplicateStyle(store, id, copyName = '') {
  const st = normalizeStyles(store);
  const s = st.list.find((x) => x.id === id);
  if (!s || st.list.length >= MAX_STYLES) return st;
  const used = new Set(st.list.map((x) => x.tone));
  const tone = TONES.find((x) => !used.has(x)) || s.tone;
  return addStyle(st, { ...s, id: newId(), name: copyName, tone });
}

export function setActive(store, id) {
  const st = normalizeStyles(store);
  return st.list.some((s) => s.id === id) ? { ...st, active: id } : st;
}

export const activeStyle = (store) => {
  const st = normalizeStyles(store);
  return st.list.find((s) => s.id === st.active) || null;
};

// ---- The taste profile (lib/taste.js), one thing with the style ----

/**
 * The taste the active style stands for. Explore's "For you" (lib/match.js)
 * and the trip finder's taste nudge read the taste, so the style reaches
 * them through it: who comes, the likes, the kind of place, lively or quiet,
 * and no car when the traveller gets around by public transport or taxi.
 * The taste's own Lifestyle key and its yes/no verdicts are kept.
 */
export function tasteFromStyle(style, taste = {}) {
  const s = normalizeStyle(style);
  if (!s) return taste;
  return {
    ...(taste || {}),
    party: s.who.kind,
    likes: [...s.explore.likes],
    size: s.explore.size || null,
    quiet: s.explore.quiet || null,
    noCar: s.explore.around === 'public' || s.explore.around === 'taxi' ? true : null,
  };
}

/** The style's explore half after the taste was edited on its own (the
 *  first-run questions): the likes and the two place facets. */
export function exploreFromTaste(style, taste) {
  const s = normalizeStyle(style);
  if (!s || !taste) return s;
  return normalizeStyle({
    ...s,
    explore: {
      ...s.explore,
      likes: Array.isArray(taste.likes) ? taste.likes : s.explore.likes,
      size: taste.size || '',
      quiet: taste.quiet || '',
      around: taste.noCar === true && !['public', 'taxi'].includes(s.explore.around) ? 'public' : s.explore.around,
    },
  });
}

/** Whether the taste already says what the style says (no write needed). */
export function tasteMatchesStyle(style, taste) {
  const want = tasteFromStyle(style, taste);
  const k = (x) => JSON.stringify([x?.party ?? null, x?.likes || [], x?.size ?? null, x?.quiet ?? null, x?.noCar ?? null]);
  return k(want) === k(taste);
}

// ---- The trip planner's side ----

/** The planner questions a style answers, by the planner's question ids. */
export const STYLE_ANSWERS = ['who', 'sleep', 'priority', 'g:persona', 'g:shape', 'g:likes', 'g:avoid', 'g:around', 'r:mornings', 'r:pace'];

/**
 * A trip's settings seeded from a style: the party, what matters most, the
 * guide answers and the day rhythm, each marked as given by the style
 * (sources[id] = 'style'), so the planner passes over them as it passes over
 * what Tell Carta's sentence answered, and the trip settings sheet shows
 * where they came from. An answer the traveller gave on its own screen or in
 * words is never overwritten. `normalize` and `markAnswered` are
 * tripSettings.js's own (passed in, so this module stays free of the
 * planner and the planner free of a cycle).
 */
export function seedTripSettings(settings, style, { normalize, markAnswered }) {
  const st = normalizeStyle(style);
  if (!st) return settings;
  const mine = (id) => settings.answered.includes(id) && settings.sources?.[id] !== 'style';
  const e = st.explore;
  let s = { ...settings, style: st.id };
  if (!mine('who')) s.party = { ...s.party, ...st.who, kidAges: (s.party?.kidAges || []).slice(0, st.who.kids) };
  if (!mine('priority')) s.priority = st.priority;
  const guide = { ...s.guide };
  if (!mine('g:shape') && e.shapes.length) guide.shapes = e.shapes;
  if (!mine('g:persona') && e.personas.length) { guide.personas = e.personas; guide.personaMost = ''; guide.persona = e.personas[0]; }
  if (!mine('g:likes') && e.likes.length) guide.likes = e.likes;
  if (!mine('g:avoid') && e.avoid.length) guide.avoid = e.avoid;
  if (!mine('g:around') && e.around) guide.around = e.around;
  s.guide = guide;
  const rhythm = { ...s.rhythm };
  if (!mine('r:mornings') && st.days.mornings) rhythm.mornings = st.days.mornings;
  if (!mine('r:pace') && st.days.pace) rhythm.pace = st.days.pace;
  s.rhythm = rhythm;
  s = normalize(s);
  const given = {
    who: true,
    sleep: true,
    priority: true,
    'g:shape': e.shapes.length > 0,
    'g:persona': e.personas.length > 0,
    'g:likes': e.likes.length > 0,
    'g:avoid': e.avoid.length > 0,
    'g:around': Boolean(e.around),
    'r:mornings': Boolean(st.days.mornings),
    'r:pace': Boolean(st.days.pace),
  };
  for (const id of STYLE_ANSWERS) {
    if (given[id] && !mine(id)) s = markAnswered(s, id, 'style');
  }
  return s;
}

/** A trip's "how you explore" answers as a style patch, for "Keep these in
 *  my style" on the trip settings. */
export function explorePatchFromSettings(s, style = null) {
  const g = s.guide || {};
  return {
    priority: s.priority,
    explore: {
      // The taste facets have no trip question; the style keeps its own.
      size: style?.explore?.size || '',
      quiet: style?.explore?.quiet || '',
      shapes: (g.shapes || []).filter((x) => SHAPES.includes(x)),
      personas: g.personas || [],
      likes: g.likes || [],
      avoid: (g.avoid || []).filter((x) => AVOID.includes(x)),
      around: g.around || '',
    },
    days: { mornings: s.rhythm?.mornings || '', pace: s.rhythm?.pace || '' },
  };
}

/** The planner's own option words, so a style reads exactly as the
 *  questions it answers (planner/flow/questions.js). */
const SHAPE_KEYS = { one: 'pf.o.shapeOne', towns: 'pf.o.shapeTowns', road: 'pf.o.shapeRoad', countries: 'pf.o.shapeCountries' };
const AROUND_KEYS = { public: 'pf.o.transit', taxi: 'pf.o.taxi', car: 'pf.o.aroundCar', mix: 'pf.o.aroundMix' };

/**
 * The style's words, as i18n keys with their values, for a one-line summary
 * (the head count, the bed, the trip shape): the caller translates; this
 * keeps the choice of what to say in one tested place.
 */
export function summaryParts(style) {
  const s = normalizeStyle(style);
  if (!s) return [];
  const out = [{ party: { adults: s.who.adults, children: s.who.kids, babies: s.who.babies } }];
  out.push({ key: `stay.${s.stay}` });
  if (s.explore.shapes.length === 1) out.push({ key: SHAPE_KEYS[s.explore.shapes[0]] });
  else if (s.explore.around) out.push({ key: AROUND_KEYS[s.explore.around] });
  return out;
}
