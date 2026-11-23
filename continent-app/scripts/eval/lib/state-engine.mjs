/*
 * The E9 state-scope harness (G1, ROADMAP G4, logic wave 2). It replays the
 * persona journeys that touch state (reload, sign-in, link, new trip,
 * language) with the REAL pure functions the app runs, in the order App.jsx
 * runs them, with flag E9 forced to old and to new (lib/flags.js withFlags).
 * Each journey answers in a few scalars a test or a report can state.
 *
 * A fake `window` stands in for the browser so lib/urlState.js (which reads
 * location and localStorage directly) runs as it does in the app. Nothing here
 * touches the network or the real storage.
 */
import { withFlags } from '../../../src/lib/flags.js';
import {
  afterChoicesChange, activeStyle, choicesFromStyle, holdChoices, normalizeStyles, styleFromTemplate, TEMPLATES,
} from '../../../src/lib/travelStyles.js';
import { decodeState, encodeState, loadInitialState, persistState } from '../../../src/lib/urlState.js';
import { mergeAccountChoices } from '../../../src/lib/taste.js';
import { langToPull } from '../../../src/lib/langPath.js';
import * as ext from './state-engine-new.mjs';

/** Run `fn` with a fake window: { search, hash, pathname, local } in, and what it left in the address and storage out. */
export function withWindow({ search = '', hash = '', pathname = '/', local = {} } = {}, fn) {
  const was = globalThis.window;
  const store = new Map(Object.entries(local));
  const win = {
    location: { search, hash, pathname, get href() { return `https://carta.test${this.pathname}${this.search}${this.hash}`; } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
      get length() { return store.size; },
      key: (i) => [...store.keys()][i] ?? null,
    },
    history: {
      state: null,
      replaceState(_s, _t, url) {
        const u = new URL(url, 'https://carta.test');
        win.location.pathname = u.pathname; win.location.search = u.search; win.location.hash = u.hash;
      },
    },
  };
  globalThis.window = win;
  try {
    const result = fn(win);
    return { result, search: win.location.search, hash: win.location.hash, store };
  } finally { globalThis.window = was; }
}

const PRICED = /[?&](g|gc|gb|st|ls|t)=/;
/** The style a persona has: the template of its party kind (family, couple, friends, solo). */
const templateOf = (p) => (TEMPLATES[p?.taste?.party] ? p.taste.party : 'solo');

/** G-1: a held trip party, then a reload at "/" (the PWA start_url). Returns the style's adults after. */
function reloadHeld(which, p) {
  const solo = styleFromTemplate(templateOf(p));
  const store = normalizeStyles({ list: [solo], active: solo.id });
  let live = { ...choicesFromStyle(solo), travel_styles: store, style_held: false, taste: {} };
  live = holdChoices(live);
  live = afterChoicesChange({ ...live, group_size: solo.who.adults + 3, children: 0 });
  const mirror = encodeState({ choices: live });
  const { result: init } = withWindow({ search: '', local: { 'continent.state.v1': mirror } }, () => loadInitialState());
  let c = {
    group_size: init.group_size ?? 2, children: init.children ?? 0, babies: init.babies ?? 0,
    stay_tier: init.stay_tier ?? 'home', transport_mode: init.transport_mode ?? 'any',
    lifestyle: { ...init.lifestyle }, travel_styles: store, taste: {},
  };
  c = afterChoicesChange(c, { first: true, linked: PRICED.test('') });
  // useAppData's data load: what the address or mirror named is applied again.
  const re = which === 'new' ? ext.initForLoad(init, { prev: c, search: '' }) : init;
  c = {
    ...c,
    group_size: re.group_size ?? c.group_size,
    transport_mode: re.transport_mode ?? c.transport_mode,
    lifestyle: c.travel_styles?.active && !re.lifestyle ? c.lifestyle : { ...c.lifestyle, ...(re.lifestyle || {}) },
  };
  c = afterChoicesChange(c, {});
  const a = activeStyle(c.travel_styles);
  return { styleAdults: a.who.adults, styleKind: a.who.kind, held: Boolean(c.style_held) };
}

/** J-2: a signed-in reload whose address is this device's own query. Does the account pull run? */
function reloadOwnQuery(which) {
  const state = { activeTab: 'trip', choices: { group_size: 3, children: 0, babies: 0 }, departDate: '2027-03-06', returnDate: '2027-03-13' };
  const run = withWindow({ search: '', local: {} }, () => { persistState(state); return window.location.search; });
  const mirror = run.store.get('continent.state.v1');
  const search = run.search;
  const foreign = which === 'new' ? ext.isForeignLink(search, mirror) : Boolean(search);
  return { search, pullsAccount: !foreign };
}

/** J-2 again, but a real shared link from someone else on a device with its own mirror. */
function foreignLink(which) {
  const mirror = encodeState({ choices: { group_size: 3, children: 0, babies: 0 }, departDate: '2027-03-06', returnDate: '2027-03-13' });
  const search = '?tab=explore&cf=IT&tk=beach';
  const foreign = which === 'new' ? ext.isForeignLink(search, mirror) : Boolean(search);
  return { pullsAccount: !foreign };
}

/** G-19: a party edited signed out, then a sign-in whose account has the same style with another party. */
function signInEdited(which, p) {
  const mine = styleFromTemplate(templateOf(p));
  const theirs = { ...mine, who: { ...mine.who, adults: mine.who.adults + 2, kind: 'friends' } };
  const local = {
    ...choicesFromStyle(mine), group_size: mine.who.adults + 1, children: 0, travel_styles: normalizeStyles({ list: [mine], active: mine.id }), style_held: false, taste: {},
  };
  const account = { ...choicesFromStyle(theirs), group_size: theirs.who.adults, travel_styles: normalizeStyles({ list: [theirs], active: mine.id }), taste: {} };
  const out = which === 'new' ? ext.mergeAccountChoicesHeld(local, account) : mergeAccountChoices(local, account);
  return { groupSize: out.group_size, held: Boolean(out.style_held) };
}

/** G-7: a new trip while the style is held with a bed of its own. */
function newTripHeld(which, p) {
  const s = styleFromTemplate(templateOf(p));
  let c = { ...choicesFromStyle(s), travel_styles: normalizeStyles({ list: [s], active: s.id }), style_held: false, taste: {} };
  c = holdChoices({ ...c, stay_tier: 'hotel4' });
  const after = which === 'new' ? ext.newTripChoices(c) : c;
  return { stayTier: after.stay_tier, held: Boolean(after.style_held), styleStay: choicesFromStyle(s).stay_tier };
}

/** G-16 and J-13: the address names Dutch, the account says English; what is pushed back. */
function langPush(which) {
  const lang = 'nl';
  const pulled = langToPull('en', [{ code: 'en' }, { code: 'nl' }], 'nl');
  const pushed = which === 'new' ? ext.langToPush({ lang, picked: false, accountLang: 'en' }) : lang;
  return { pulled, pushed };
}

/** E-3: an old link with filters no chip shows. What narrows Explore. */
function legacyLink(which) {
  const d = withFlags({ E9: which }, () => decodeState('?rr=68.100&tb=1&big=1&top=price.5&gem=1'));
  return { narrowing: ['ratingRange', 'topBeachOnly', 'bigOnly', 'topPick'].filter((k) => d[k] !== undefined), gemOnly: Boolean(d.gemOnly) };
}

/** An old link that carries person keys, opened on a device with its own shortlist. */
function oldPersonLink(which) {
  const mine = encodeState({ favorites: new Set(['gem:mine']), choices: { group_size: 1 } });
  const search = '?fav=gem:theirs&dh=52.3702,4.8952,Amsterdam&g=4&tab=explore';
  const run = withWindow({ search, local: { 'continent.state.v1': mine } }, () => withFlags({ E9: which }, () => {
    const init = loadInitialState();
    persistState({ activeTab: 'explore', favorites: new Set(init.favorites || []), choices: { group_size: init.group_size ?? 1, drive_home: init.drive_home } });
    return init;
  }));
  const q = new URLSearchParams(run.search);
  return { shortlist: [...(run.result.favorites || [])].join('|'), homePoint: Boolean(run.result.drive_home), favInAddress: q.has('fav'), dhInAddress: q.has('dh') };
}

export const JOURNEYS = {
  reloadHeld, reloadOwnQuery, foreignLink, signInEdited, newTripHeld, langPush, legacyLink, oldPersonLink,
};

/** Every journey's observation, with flag E9 forced to `which` ('old' or 'new'). */
export function replayJourneys(which, persona = null) {
  return withFlags({ E9: which }, () => Object.fromEntries(Object.entries(JOURNEYS).map(([name, fn]) => [name, fn(which, persona)])));
}
