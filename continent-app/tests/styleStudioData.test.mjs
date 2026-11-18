// Style Studio data (G12, .work/2026-11-18-style-studio decision.md "Data"):
// the ways there and the trade-offs on a style, the personas worked out from
// the answers, the wizard's drafts and the studio's open state, and where the
// trade-offs really land (the trip's flight prefs and ranking, the planner's
// stay options) and what the AI receives.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STYLES, PERSONAS, STUDIO_STEPS, TRADEOFF_DEFAULTS, addStyle, afterChoicesChange, choicesFromStyle, choicesMatchStyle,
  commitChoices, createChoices, derivePersonas, draftFromTemplate, draftWithPriority, emptyDraft, explorePatchFromSettings, normalizeStyle,
  normalizeStyles, studioOpen, styleFromDraft, styleFromTemplate, styleWays,
} from '../src/lib/travelStyles.js';
import { styleForAi, STYLE_AI_ENUMS } from '../src/lib/styleForAi.js';
import {
  defaultSettings, flightPrefsFor, flightRanking, flightStateOf, markAnswered, normalizeSettings, tradeoffsOf,
} from '../src/planner/flow/tripSettings.js';
import { newTripSettings, switchTripStyle } from '../src/planner/flow/styleSeed.js';
import { fitsPrefs, NO_FLIGHT_PREFS } from '../src/lib/flights/flights.js';
import { stayOptions, stayTierFor, hostelOk } from '../src/lib/recommend/adapters/stay.js';

const withPriority = (priority, tradeoffs) => styleFromDraft({ ...draftWithPriority(draftFromTemplate('couple'), priority), ...(tradeoffs ? { tradeoffs } : {}) });

test('picking a priority in the wizard resets the trade-offs to its row', () => {
  const d = { ...draftFromTemplate('solo'), tradeoffs: { early: false, stops: false, hostel: false } };
  assert.deepEqual(draftWithPriority(d, 'price').tradeoffs, TRADEOFF_DEFAULTS.price);
  assert.equal(draftWithPriority(d, 'nope').priority, 'balance');
  assert.notEqual(draftWithPriority(d, 'price').tradeoffs, TRADEOFF_DEFAULTS.price, 'a copy, never the frozen row');
});

test('a style made before G12 loads with its one way and its priority\'s trade-offs', () => {
  const old = normalizeStyle({ id: 'old', way: 'train', priority: 'price' });
  assert.deepEqual(old.ways, ['train']);
  assert.equal(old.way, 'train');
  assert.deepEqual(old.tradeoffs, TRADEOFF_DEFAULTS.price);
  const any = normalizeStyle({ id: 'a', way: 'any', priority: 'comfort' });
  assert.deepEqual(any.ways, [], '"any" is none picked');
  assert.deepEqual(any.tradeoffs, TRADEOFF_DEFAULTS.comfort);
  assert.deepEqual(normalizeStyle(old), old, 'a second normalize changes nothing');
});

test('ways and trade-offs are whitelisted, and the main way is always among the ways', () => {
  const s = normalizeStyle({ way: 'train', ways: ['plane', 'rocket', 'plane', 'any'], tradeoffs: { early: false, stops: 'yes', hostel: true, extra: 1 }, priority: 'price' });
  assert.deepEqual(s.ways, ['plane', 'train'], 'unknown and repeated ways dropped, the main one joins');
  assert.deepEqual(s.tradeoffs, { early: false, stops: true, hostel: true }, 'a non-boolean takes the priority default');
  assert.deepEqual(styleWays(s), ['plane', 'train']);
  assert.deepEqual(styleWays(null), []);
});

test('a way changed on Explore joins the style\'s ways, so the style and the choices meet again', () => {
  const s = styleFromDraft({ ...draftFromTemplate('couple'), ways: ['plane', 'train'] });
  const store = addStyle(normalizeStyles(null), s);
  const prev = { ...choicesFromStyle(s), travel_styles: store, transport_mode: 'bus' };
  const next = afterChoicesChange(prev);
  const a = next.travel_styles.list[0];
  assert.equal(a.way, 'bus');
  assert.deepEqual(a.ways, ['plane', 'train', 'bus']);
  assert.ok(choicesMatchStyle(a, next), 'no "changed" left behind');
  assert.equal(afterChoicesChange(next), next, 'and it settles');
});

test('derivePersonas: the likes first, then the place, then the pace; at most three; mix when nothing', () => {
  assert.deepEqual(derivePersonas({}, {}), ['mix']);
  assert.deepEqual(derivePersonas(null, null), ['mix']);
  assert.deepEqual(derivePersonas({ likes: ['beach', 'islands'] }), ['coast'], 'two likes, one persona');
  assert.deepEqual(derivePersonas({ likes: ['hiking', 'nightlife', 'hidden', 'beach'] }), ['nature', 'lively', 'hidden']);
  assert.deepEqual(derivePersonas({ likes: ['lakes'], size: 'village', quiet: 'lively' }), ['nature', 'towns', 'lively']);
  assert.deepEqual(derivePersonas({ size: 'city', shapes: ['towns'] }), ['cities']);
  assert.deepEqual(derivePersonas({ size: 'city', shapes: ['one'] }), ['hubtrips'], 'a city lover who stays put');
  assert.deepEqual(derivePersonas({ size: 'city', quiet: 'quiet' }), ['outside'], 'a quiet one sleeps outside it');
  assert.deepEqual(derivePersonas({ shapes: ['one'] }, { pace: 'slow' }), ['slow']);
  assert.deepEqual(derivePersonas({ shapes: ['one', 'road'] }, { pace: 'slow' }), ['mix'], 'slow needs one base only');
  assert.deepEqual(derivePersonas({ likes: ['culture', 'food'] }), ['mix'], 'likes with no persona of their own');
  for (const p of derivePersonas({ likes: ['beach', 'city', 'hidden'], size: 'town', quiet: 'lively' })) assert.ok(PERSONAS.includes(p), p);
});

test('drafts: nothing stored, no id; the template\'s answers; personas derived on save', () => {
  const e = emptyDraft();
  assert.equal(e.id, '');
  assert.equal(e.who.kind, 'couple');
  assert.equal(e.who.adults, 2);
  assert.equal(e.stay, 'home');
  assert.equal(e.way, 'any');
  assert.deepEqual(e.ways, []);
  const f = draftFromTemplate('family');
  assert.equal(f.id, '');
  assert.equal(f.template, 'family');
  assert.equal(f.who.kids, 2);
  assert.deepEqual(f.explore.personas, ['slow']);
  assert.deepEqual(draftFromTemplate('aliens'), { ...emptyDraft() });
  // The traveller changes the likes: the personas follow on save.
  const saved = styleFromDraft({ ...f, explore: { ...f.explore, likes: ['beach'], personas: ['cities'] } });
  assert.ok(saved.id, 'a new id');
  assert.deepEqual(saved.explore.personas, ['coast', 'slow']);
});

test('styleFromDraft: the main way is the first ticked unless another ticked one was chosen', () => {
  const d = draftFromTemplate('solo');
  assert.equal(styleFromDraft({ ...d, ways: ['train', 'plane'], way: 'any' }).way, 'train');
  assert.equal(styleFromDraft({ ...d, ways: ['train', 'plane'], way: 'plane' }).way, 'plane');
  assert.equal(styleFromDraft({ ...d, ways: ['train'], way: 'car' }).way, 'train', 'a way no longer ticked');
  const none = styleFromDraft({ ...d, ways: [], way: 'plane' });
  assert.equal(none.way, 'any');
  assert.deepEqual(none.ways, []);
  assert.equal(styleFromDraft({ ...d, id: 'keep' }).id, 'keep');
});

test('createChoices: added, active, priced, hold lifted; nothing at the limit', () => {
  const s = styleFromDraft(draftFromTemplate('family'));
  const next = createChoices({ group_size: 1, style_held: true }, s);
  assert.equal(next.travel_styles.active, s.id);
  assert.equal(next.group_size, 4);
  assert.equal(next.children, 2);
  assert.equal(next.stay_tier, 'home');
  assert.equal(next.style_held, false);
  let store = normalizeStyles(null);
  for (let i = 0; i < MAX_STYLES; i++) store = addStyle(store, styleFromTemplate('solo'));
  const full = { travel_styles: store };
  assert.equal(createChoices(full, styleFromDraft(emptyDraft())), full);
});

test('commitChoices: the active style reprices the app; a held one is only stored', () => {
  const a = styleFromDraft(draftFromTemplate('couple'));
  const start = createChoices({}, a);
  const draft = { ...a, stay: 'hotel5', who: { ...a.who, adults: 3, kind: 'friends' } };
  const live = commitChoices(start, a.id, styleFromDraft(draft));
  assert.equal(live.stay_tier, 'hotel5');
  assert.equal(live.group_size, 3);
  assert.equal(live.travel_styles.list[0].stay, 'hotel5');
  // Held: the trip's own party stays, the style is stored.
  const held = { ...start, group_size: 5, style_held: true };
  const kept = commitChoices(held, a.id, styleFromDraft(draft));
  assert.equal(kept.group_size, 5);
  assert.equal(kept.stay_tier, start.stay_tier);
  assert.equal(kept.style_held, true);
  assert.equal(kept.travel_styles.list[0].stay, 'hotel5');
  // Not the active one: stored, no reprice.
  const b = styleFromDraft(draftFromTemplate('solo'));
  const two = { ...start, travel_styles: { ...addStyle(start.travel_styles, b), active: a.id } };
  const other = commitChoices(two, b.id, styleFromDraft({ ...b, stay: 'dorm' }));
  assert.equal(other.stay_tier, start.stay_tier);
  assert.equal(other.travel_styles.list.find((x) => x.id === b.id).stay, 'dorm');
  assert.equal(commitChoices(start, 'nope', styleFromDraft(draft)), start, 'an unknown id changes nothing');
});

test('studioOpen: every door lands on a view that exists', () => {
  const a = styleFromTemplate('couple');
  const store = addStyle(normalizeStyles(null), a);
  const none = normalizeStyles(null);
  assert.equal(studioOpen(false, store), null);
  assert.equal(studioOpen(null, store), null);
  assert.deepEqual(studioOpen(true, store), { view: 'overview', id: '', step: 'name' });
  assert.deepEqual(studioOpen('stay', store), { view: 'edit', id: a.id, step: 'name' });
  assert.deepEqual(studioOpen('explore', store), { view: 'edit', id: a.id, step: 'shapes' });
  assert.deepEqual(studioOpen({ view: 'edit', step: 'spend' }, store), { view: 'edit', id: a.id, step: 'spend' }, 'no id: the active one');
  assert.deepEqual(studioOpen({ view: 'edit', id: 'gone', step: 'way' }, store), { view: 'edit', id: a.id, step: 'way' });
  assert.deepEqual(studioOpen({ view: 'edit', id: a.id, step: 'nope' }, store), { view: 'edit', id: a.id, step: 'name' });
  assert.deepEqual(studioOpen({ view: 'edit', step: 'spend' }, none), { view: 'create', id: '', step: 'name' }, 'no style: make one');
  assert.deepEqual(studioOpen({ view: 'edit', step: 'spend' }, { ...store, active: '' }), { view: 'overview', id: '', step: 'name' }, 'none in use: pick one');
  assert.deepEqual(studioOpen({ view: 'create' }, store), { view: 'create', id: '', step: 'name' });
  assert.deepEqual(studioOpen({ view: 'weird' }, store), { view: 'overview', id: '', step: 'name' });
  assert.equal(STUDIO_STEPS.length, 10);
});

test('trade-offs seed the trip: flight prefs and ranking per priority', () => {
  const price = newTripSettings(withPriority('price'));
  assert.deepEqual(price.tradeoffs, TRADEOFF_DEFAULTS.price);
  assert.deepEqual(flightRanking(price), { sort: 'price', maxStops: 2 });
  assert.deepEqual(flightPrefsFor(price), { direct: false, after: 0, before: 24, maxStops: 2 });
  const balance = newTripSettings(withPriority('balance'));
  assert.deepEqual(flightRanking(balance), { sort: 'balanced', maxStops: 1 });
  assert.deepEqual(flightPrefsFor(balance), { direct: false, after: 7, before: 24, maxStops: 1 });
  const comfort = newTripSettings(withPriority('comfort'));
  assert.deepEqual(flightRanking(comfort), { sort: 'comfort', maxStops: 0 });
  assert.deepEqual(flightPrefsFor(comfort), { direct: true, after: 7, before: 24 });
  // Flipped by the traveller: price, but no change of planes and no dawn.
  const flipped = newTripSettings(withPriority('price', { early: false, stops: false, hostel: true }));
  assert.deepEqual(flightPrefsFor(flipped), { direct: true, after: 7, before: 24 });
  assert.deepEqual(flightStateOf(flipped), { flightRank: 'price', flightPrefs: flightPrefsFor(flipped) });
});

test('a trip with no style keeps every flight; an own priority takes its defaults', () => {
  const plain = defaultSettings();
  assert.equal(tradeoffsOf(plain), null);
  assert.deepEqual(flightPrefsFor(plain), { ...NO_FLIGHT_PREFS });
  assert.deepEqual(flightRanking({ ...plain, priority: 'price' }), { sort: 'price', maxStops: 2 });
  assert.deepEqual(normalizeSettings({ tradeoffs: 'x' }).tradeoffs, null);
  // The style said price with no stops; the traveller then answered comfort.
  const s = newTripSettings(withPriority('price', { early: true, stops: false, hostel: true }));
  const own = markAnswered(normalizeSettings({ ...s, priority: 'comfort' }), 'priority');
  assert.deepEqual(tradeoffsOf(own), TRADEOFF_DEFAULTS.comfort);
  // Another style: its own trade-offs, nothing of the old one's.
  const moved = switchTripStyle(s, withPriority('balance'));
  assert.deepEqual(moved.tradeoffs, TRADEOFF_DEFAULTS.balance);
  // Keep in my style: the trade-offs go with the priority.
  const st = withPriority('price', { early: false, stops: true, hostel: true });
  assert.deepEqual(explorePatchFromSettings({ ...s, priority: 'price' }, st).tradeoffs, st.tradeoffs);
  assert.deepEqual(explorePatchFromSettings({ ...s, priority: 'comfort' }, st).tradeoffs, TRADEOFF_DEFAULTS.comfort);
  assert.ok(explorePatchFromSettings(s, st).explore.personas.length > 0, 'personas derived on keep too');
});

test('fitsPrefs: maxStops caps the changes of planes', () => {
  assert.ok(fitsPrefs({ stops: 1, dep: '09:00' }, { ...NO_FLIGHT_PREFS, maxStops: 1 }));
  assert.ok(!fitsPrefs({ stops: 2, dep: '09:00' }, { ...NO_FLIGHT_PREFS, maxStops: 1 }));
  assert.ok(fitsPrefs({ stops: 3, dep: '09:00' }, { ...NO_FLIGHT_PREFS, maxStops: undefined }), 'lifted on Change flight');
  assert.ok(!fitsPrefs({ stops: 0, dep: '06:10' }, { ...NO_FLIGHT_PREFS, after: 7 }), 'no dawn flight');
});

test('hostel trade-off: the planner\'s stay options and pick', () => {
  const row = { options: [{ id: 'private' }, { id: 'home' }, { id: 'hotel3' }], byPriority: { price: 'private', balance: 'home', comfort: 'hotel3' } };
  const opts = [{ id: 'home', eurGroup: 500 }, { id: 'private', eurGroup: 420 }, { id: 'hotel3', eurGroup: 700 }];
  const yes = newTripSettings(withPriority('price'));
  const no = newTripSettings(withPriority('price', { early: true, stops: true, hostel: false }));
  assert.equal(hostelOk({ settings: yes }), true);
  assert.equal(hostelOk({ settings: no }), false);
  assert.equal(hostelOk({ settings: defaultSettings() }), null);
  assert.deepEqual(stayOptions(opts, 'home', true).map((o) => o.id), ['home', 'private', 'hotel3'], 'cheaper: offered');
  assert.deepEqual(stayOptions(opts.map((o) => (o.id === 'private' ? { ...o, eurGroup: 600 } : o)), 'home', true).map((o) => o.id), ['home', 'hotel3'], 'dearer: no reason to offer it');
  assert.deepEqual(stayOptions(opts, 'home', false).map((o) => o.id), ['home', 'hotel3']);
  assert.deepEqual(stayOptions(opts, 'private', false).map((o) => o.id), ['home', 'private', 'hotel3'], 'the traveller\'s own bed always shows');
  assert.equal(stayOptions(opts, 'home', null), opts, 'no style: as before');
  assert.equal(stayTierFor({ priority: 'price', settings: yes }, row), 'private');
  assert.equal(stayTierFor({ priority: 'price', settings: no }, row), 'home');
  assert.equal(stayTierFor({ priority: 'price', stayTier: 'private', settings: no }, row), 'private', 'the Sleep answer wins');
  assert.equal(stayTierFor({ priority: 'price' }, row), 'private', 'no style: as before');
});

test('styleForAi: enum values and head counts only, unanswered left out', () => {
  const s = styleFromDraft({
    ...draftFromTemplate('family'), name: 'Our summer, Bas', ways: ['train', 'car'],
    explore: { ...draftFromTemplate('family').explore, likes: ['beach'], size: '' },
  });
  const ai = styleForAi(s);
  assert.deepEqual(Object.keys(ai).sort(), ['around', 'avoid', 'likes', 'mornings', 'pace', 'party', 'priority', 'quiet', 'shapes', 'stay', 'way', 'ways'].sort());
  assert.deepEqual(ai.party, { adults: 2, kids: 2, babies: 0 });
  assert.deepEqual(ai.ways, ['train', 'car']);
  assert.equal(ai.way, 'train');
  assert.ok(!JSON.stringify(ai).includes('Bas'), 'no name or free text');
  for (const [k, v] of Object.entries(ai)) {
    if (k === 'party') continue;
    for (const x of [].concat(v)) assert.ok(STYLE_AI_ENUMS[k].includes(x), `${k}=${x}`);
  }
  const bare = styleForAi(emptyDraft());
  assert.deepEqual(Object.keys(bare).sort(), ['party', 'priority', 'stay'], 'way "any" and empty answers are not sent');
  assert.equal(styleForAi(null), null);
});
