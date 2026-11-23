// E9 phase A (ROADMAP C9, I5, I12, G12, G4; logic wave 2): the state-scope races as replays.
// Written first, as a characterisation of today (flag E9 old); the target cases are
// { todo: true } until the commit that makes them pass turns them into plain tests.
// The replays run the real pure functions in the order App.jsx runs them
// (scripts/eval/lib/state-engine.mjs). Run: node --test tests/stateScope.test.mjs (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { replayJourneys, withWindow } from '../scripts/eval/lib/state-engine.mjs';
import { withFlags } from '../src/lib/flags.js';
import { decodeState, encodeState, initForLoad, isForeignLink, persistState } from '../src/lib/urlState.js';
import { mergeAccountChoices } from '../src/lib/taste.js';
import { choicesFromStyle, mergeStylesForLink, newTripChoices, normalizeStyles, styleFromTemplate } from '../src/lib/travelStyles.js';
import { langToPush } from '../src/lib/langPath.js';
import { announceThingsChanged, THINGS_CHANGED } from '../src/lib/thingsChanged.js';

const old = replayJourneys('old');
const now = () => replayJourneys('new');

test('E9 old, G-1: a held trip party is written into the style on a bare-root reload (today)', () => {
  assert.equal(old.reloadHeld.styleAdults, 4);
  assert.equal(old.reloadHeld.styleKind, 'friends');
});
test('E9 new, G-1: the load order keeps On my own as 1 adult', () => {
  const j = now().reloadHeld;
  assert.equal(j.styleAdults, 1);
  assert.equal(j.styleKind, 'solo');
});

test('E9 old, J-2: any query, the device\'s own included, skips the account pull (today)', () => {
  assert.equal(old.reloadOwnQuery.pullsAccount, false);
  assert.equal(old.foreignLink.pullsAccount, false);
});
test('E9 new, J-2/G-2/G-3: a reload with the device\'s own query pulls the account; a shared link does not', () => {
  const j = now();
  assert.equal(j.reloadOwnQuery.pullsAccount, true);
  assert.equal(j.foreignLink.pullsAccount, false);
});

test('E9 old, G-19: a sign-in replaces a party edited signed out, without a hold (today)', () => {
  assert.equal(old.signInEdited.groupSize, 3);
  assert.equal(old.signInEdited.held, false);
});
test('E9 new, G-19: a sign-in holds the device\'s party instead of overwriting it', () => {
  const j = now().signInEdited;
  assert.equal(j.groupSize, 2);
  assert.equal(j.held, true);
});

test('E9 old, G-7: a new trip keeps the held bed (today)', () => {
  assert.equal(old.newTripHeld.stayTier, 'hotel4');
  assert.equal(old.newTripHeld.held, true);
});
test('E9 new, G-7: a new trip lifts the hold, so the bed is the style\'s', () => {
  const j = now().newTripHeld;
  assert.equal(j.stayTier, j.styleStay);
  assert.equal(j.held, false);
});

test('E9 old, G-16/J-13: the address language is pushed to the account (today)', () => {
  assert.equal(old.langPush.pulled, null);
  assert.equal(old.langPush.pushed, 'nl');
});
test('E9 new, G-16/J-13: the language pushes only from the picker', () => {
  assert.equal(now().langPush.pushed, 'en');
});

test('E9 old, E-3/V-6: old links narrow Explore with filters that have no chip (today)', () => {
  assert.deepEqual(old.legacyLink.narrowing, ['ratingRange', 'topBeachOnly', 'bigOnly', 'topPick']);
});
test('E9 new, E-3/V-6: hidden legacy keys never narrow Explore', () => {
  const j = now().legacyLink;
  assert.deepEqual(j.narrowing, []);
  assert.equal(j.gemOnly, true);
});

test('E9 old, old links: the shortlist stays the device\'s and a link\'s home point is never read (wave 0a)', () => {
  assert.equal(old.oldPersonLink.shortlist, 'dest:gem:mine');
  assert.equal(old.oldPersonLink.homePoint, false);
});
test('E9 new, old links: person keys leave the address once read', () => {
  const j = now().oldPersonLink;
  assert.equal(j.shortlist, 'dest:gem:mine');
  assert.equal(j.favInAddress, false);
  assert.equal(j.dhInAddress, false);
});

/* ---- the pieces, one by one ---- */

test('isForeignLink: the device\'s own query, a bare place and a hand-off seed are not someone else\'s', () => {
  const mirror = encodeState({ choices: { group_size: 3 }, departDate: '2027-03-06', returnDate: '2027-03-13' });
  assert.equal(isForeignLink('', mirror), false);
  assert.equal(isForeignLink(`?${mirror}`, mirror), false);
  assert.equal(isForeignLink('?tab=explore', mirror), false);
  assert.equal(isForeignLink('?tab=plan&cc=BE', ''), false);
  assert.equal(isForeignLink('?tab=plan&mode=trip&dest=BRU', mirror), false);
});
test('isForeignLink: a setting the mirror does not hold is a shared link', () => {
  const mirror = encodeState({ choices: { group_size: 3 } });
  assert.equal(isForeignLink('?g=4&t=car', mirror), true);
  assert.equal(isForeignLink('?cf=IT', ''), true);
  assert.equal(isForeignLink('?fav=gem:annecy', mirror), true);
});

test('initForLoad keeps init whole with flag old, with no style, or when the address named priced keys', () => {
  const init = { group_size: 4, transport_mode: 'car', lifestyle: { dinners_per_week: 2 }, origin: 'BRU' };
  const styled = { travel_styles: normalizeStyles({ list: [styleFromTemplate('solo')], active: styleFromTemplate('solo').id }) };
  withFlags({ E9: 'old' }, () => assert.equal(initForLoad(init, { prev: styled, search: '' }), init));
  withFlags({ E9: 'new' }, () => {
    assert.equal(initForLoad(init, { prev: { travel_styles: normalizeStyles(null) }, search: '' }), init);
    assert.equal(initForLoad(init, { prev: styled, search: '?g=4' }), init);
    assert.deepEqual(initForLoad(init, { prev: styled, search: '?tab=explore' }), { origin: 'BRU' });
  });
});

test('G-19: a device with no style of its own takes the account\'s whole, held or not', () => {
  const theirs = styleFromTemplate('family');
  const local = { group_size: 2, children: 0, travel_styles: normalizeStyles(null), taste: {} };
  const account = { ...choicesFromStyle(theirs), travel_styles: normalizeStyles({ list: [theirs], active: theirs.id }), taste: {} };
  const out = mergeAccountChoices(local, account, { hold: true });
  assert.equal(out.style_held, false);
  assert.equal(out.children, choicesFromStyle(theirs).children);
});

test('G-2: a link-driven sign-in adopts the account\'s active style held on a fresh device, keeps a device\'s own otherwise', () => {
  const fam = styleFromTemplate('family');
  const incoming = normalizeStyles({ list: [fam], active: fam.id });
  const fresh = { travel_styles: normalizeStyles(null) };
  assert.equal(mergeStylesForLink(fresh, incoming, { e9: false }).travel_styles.active, '');
  const adopted = mergeStylesForLink(fresh, incoming, { e9: true });
  assert.equal(adopted.travel_styles.active, fam.id);
  assert.equal(adopted.style_held, true);
  const solo = styleFromTemplate('solo');
  const mine = { travel_styles: normalizeStyles({ list: [solo], active: solo.id }) };
  assert.equal(mergeStylesForLink(mine, incoming, { e9: true }).travel_styles.active, solo.id);
  assert.deepEqual(mergeStylesForLink(mine, null, { e9: true }), {});
});

test('G-7: newTripChoices is a no-op unless held, and lifts a hold to the style\'s own values', () => {
  const s = styleFromTemplate('solo');
  const base = { ...choicesFromStyle(s), travel_styles: normalizeStyles({ list: [s], active: s.id }), style_held: false };
  assert.equal(newTripChoices(base), base);
  const held = { ...base, style_held: true, stay_tier: 'hotel5', group_size: 5 };
  const lifted = newTripChoices(held);
  assert.equal(lifted.style_held, false);
  assert.equal(lifted.group_size, choicesFromStyle(s).group_size);
});

test('G-16, J-13: langToPush is the language on screen with flag old, and the account\'s own until the picker is used', () => {
  assert.equal(langToPush({ lang: 'nl', picked: false, accountLang: 'en', e9: false }), 'nl');
  assert.equal(langToPush({ lang: 'nl', picked: false, accountLang: 'en', e9: true }), 'en');
  assert.equal(langToPush({ lang: 'nl', picked: false, accountLang: null, e9: true }), undefined);
  assert.equal(langToPush({ lang: 'nl', picked: true, accountLang: 'en', e9: true }), 'nl');
});

test('J-11: a store write announces carta:things-changed', () => {
  const seen = [];
  const was = globalThis.window;
  globalThis.window = { dispatchEvent: (e) => { seen.push(e.type); return true; } };
  try { announceThingsChanged(); } finally { globalThis.window = was; }
  assert.deepEqual(seen, [THINGS_CHANGED]);
  assert.equal(THINGS_CHANGED, 'carta:things-changed');
});

test('J-17: persistState leaves a ?pm= preview standing and still clears the retired pr', () => {
  const run = withWindow({ search: '?pm=on&pr=3&g=2' }, () => persistState({ activeTab: 'explore', choices: { group_size: 2 } }));
  const q = new URLSearchParams(run.search);
  assert.equal(q.get('pm'), 'on');
  assert.equal(q.has('pr'), false);
});

test('E9: persistState writes the shortlist, home point and taste to the mirror only', () => {
  const state = { activeTab: 'explore', favorites: new Set(['dest:BRU']), choices: { group_size: 2, drive_home: { lat: 50.8467, lon: 4.3525, name: 'Brussels' }, taste: { likes: ['hiking'] } } };
  const keys = (which) => withFlags({ E9: which }, () => {
    const run = withWindow({ search: '' }, () => persistState(state));
    return { address: [...new URLSearchParams(run.search).keys()], mirror: [...new URLSearchParams(run.store.get('continent.state.v1')).keys()] };
  });
  const old = keys('old');
  assert.ok(['fav', 'dh', 'ty'].every((k) => old.address.includes(k)));
  const now = keys('new');
  assert.ok(['fav', 'dh', 'ty'].every((k) => !now.address.includes(k) && now.mirror.includes(k)));
  assert.ok(now.address.includes('g') || now.mirror.includes('g'));
});

test('G-4: a home point read from an address or mirror is rounded to 0.01 degree, flag or not', () => {
  for (const which of ['old', 'new']) {
    const d = withFlags({ E9: which }, () => decodeState('?dh=50.84673,4.35251,Brussels'));
    assert.deepEqual(d.drive_home, { lat: 50.85, lon: 4.35, name: 'Brussels' });
  }
});

test('E-3: with flag old the legacy keys still decode; the other filters decode either way', () => {
  const link = '?rr=68.100&mt=2&tb=1&big=1&top=price.5&gem=1&un=1';
  const o = withFlags({ E9: 'old' }, () => decodeState(link));
  assert.ok(o.ratingRange && o.topBeachOnly && o.bigOnly && o.topPick);
  const n = withFlags({ E9: 'new' }, () => decodeState(link));
  assert.equal(n.ratingRange, undefined);
  assert.equal(n.topBeachOnly, undefined);
  assert.equal(n.gemOnly, true);
  assert.equal(n.unescoOnly, true);
});
