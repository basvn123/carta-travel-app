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
/** The ways there a style can pick several of (G12 Style Studio): WAYS
 *  without 'any', which is "none picked". */
export const WAY_MODES = ['plane', 'train', 'bus', 'car'];
/** The steps of the Style Studio wizard, in order (decision.md View 2). */
export const STUDIO_STEPS = ['name', 'spend', 'way', 'priority', 'shapes', 'likes', 'avoid', 'place', 'around', 'days'];
export const STUDIO_VIEWS = ['overview', 'create', 'edit'];

/**
 * What a traveller would give up to save money, by what matters most (G12).
 * `early` a flight before 07:00, `stops` one change of planes, `hostel` a
 * hostel private room. Picking a priority resets the three to its row; each
 * can then be flipped. Read by the trip settings (flight prefs, ranking and
 * the planner's stay options), never by Explore's prices.
 */
export const TRADEOFF_DEFAULTS = Object.freeze({
  price: Object.freeze({ early: true, stops: true, hostel: true }),
  balance: Object.freeze({ early: false, stops: true, hostel: false }),
  comfort: Object.freeze({ early: false, stops: false, hostel: false }),
});
const TRADEOFF_KEYS = ['early', 'stops', 'hostel'];

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
 * The bed and the table are the studio's spend step's own tiers and presets,
 * so a template never prices anything that step could not. The personas are
 * not set here: they follow from the rest (derivePersonas), as on every save.
 */
export const TEMPLATES = {
  solo: {
    nameKey: 'styles.t.solo', tone: 'sun',
    who: { kind: 'solo', adults: 1, kids: 0, babies: 0, slowWalkers: false },
    stay: 'private', table: 'Backpacker', way: 'any', priority: 'price',
    explore: { shapes: ['towns'], likes: [], avoid: [], around: '', size: 'city', quiet: 'lively' },
    days: { mornings: 'early', pace: 'packed' },
  },
  couple: {
    nameKey: 'styles.t.couple', tone: 'umber',
    who: { kind: 'couple', adults: 2, kids: 0, babies: 0, slowWalkers: false },
    stay: 'hotel3', table: 'Foodie', way: 'any', priority: 'balance',
    explore: { shapes: ['towns'], likes: [], avoid: ['crowds'], around: '', size: 'town', quiet: 'quiet' },
    days: { mornings: 'slow', pace: 'balanced' },
  },
  friends: {
    nameKey: 'styles.t.friends', tone: 'lagoon',
    who: { kind: 'friends', adults: 4, kids: 0, babies: 0, slowWalkers: false },
    stay: 'home', table: 'Nightlife', way: 'any', priority: 'price',
    explore: { shapes: ['one', 'towns'], likes: [], avoid: [], around: 'mix', size: 'mix', quiet: 'lively' },
    days: { mornings: 'slow', pace: 'balanced' },
  },
  family: {
    nameKey: 'styles.t.family', tone: 'sea',
    who: { kind: 'family', adults: 2, kids: 2, babies: 0, slowWalkers: false },
    stay: 'home', table: 'Family', way: 'any', priority: 'balance',
    // Getting around is "a mix", not a car: 'car' prices a hire for every
    // trip the finder builds, a choice the traveller makes, not a template.
    explore: { shapes: ['one'], likes: [], avoid: ['transfers', 'heat'], around: 'mix', size: 'mix', quiet: 'quiet' },
    days: { mornings: 'onthego', pace: 'slow' },
  },
  group: {
    nameKey: 'styles.t.group', tone: 'mist',
    who: { kind: 'group', adults: 6, kids: 0, babies: 0, slowWalkers: false },
    stay: 'home', table: 'Easygoing', way: 'any', priority: 'price',
    explore: { shapes: ['one'], likes: [], avoid: ['transfers'], around: '' },
    days: { mornings: 'onthego', pace: 'balanced' },
  },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES);
// G-20: a template never answers "how do you get around": that would mark the
// traveller "no car" (noCar from around: public) without asking. Only the
// traveller's own pick sets it; the family and friends templates say "a mix".


const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const someOf = (v, list, max = 99) => (Array.isArray(v) ? [...new Set(v.filter((x) => list.includes(x)))].slice(0, max) : []);

/** The lifestyle counts made safe (the same keys the studio's spend step keeps). */
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

/**
 * The ways there and the main one, kept in step. A style made before G12
 * has only `way`, so it becomes its one way (or none for 'any'). The main
 * way is always one of the ways: Explore's settings line can move
 * choices.transport_mode to a mode the traveller never ticked, and the
 * active style follows the choices (rule 1), so that mode joins the list
 * rather than being rewritten, which would leave the choices and the style
 * apart for good. 'any' is "Explore picks", so it clears the list.
 */
function waysOf(raw, way) {
  if (way === 'any') return [];
  const ways = Array.isArray(raw.ways) ? someOf(raw.ways, WAY_MODES) : [];
  return ways.includes(way) ? ways : [...ways, way];
}

/** The three trade-offs made safe; a style made before G12 takes its
 *  priority's defaults. */
function tradeoffsOf(raw, priority) {
  const base = TRADEOFF_DEFAULTS[priority];
  const t = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(TRADEOFF_KEYS.map((k) => [k, typeof t[k] === 'boolean' ? t[k] : base[k]]));
}

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
  const way = oneOf(raw.way, WAYS, 'any');
  const priority = oneOf(raw.priority, PRIORITIES, 'balance');
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
    way,
    ways: waysOf(raw, way),
    priority,
    tradeoffs: tradeoffsOf(raw.tradeoffs, priority),
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

/**
 * The personas a style stands for, worked out from its other answers (G12:
 * the wizard no longer asks "which of these travellers are you?"). The trip
 * finder still ranks by persona (config recommend.json persona), so the
 * style keeps feeding it. The likes come first, in the traveller's own
 * order, as they are the most direct answer; then the kind of place and
 * its feel; then the pace. At most three; 'mix' (no lean) when nothing points anywhere.
 */
export function derivePersonas(explore = {}, days = {}) {
  const e = explore || {};
  const likes = Array.isArray(e.likes) ? e.likes : [];
  const shapes = Array.isArray(e.shapes) ? e.shapes : [];
  const out = [];
  const add = (p) => { if (PERSONAS.includes(p) && !out.includes(p)) out.push(p); };
  const BY_LIKE = { beach: 'coast', islands: 'coast', hiking: 'nature', lakes: 'nature', nightlife: 'lively', hidden: 'hidden', city: 'cities' };
  for (const l of likes) add(BY_LIKE[l]);
  const oneBase = shapes.length > 0 && shapes.every((x) => x === 'one');
  if (e.size === 'city') {
    // A city lover who stays put is the city-base-with-day-trips traveller;
    // a quiet one sleeps outside the city and visits it.
    add(e.quiet === 'quiet' ? 'outside' : oneBase ? 'hubtrips' : 'cities');
  }
  if (e.size === 'town' || e.size === 'village') add('towns');
  if (e.quiet === 'lively') add('lively');
  if (oneBase && days?.pace === 'slow') add('slow');
  return out.length ? out.slice(0, 3) : ['mix'];
}

/** The template's starting answers as a style, before an id or a name. */
function templateFields(t) {
  return {
    who: t.who,
    stay: t.stay,
    lifestyle: { ...(PROFILES[t.table] || DEFAULT_LIFESTYLE), cadence: 'week', coffees_per_day: (PROFILES[t.table] || DEFAULT_LIFESTYLE).coffees_per_day },
    way: t.way,
    priority: t.priority,
    explore: { ...t.explore, personas: derivePersonas(t.explore, t.days) },
    days: t.days,
  };
}

/** A new style from a template (or from the choices as they stand when the
 *  id is unknown). `choices` fills what a template does not decide. */
export function styleFromTemplate(templateId, choices = {}) {
  const t = TEMPLATES[templateId];
  if (!t) return styleFromChoices({ tone: 'umber' }, choices);
  return normalizeStyle({ id: newId(), nameKey: t.nameKey, template: templateId, tone: t.tone, ...templateFields(t) });
}

/**
 * A wizard draft (decision.md View 2): a whole style with no id yet, so the
 * wizard can hold it in its own state and nothing reaches the store until
 * Save or Done. `draftFromTemplate(kind)` is what picking "Who's coming?"
 * loads; `emptyDraft()` is the wizard before that pick, priced as the app
 * prices with no style (two adults, a mid-range home, the default table).
 */
export function draftFromTemplate(kind) {
  const t = TEMPLATES[kind];
  if (!t) return emptyDraft();
  return { ...normalizeStyle({ nameKey: t.nameKey, template: kind, tone: t.tone, ...templateFields(t) }), id: '' };
}

export function emptyDraft() {
  return { ...normalizeStyle({}), id: '' };
}

/** "What matters most?" picked in the wizard: the priority, and the three
 *  trade-offs back to its defaults (each can be flipped after). */
export function draftWithPriority(draft, priority) {
  const p = PRIORITIES.includes(priority) ? priority : 'balance';
  return { ...draft, priority: p, tradeoffs: { ...TRADEOFF_DEFAULTS[p] } };
}

/**
 * A draft made into a style to store: checked like any style, the personas
 * worked out again (the traveller may have changed the likes or the place),
 * and the main way taken from the ways when the draft left it at 'any' or
 * at a way it no longer ticks (the first picked is the main one). Keeps the
 * draft's id when it has one; otherwise a new one.
 */
export function styleFromDraft(draft) {
  const d = draft && typeof draft === 'object' ? draft : {};
  const ways = Array.isArray(d.ways) ? d.ways.filter((x) => WAY_MODES.includes(x)) : null;
  const way = ways && ways.length ? (ways.includes(d.way) ? d.way : ways[0]) : (ways ? 'any' : d.way);
  const s = normalizeStyle({ ...d, id: d.id || newId(), way, ways: ways || d.ways });
  return { ...s, explore: { ...s.explore, personas: derivePersonas(s.explore, s.days) } };
}

/** The ways there a style ticked, the main one among them (Explore's
 *  settings line cycles through these when there are two or more). */
export function styleWays(style) {
  const s = normalizeStyle(style);
  return s ? [...s.ways] : [];
}

/** The party kind the head counts read as, for a style made from choices. */
export function kindOfCounts(adults, kids, babies = 0) {
  if (kids > 0 || babies > 0) return 'family';
  if (adults <= 1) return 'solo';
  if (adults === 2) return 'couple';
  return adults <= 5 ? 'friends' : 'group';
}

/** Whether a kind of party still fits the counts (G-10): a family needs a child
 *  or a baby, solo is one adult, a couple is two adults, a group has no children. */
export function kindFits(kind, { adults = 1, kids = 0, babies = 0 } = {}) {
  const young = kids + babies;
  if (kind === 'family') return young > 0;
  if (kind === 'solo') return adults === 1 && young === 0;
  if (kind === 'couple') return adults === 2 && young === 0;
  return young === 0 || kind === 'group';
}

/**
 * The style with its "how you stay" half read from the app's choices. Called
 * whenever those choices move, so the active style follows every edit made
 * through the settings line or the planner (the Style Studio saves the
 * style itself).
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
  const young = kids + babies;
  const kind = kindFits(base.who.kind, { adults, kids, babies }) ? base.who.kind : kindOfCounts(adults, kids, babies);
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

/** Without style `id`. Deleting the style in use hands "in use" to the
 *  next card (the one before it when it was the last), not to the top one,
 *  so the choice moves the shortest way on the overview. */
export function removeStyle(store, id) {
  const st = normalizeStyles(store);
  const at = st.list.findIndex((s) => s.id === id);
  const list = st.list.filter((s) => s.id !== id);
  const next = list[Math.min(Math.max(at, 0), list.length - 1)]?.id || '';
  return normalizeStyles({ list, active: st.active === id ? next : st.active });
}

/**
 * The priced choices a traveller with no style has: what a first visit
 * prices and what the studio's empty state says ("two people sharing an
 * entire place"). The Lifestyle key goes, so the catalogue's own default
 * table applies, as on a first visit.
 */
export const NO_STYLE_CHOICES = Object.freeze({ group_size: 2, children: 0, babies: 0, stay_tier: 'home', transport_mode: 'any' });

/**
 * Delete in the studio. The style in use going hands the prices to the
 * next one (its stay half applied, the hold lifted); the last one going
 * sets the prices back to NO_STYLE_CHOICES, so the empty state's sentence
 * is true (flow-2 M1) instead of the deleted style pricing on unseen.
 */
export function removeChoices(prev, id) {
  const before = normalizeStyles(prev.travel_styles);
  if (!before.list.some((s) => s.id === id)) return prev;
  const st = removeStyle(before, id);
  if (!st.list.length) {
    const rest = { ...prev };
    delete rest.lifestyle;
    return { ...rest, ...NO_STYLE_CHOICES, travel_styles: st, style_held: false };
  }
  if (before.active !== id) return { ...prev, travel_styles: st };
  const next = activeStyle(st);
  return next ? { ...prev, ...choicesFromStyle(next), travel_styles: st, style_held: false } : { ...prev, travel_styles: st };
}

/**
 * A copy of a style, right after the original. The style in use stays in
 * use: a copy that became active would leave the prices on the old style and
 * show a false "changed" hold (flow-2 B1). `copyName` is the caller's
 * translated "{name}, copy"; a second copy of the same name gets " 2", then
 * " 3", so the cards can be told apart.
 */
export function duplicateStyle(store, id, copyName = '') {
  const st = normalizeStyles(store);
  const at = st.list.findIndex((x) => x.id === id);
  if (at < 0 || st.list.length >= MAX_STYLES) return st;
  const s = st.list[at];
  const used = new Set(st.list.map((x) => x.tone));
  const tone = TONES.find((x) => !used.has(x)) || s.tone;
  const copy = normalizeStyle({ ...s, id: newId(), name: uniqueName(st.list, copyName), tone });
  const list = [...st.list.slice(0, at + 1), copy, ...st.list.slice(at + 1)];
  return normalizeStyles({ list, active: st.active });
}

/** `name`, or `name 2`, `name 3` when taken, within the 40 characters. */
function uniqueName(list, name) {
  const base = String(name || '').trim().slice(0, 40);
  if (!base) return '';
  const taken = new Set(list.map((x) => x.name.toLocaleLowerCase()));
  if (!taken.has(base.toLocaleLowerCase())) return base;
  for (let n = 2; n <= MAX_STYLES + 1; n++) {
    const tail = ` ${n}`;
    const next = base.slice(0, 40 - tail.length).trimEnd() + tail;
    if (!taken.has(next.toLocaleLowerCase())) return next;
  }
  return base;
}

export function setActive(store, id) {
  const st = normalizeStyles(store);
  return st.list.some((s) => s.id === id) ? { ...st, active: id } : st;
}

export const activeStyle = (store) => {
  const st = normalizeStyles(store);
  return st.list.find((s) => s.id === st.active) || null;
};

/**
 * Where the Style Studio opens, from what a door asked for (decision.md
 * "Doors"): null (closed) or { view, id, step }. `true` is the overview.
 * The old sheet's 'stay' and 'explore' halves become the active style's
 * first step of each half, so a door not yet moved still lands right.
 * An edit needs a style that exists: no id means the active one, and with
 * none at all it becomes a new style at the first step; with styles but
 * none in use, the overview lets the traveller pick.
 */
export function studioOpen(v, store) {
  if (!v) return null;
  const st = normalizeStyles(store);
  let want = v;
  if (v === true) want = { view: 'overview' };
  else if (v === 'stay') want = { view: 'edit', step: 'name' };
  else if (v === 'explore') want = { view: 'edit', step: 'shapes' };
  else if (typeof v !== 'object') return null;
  const view = oneOf(want.view, STUDIO_VIEWS, 'overview');
  const step = oneOf(want.step, STUDIO_STEPS, 'name');
  if (view === 'overview') return { view, id: '', step: 'name' };
  if (view === 'create') return { view, id: '', step };
  const id = st.list.some((s) => s.id === want.id) ? want.id : st.active;
  if (id) return { view, id, step };
  return st.list.length ? { view: 'overview', id: '', step: 'name' } : { view: 'create', id: '', step: 'name' };
}

// ---- The choices and the active style (hooks/useTravelStyles.js) ----
//
// Pure steps over the whole `choices` object, so the rules are tested here
// and the hook only wires them to React. `style_held` marks choices that
// differ from the active style on purpose (a change made for one trip, a
// link): the style is not rewritten from them.

/** Rule 1: the choices moved. `first` is the load, `linked` whether the
 *  address named priced keys. Returns `prev` itself when nothing changes. */
export function afterChoicesChange(prev, { first = false, linked = false } = {}) {
  const st = normalizeStyles(prev.travel_styles);
  const a = activeStyle(st);
  if (!a) return prev;
  const same = choicesMatchStyle(a, prev);
  if (prev.style_held) {
    // A hold ends by itself once the choices are the style's again (the
    // trip's party set back), so no hold lingers unseen.
    return same ? { ...prev, style_held: false } : prev;
  }
  if (same) return prev;
  // The load: an address with no priced keys brought only defaults, so the
  // style sets them; one with them (a link, this device's reload) is kept
  // and holds the style.
  if (first) return linked ? { ...prev, style_held: true } : { ...prev, ...choicesFromStyle(a) };
  const next = styleFromChoices(a, prev);
  return next === a ? prev : { ...prev, travel_styles: updateStyle(st, a.id, next) };
}

/** A change made for one trip is coming: hold the style (no-op without one). */
export function holdChoices(prev) {
  return prev.style_held || !activeStyle(normalizeStyles(prev.travel_styles)) ? prev : { ...prev, style_held: true };
}

/** Keep: the held choices written into the active style, the hold lifted. */
export function keepChoices(prev) {
  const st = normalizeStyles(prev.travel_styles);
  const a = activeStyle(st);
  if (!a) return { ...prev, style_held: false };
  return { ...prev, travel_styles: updateStyle(st, a.id, styleFromChoices(a, prev)), style_held: false };
}

/** The Style Studio's Done on a new style: `style` (styleFromDraft) added
 *  and made active, its stay half priced, the hold lifted. At MAX_STYLES
 *  nothing is added and `prev` comes back. */
export function createChoices(prev, style) {
  const st = addStyle(normalizeStyles(prev.travel_styles), style);
  const made = st.active === style.id ? st.list.find((x) => x.id === style.id) : null;
  return made ? { ...prev, ...choicesFromStyle(made), travel_styles: st, style_held: false } : prev;
}

/**
 * The Style Studio's Save on a style that exists. The active style, not
 * held, prices the app again at once (its bed or party may have changed).
 * A held one is only stored: the choices are a trip's on purpose, and the
 * hold's own Keep or Undo decides what happens to them.
 */
export function commitChoices(prev, id, style) {
  const before = normalizeStyles(prev.travel_styles);
  if (!before.list.some((s) => s.id === id)) return prev;
  const st = updateStyle(before, id, { ...style, id });
  const s = st.list.find((x) => x.id === id);
  if (st.active !== id || prev.style_held) return { ...prev, travel_styles: st };
  return { ...prev, ...choicesFromStyle(s), travel_styles: st };
}

/**
 * The sign-in merge of the styles when a shared link drives the view (the
 * account pull is skipped, but the traveller's styles still merge). Returns the
 * part of `choices` to change. Old: the active style stays this device's,
 * '' on a fresh one, and the next push writes that '' to the account (G-2).
 * E9: a device with no active style adopts the account's, held, so the link's
 * party and bed are not written into it; one that has an active style keeps it.
 */
export function mergeStylesForLink(prev, incoming, { e9 = false } = {}) {
  if (!incoming) return {};
  const merged = mergeStyles(prev.travel_styles, incoming);
  const adopt = e9 && !prev.travel_styles?.active && Boolean(merged.active);
  return {
    travel_styles: { ...merged, active: adopt ? merged.active : (prev.travel_styles?.active ?? '') },
    ...(adopt ? { style_held: true } : {}),
  };
}

/**
 * E9 (G-7): a new trip lifts a hold. The style the traveller holds for trip A
 * (a 4-star bed, a longer party) must not price trip B, whose settings the
 * style seeds: back to the active style's own values. Not held: `prev` itself.
 */
export function newTripChoices(prev) {
  const a = activeStyle(normalizeStyles(prev.travel_styles));
  return prev.style_held && a ? switchChoices(prev, a.id) : prev;
}

/** Switch (and Back): the style's stay half priced, the hold lifted. */
export function switchChoices(prev, id) {
  const st = setActive(normalizeStyles(prev.travel_styles), id);
  const s = st.list.find((x) => x.id === id);
  return s ? { ...prev, ...choicesFromStyle(s), travel_styles: st, style_held: false } : prev;
}

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

/**
 * The account's styles merged with this device's (review finding 4): the
 * lists are joined by id (the account's copy wins for an id both hold, up to
 * MAX_STYLES), and the account's active style stays active when it has one.
 */
export function mergeStyles(local, incoming) {
  const a = normalizeStyles(local);
  if (!incoming || !Array.isArray(incoming.list)) return a;
  const b = normalizeStyles(incoming);
  const byId = new Map(a.list.map((s) => [s.id, s]));
  for (const s of b.list) byId.set(s.id, s);
  const list = [...b.list, ...a.list.filter((s) => !b.list.some((x) => x.id === s.id))].map((s) => byId.get(s.id));
  return normalizeStyles({ list, active: b.active || a.active });
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
  // The trade-offs belong with what matters most: a trip whose priority
  // the traveller answered on its own screen falls back to that
  // priority's defaults (tripSettings tradeoffsOf), not the style's.
  if (!mine('priority')) { s.priority = st.priority; s.tradeoffs = { ...st.tradeoffs }; }
  const guide = { ...s.guide };
  if (!mine('g:shape') && e.shapes.length) guide.shapes = e.shapes;
  if (!mine('g:persona') && e.personas.length) { guide.personas = e.personas; guide.personaMost = ''; guide.persona = e.personas[0]; }
  if (!mine('g:likes') && e.likes.length) guide.likes = e.likes;
  if (!mine('g:avoid') && e.avoid.length) guide.avoid = e.avoid;
  // The place facets have no planner question; they feed the trip's own
  // personas when the traveller later changes a shape, a like or the pace.
  guide.size = e.size;
  guide.quiet = e.quiet;
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
