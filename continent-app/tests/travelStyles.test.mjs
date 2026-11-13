// Travel styles (lib/travelStyles.js, owner 2026-11-12): named bundles of
// "how you stay" (the priced app choices) and "how you explore" (the trip
// planner's answers), one active, seeding every new trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STYLES, TEMPLATE_IDS, activeStyle, addStyle, choicesFromStyle, choicesMatchStyle, duplicateStyle,
  explorePatchFromSettings, normalizeStyle, normalizeStyles, removeStyle, setActive, styleFromChoices,
  styleFromTemplate, summaryParts, updateStyle,
} from '../src/lib/travelStyles.js';
import { defaultSettings, normalizeSettings, aroundOf, goalOfGoals, dayAiPreset, dayPrefs } from '../src/planner/flow/tripSettings.js';
import { newTripSettings, switchTripStyle, withStyle } from '../src/planner/flow/styleSeed.js';
import { continueTo, firstOpenGuide, guideScreens, openGuideQuestions, GUIDE_SKIP, TRIPS_SCREEN } from '../src/planner/flow/flowGraph.js';
import { PROFILES } from '../src/lib/lifestyleProfiles.js';

const family = () => styleFromTemplate('family');

test('every template makes a whole, valid style', () => {
  for (const id of TEMPLATE_IDS) {
    const s = styleFromTemplate(id);
    assert.equal(s.template, id);
    assert.ok(s.nameKey.startsWith('styles.t.'));
    assert.deepEqual(normalizeStyle(s), s, `${id} survives a second normalize`);
  }
  const f = family();
  assert.equal(f.who.kids, 2);
  assert.equal(f.stay, 'home');
  assert.equal(f.lifestyle.dinners_per_week, PROFILES.Family.dinners_per_week, 'the table is the Lifestyle preset itself');
  assert.deepEqual(f.explore.shapes, ['one']);
});

test('normalizeStyle drops what is not a style', () => {
  const s = normalizeStyle({ id: 'x', who: { kind: 'aliens', adults: 99 }, stay: 'castle', way: 'rocket', explore: { personas: ['mix', 'coast', 'nature', 'slow', 'cities'], likes: ['beach', 'nope'], shapes: ['oneway', 'road'] } });
  assert.equal(s.who.kind, 'couple');
  assert.equal(s.who.adults, 20);
  assert.equal(s.stay, 'home');
  assert.equal(s.way, 'any');
  assert.deepEqual(s.explore.personas, ['coast', 'nature', 'slow'], 'at most three, and "mix" only alone');
  assert.deepEqual(s.explore.likes, ['beach']);
  assert.deepEqual(s.explore.shapes, ['road']);
});

test('the store keeps at most six styles and a real active one', () => {
  let st = normalizeStyles(null);
  assert.equal(st.active, '');
  for (let i = 0; i < MAX_STYLES + 2; i += 1) st = addStyle(st, styleFromTemplate(TEMPLATE_IDS[i % TEMPLATE_IDS.length]));
  assert.equal(st.list.length, MAX_STYLES);
  assert.equal(st.active, st.list[st.list.length - 1].id, 'a new style becomes the active one');
  const first = st.list[0].id;
  st = setActive(st, first);
  assert.equal(activeStyle(st).id, first);
  st = removeStyle(st, first);
  assert.equal(st.list.length, MAX_STYLES - 1);
  assert.notEqual(st.active, first, 'deleting the active style moves to another');
  // '' is "no style" on purpose (a saved trip loaded its own choices).
  assert.equal(normalizeStyles({ ...st, active: '' }).active, '');
  assert.equal(normalizeStyles({ ...st, active: 'gone' }).active, st.list[0].id);
});

test('duplicate takes a fresh id, its own name and a free colour', () => {
  let st = addStyle(normalizeStyles(null), family());
  const src = st.list[0];
  st = duplicateStyle(st, src.id, 'Kids, winter');
  assert.equal(st.list.length, 2);
  const copy = st.list[1];
  assert.notEqual(copy.id, src.id);
  assert.equal(copy.name, 'Kids, winter');
  assert.notEqual(copy.tone, src.tone);
  assert.deepEqual(copy.explore, src.explore);
});

test('the active style and the app choices are one truth', () => {
  const f = family();
  const choices = { group_size: 4, children: 2, babies: 0, stay_tier: 'home', lifestyle: f.lifestyle, transport_mode: 'any' };
  assert.deepEqual(choicesFromStyle(f), { ...choices, lifestyle: f.lifestyle });
  assert.ok(choicesMatchStyle(f, choices));
  // Nothing moved: the very same object comes back (no write loop).
  assert.equal(styleFromChoices(f, choices), f);
  // A bed changed in the Lifestyle panel is the style's bed now.
  const moved = styleFromChoices(f, { ...choices, stay_tier: 'hotel4', transport_mode: 'train' });
  assert.equal(moved.stay, 'hotel4');
  assert.equal(moved.way, 'train');
  assert.equal(moved.id, f.id);
  assert.deepEqual(moved.explore, f.explore, 'the explore half is never touched by the choices');
  // The last child leaving makes a family a couple; three adults keep "friends".
  assert.equal(styleFromChoices(f, { ...choices, group_size: 2, children: 0 }).who.kind, 'couple');
  const fr = styleFromTemplate('friends');
  assert.equal(styleFromChoices(fr, { ...choicesFromStyle(fr), group_size: 3 }).who.kind, 'friends');
});

test('a new trip starts from the style, marked as the style\'s', () => {
  const f = family();
  const s = newTripSettings(f);
  assert.equal(s.style, f.id);
  assert.equal(s.party.kids, 2);
  assert.equal(s.priority, 'balance');
  assert.deepEqual(s.guide.shapes, ['one']);
  assert.deepEqual(s.guide.personas, ['slow', 'coast']);
  assert.equal(s.guide.around, 'mix', 'no template assumes a hire car');
  assert.equal(s.rhythm.pace, 'slow');
  for (const id of ['who', 'priority', 'g:shape', 'g:persona', 'g:avoid', 'g:around', 'r:mornings', 'r:pace']) {
    assert.ok(s.answered.includes(id), id);
    assert.equal(s.sources[id], 'style', id);
  }
  // Likes are empty in the template: the planner still asks them.
  assert.ok(!s.answered.includes('g:likes'));
  // The source survives a normalize (it is one of SOURCES).
  assert.equal(normalizeSettings(s).sources['g:shape'], 'style');
});

test('the traveller\'s own answers always beat the style', () => {
  let s = defaultSettings();
  s = normalizeSettings({ ...s, guide: { ...s.guide, shapes: ['road'] }, answered: ['g:shape'] });
  const seeded = withStyle(s, family());
  assert.deepEqual(seeded.guide.shapes, ['road']);
  assert.equal(seeded.sources['g:shape'], undefined, 'still the screen\'s');
});

test('switching a trip to another style replaces only what the style gave', () => {
  const f = family();
  const solo = styleFromTemplate('solo');
  let s = newTripSettings(f);
  // The traveller answered the weather and the avoid themselves.
  s = normalizeSettings({ ...s, guide: { ...s.guide, weather: 'warm', avoid: ['crowds'] }, answered: [...s.answered, 'g:weather'], sources: { ...s.sources } });
  delete s.sources['g:avoid'];
  const next = switchTripStyle(s, solo);
  assert.equal(next.style, solo.id);
  assert.equal(next.party.adults, 1);
  assert.deepEqual(next.guide.shapes, ['towns']);
  assert.deepEqual(next.guide.personas, ['cities', 'lively']);
  assert.equal(next.guide.around, 'public');
  assert.equal(next.guide.weather, 'warm', 'an own answer stays');
  assert.deepEqual(next.guide.avoid, ['crowds'], 'an own answer stays');
});

test('the planner passes over what the style answered, never the trips', () => {
  const s = newTripSettings(family());
  const list = guideScreens(s);
  // The persona is the first guide screen; the style gave it, so the walk
  // starts at the first question it did not.
  const first = firstOpenGuide(s);
  assert.notEqual(first, 'g:persona');
  assert.notEqual(first, 'g:shape');
  assert.ok(list.includes(first));
  const open = openGuideQuestions(s);
  assert.ok(!open.includes('g:shape') && !open.includes('g:persona') && !open.includes('g:around'));
  assert.ok(open.includes('g:likes') && open.includes('g:budget'));
  // continueTo with the guide's skip list jumps the style's, the setup's
  // default (words only) does not, so the Who screen still shows the style.
  assert.equal(continueTo(['tell', 'who', 'when'], 'tell', s), 'who');
  const k = continueTo(list, 'g:persona', s, TRIPS_SCREEN, GUIDE_SKIP);
  assert.ok(!['g:shape'].includes(k));
});

test('a trip\'s explore answers go back into the style', () => {
  const f = family();
  let s = newTripSettings(f);
  s = normalizeSettings({ ...s, guide: { ...s.guide, shapes: ['towns', 'road'], likes: ['lakes'] }, rhythm: { ...s.rhythm, mornings: 'early' } });
  const patched = normalizeStyle({ ...f, ...explorePatchFromSettings(s, f) });
  assert.equal(patched.explore.size, f.explore.size, 'the taste facets stay the style\'s');
  assert.deepEqual(patched.explore.shapes, ['towns', 'road']);
  assert.deepEqual(patched.explore.likes, ['lakes']);
  assert.equal(patched.days.mornings, 'early');
  assert.equal(patched.stay, f.stay, 'the stay half is not the trip\'s to change');
});

test('getting around is one answer: the guide\'s drives the day steps', () => {
  const s = newTripSettings(family());
  assert.equal(aroundOf(s), 'transit');
  assert.equal(dayPrefs(s).steps, 10000);
  const drivers = normalizeSettings({ ...s, guide: { ...s.guide, around: 'car' } });
  assert.equal(dayPrefs(drivers).steps, 5000);
  // The guide's answer wins over an older trip's hidden day answer...
  const old = normalizeSettings({ ...s, rhythm: { ...s.rhythm, around: 'walk' } });
  assert.equal(dayPrefs(old).steps, 10000);
  // ...which counts only while the guide has none.
  const legacy = normalizeSettings({ ...old, guide: { ...old.guide, around: '' } });
  assert.equal(dayPrefs(legacy).steps, 15000);
});

test('the Plan your days moods give the AI day plan its vibe', () => {
  assert.equal(goalOfGoals(['museums', 'food']), 'culture');
  assert.equal(goalOfGoals(['nature']), 'outdoors');
  assert.equal(goalOfGoals([]), '');
  let s = defaultSettings();
  s = normalizeSettings({ ...s, rhythm: { ...s.rhythm, goals: ['food'], pace: 'balanced' } });
  assert.equal(dayAiPreset(s).vibe, 'foodie');
});

test('summaryParts says who, the bed and the shape', () => {
  const parts = summaryParts(family());
  assert.deepEqual(parts[0], { party: { adults: 2, children: 2, babies: 0 } });
  assert.equal(parts[1].key, 'stay.home');
  assert.equal(parts[2].key, 'pf.o.shapeOne');
});

test('updateStyle keeps the id and normalizes the patch', () => {
  let st = addStyle(normalizeStyles(null), family());
  const id = st.active;
  st = updateStyle(st, id, { name: '  Summer with kids  ', explore: { ...st.list[0].explore, around: 'helicopter' } });
  assert.equal(st.list[0].id, id);
  assert.equal(st.list[0].name, 'Summer with kids');
  assert.equal(st.list[0].explore.around, '');
});

test('the style and the taste profile are one thing', async () => {
  const { tasteFromStyle, exploreFromTaste, tasteMatchesStyle } = await import('../src/lib/travelStyles.js');
  const { normalizeTaste } = await import('../src/lib/taste.js');
  const solo = styleFromTemplate('solo');
  const taste = normalizeTaste(tasteFromStyle(solo, { lifestyle: 'backpacker', asked: { beach: 'no' } }));
  assert.equal(taste.party, 'solo');
  assert.equal(taste.size, 'city');
  assert.equal(taste.quiet, 'lively');
  assert.equal(taste.noCar, true, 'public transport means no car for For you');
  assert.equal(taste.lifestyle, 'backpacker', 'the taste keeps its own keys');
  assert.deepEqual(taste.asked, { beach: 'no' });
  assert.ok(tasteMatchesStyle(solo, taste));
  // The first-run questions edit the taste; the style follows.
  const back = exploreFromTaste(solo, { ...taste, likes: ['hiking'], size: 'village', quiet: null });
  assert.deepEqual(back.explore.likes, ['hiking']);
  assert.equal(back.explore.size, 'village');
  assert.equal(back.explore.quiet, '');
  assert.ok(!tasteMatchesStyle(solo, { ...taste, likes: ['hiking'] }));
});

test('review fixes: links, account merge, taste kept, babies', async () => {
  const { mergeStyles, styleWithTaste, kindOfCounts } = await import('../src/lib/travelStyles.js');
  const { mergeAccountChoices } = await import('../src/lib/taste.js');
  // Account merge keeps this device's styles and the account's active one.
  const mine = addStyle(normalizeStyles(null), styleFromTemplate('solo'));
  const theirs = addStyle(normalizeStyles(null), styleFromTemplate('family'));
  const merged = mergeStyles(mine, theirs);
  assert.equal(merged.list.length, 2);
  assert.equal(merged.active, theirs.active);
  // ...and the merged active style prices the app, not the account's old choices.
  const out = mergeAccountChoices(
    { travel_styles: mine, group_size: 1, children: 0, stay_tier: 'private' },
    { travel_styles: theirs, group_size: 2, children: 0, stay_tier: 'hotel5' },
  );
  assert.equal(out.group_size, 4);
  assert.equal(out.children, 2);
  assert.equal(out.stay_tier, 'home');
  assert.equal(out.style_held, false, 'the merged style prices the app, not held');
  // A hold is this device's moment, never carried in from the account.
  const held = mergeAccountChoices({ style_held: false }, { style_held: true, group_size: 3 });
  assert.equal(held.style_held, false);
  // A new style keeps what the taste knew.
  const taste = { likes: ['hiking', 'lakes'], size: 'village', quiet: 'quiet', noCar: true };
  const tpl = styleWithTaste(styleFromTemplate('couple'), taste);
  assert.deepEqual(tpl.explore.likes, ['hiking', 'lakes']);
  assert.equal(tpl.explore.size, 'town', 'a template keeps its own place facets');
  const now = styleWithTaste(styleFromTemplate('couple'), taste, { all: true });
  assert.equal(now.explore.size, 'village');
  // A baby makes a family.
  assert.equal(kindOfCounts(2, 0, 1), 'family');
  const c = styleFromTemplate('couple');
  assert.equal(styleFromChoices(c, { ...choicesFromStyle(c), babies: 1 }).who.kind, 'family');
});

test('the address drops children and babies set back to 0', async () => {
  const store = {};
  let url = '/?g=4&gc=2&gb=1&df=m&cn=1&xk=keep';
  globalThis.window = {
    location: { get search() { return url.slice(url.indexOf('?')); }, pathname: '/', hash: '' },
    history: { state: null, replaceState: (_s, _t, u) => { url = u; } },
    localStorage: { setItem: (k, v) => { store[k] = v; }, getItem: (k) => store[k] ?? null },
  };
  try {
    const { persistState } = await import('../src/lib/urlState.js');
    persistState({ choices: { group_size: 2, children: 0, babies: 0 } });
    const q = new URLSearchParams(url.slice(url.indexOf('?')));
    assert.equal(q.get('g'), '2');
    for (const k of ['gc', 'gb', 'df', 'cn']) assert.equal(q.get(k), null, k);
    assert.equal(q.get('xk'), 'keep', 'a foreign key still stands');
  } finally {
    delete globalThis.window;
  }
});

test('a style states its day: bed and food, a person, at the middle place', async () => {
  const { styleDayEur } = await import('../src/lib/price/styleDay.js');
  const dest = (id, bed, meal) => ({ id, iso2: 'IT', costs: { meal_mid_eur: meal, meal_cheap_eur: meal / 2, fastfood_eur: 8, drink_out_eur: 5, coffee_eur: 2, groceries_day_eur: 12 }, accommodation: { home: bed } });
  const dests = { a: dest('a', 80, 20), b: dest('b', 120, 30), c: dest('c', 200, 40) };
  const fam = styleFromTemplate('family');
  const v = styleDayEur(fam, dests);
  // Either the engine prices these fixtures or it says nothing; never a guess.
  assert.ok(v === null || (Number.isFinite(v) && v > 0));
  assert.equal(styleDayEur(fam, {}), null);
  assert.equal(styleDayEur(null, dests), null);
});

test('on the real catalogue every template has a day figure, and they differ', async (t) => {
  const fs = await import('node:fs');
  const path = new URL('../public/app_data.json', import.meta.url);
  if (!fs.existsSync(path)) { t.skip('no local catalogue'); return; }
  const { styleDayEur } = await import('../src/lib/price/styleDay.js');
  const dests = JSON.parse(fs.readFileSync(path, 'utf8')).destinations;
  const figs = TEMPLATE_IDS.map((id) => styleDayEur(styleFromTemplate(id), dests));
  for (const f of figs) assert.ok(Number.isFinite(f) && f > 20 && f < 1000, String(f));
  assert.ok(new Set(figs.map(Math.round)).size > 2, 'the bed and the table move the day');
  // A hotel bed costs a person more than the same style in an entire place.
  const c = styleFromTemplate('couple');
  assert.ok(styleDayEur({ ...c, stay: 'hotel5' }, dests) > styleDayEur({ ...c, stay: 'home' }, dests));
});

test('the bag goes from the finder to the trip page and moves the flight fee', async () => {
  const { selectionOfPlan } = await import('../src/lib/plan/doors.js');
  const { bagFee } = await import('../src/lib/flights/bagFees.js');
  const { BAG_FEES } = await import('../src/lib/flights/bagFees.js');
  const plan = { order: ['a'], nights: { a: 3 }, party: { adults: 2 }, baggage: 'checked_20kg' };
  assert.equal(selectionOfPlan(plan).baggage, 'checked_20kg', 'the hand-over keeps the bag');
  assert.equal(selectionOfPlan({ ...plan, baggage: undefined }).baggage, null, 'no bag: the planner default applies');
  // A low-cost airline charges more for a hold bag than for the cabin bag.
  const lowCost = Object.keys(BAG_FEES)[0];
  assert.ok(bagFee(lowCost, 'checked_20kg').eur > bagFee(lowCost, 'priority_10kg').eur);
});

test('who comes alone moves the countries: a family lifts the calm one', async () => {
  const { matchCountries } = await import('../src/lib/countryMatch.js');
  const { quizAnswers } = await import('../src/planner/flow/tripSettings.js');
  // Two old-town countries alike in all but one thing: AA is crowded, BB
  // calm (countryMatch's family type wants a base and crowding tier 2 or
  // less; no beach or lake tag, so only that rule can tell them apart).
  const place = (iso2, i, tier) => [`${iso2}${i}`, {
    city: `${iso2} town ${i}`, country: iso2, iso2, lat: 45, lon: 10, categories: ['historic'],
    rating: { score: 7 }, image: { url: 'https://x/y.jpg' }, place: { base: 0.6 }, crowding: { tier },
  }];
  const destinations = Object.fromEntries([
    ...Array.from({ length: 20 }, (_, i) => place('AA', i, 3)),
    ...Array.from({ length: 20 }, (_, i) => place('BB', i, 1)),
  ]);
  const answersFor = (kind, adults, kids) => quizAnswers(normalizeSettings({
    ...defaultSettings(), party: { kind, adults, kids, kidAges: [], babies: 0, slowWalkers: false },
    guide: { ...defaultSettings().guide, likes: ['culture'] },
  }));
  const lead = (answers) => {
    const out = matchCountries({ destinations, answers, topN: 5 });
    const by = Object.fromEntries(out.map((r) => [r.iso2, r.score]));
    return { first: out[0]?.iso2, diff: (by.BB ?? 0) - (by.AA ?? 0) };
  };
  const couple = lead(answersFor('couple', 2, 0));
  const family = lead(answersFor('family', 2, 2));
  assert.equal(family.first, 'BB', 'the calm country leads for a family');
  assert.ok(family.diff > couple.diff, `the party alone widens the lead (${couple.diff} to ${family.diff})`);
});

test('a change for one trip holds the style; Keep and Back lift the hold', async () => {
  const { afterChoicesChange, holdChoices, keepChoices, switchChoices } = await import('../src/lib/travelStyles.js');
  const fam = styleFromTemplate('family');
  const base = { ...choicesFromStyle(fam), travel_styles: addStyle(normalizeStyles(null), fam) };
  const styleOf = (c) => normalizeStyles(c.travel_styles).list[0];
  // The planner's Who: hold, then the trip's party (3 adults, no children).
  let c = { ...holdChoices(base), group_size: 3, children: 0 };
  c = afterChoicesChange(c);
  assert.equal(c.style_held, true);
  assert.equal(styleOf(c).who.kids, 2, 'the style keeps its party');
  assert.equal(styleOf(c).who.adults, 2);
  // An app-wide edit while held is not written into the style either.
  c = afterChoicesChange({ ...c, stay_tier: 'hotel4' });
  assert.equal(styleOf(c).stay, 'home');
  // Back: the style's own values, no hold.
  const back = switchChoices(c, fam.id);
  assert.equal(back.group_size, 4);
  assert.equal(back.stay_tier, 'home');
  assert.equal(back.style_held, false);
  // Keep: the trip's values written into the style, no hold.
  const kept = keepChoices(c);
  assert.equal(styleOf(kept).who.adults, 3);
  assert.equal(styleOf(kept).stay, 'hotel4');
  assert.equal(kept.style_held, false);
  // A hold ends by itself once the choices are the style's again.
  const undone = afterChoicesChange({ ...c, group_size: 4, children: 2, stay_tier: 'home' });
  assert.equal(undone.style_held, false);
  // Without a hold an app-wide edit is the style's own.
  const free = afterChoicesChange({ ...base, stay_tier: 'hotel3' });
  assert.equal(styleOf(free).stay, 'hotel3');
  // Holding with nothing active is a no-op.
  const none = { group_size: 2 };
  assert.equal(holdChoices(none), none);
});

test('the load: no priced keys lets the style set the choices; a link holds it', async () => {
  const { afterChoicesChange } = await import('../src/lib/travelStyles.js');
  const fam = styleFromTemplate('family');
  const loaded = { group_size: 2, children: 0, babies: 0, stay_tier: 'home', lifestyle: fam.lifestyle, transport_mode: 'any', travel_styles: addStyle(normalizeStyles(null), fam) };
  const bare = afterChoicesChange(loaded, { first: true, linked: false });
  assert.equal(bare.group_size, 4);
  assert.equal(bare.children, 2);
  const link = afterChoicesChange(loaded, { first: true, linked: true });
  assert.equal(link.group_size, 2, 'the link keeps its party');
  assert.equal(link.style_held, true);
  assert.equal(normalizeStyles(link.travel_styles).list[0].who.kids, 2, 'and the style keeps its own');
});

test('signing in keeps a held trip and its hold', async () => {
  const { mergeAccountChoices } = await import('../src/lib/taste.js');
  const fam = styleFromTemplate('family');
  const st = addStyle(normalizeStyles(null), fam);
  const out = mergeAccountChoices({ travel_styles: st, group_size: 3, children: 0, style_held: true }, { travel_styles: st, group_size: 4, children: 2 });
  assert.equal(out.style_held, true);
  assert.equal(out.children, 0, 'the account does not undo the trip\'s party');
});

test('the bag survives every hand-over: finder answer key, card, trip page, share link', async () => {
  const { planOf } = await import('../src/planner/finder/planOf.js');
  const { answerKey } = await import('../src/lib/recommend/trips.js');
  const { selectionOfPlan } = await import('../src/lib/plan/doors.js');
  const { encodeTripShare, decodeTripShare } = await import('../src/lib/shareLink.js');
  // The finder reprices when the bag changes (it is part of its answer key).
  assert.notEqual(answerKey({ baggage: 'checked_20kg', settings: {} }), answerKey({ baggage: 'priority_10kg', settings: {} }));
  // A finder card's planner state carries the bag to the trip page.
  const trip = { id: 'x', state: { baggage: 'checked_20kg', stops: [{ destinationId: 'a', nights: 3 }] }, slots: [], party: { adults: 2 }, dates: {}, places: [{ id: 'a', nights: 3 }] };
  const plan = planOf(trip);
  assert.equal(plan.baggage, 'checked_20kg');
  assert.equal(selectionOfPlan({ ...plan, order: ['a'], nights: { a: 3 } }).baggage, 'checked_20kg');
  // A shared trip opens with the same bag, short or long key.
  for (const bag of ['checked_20kg', 'priority_10kg', 'checked', 'small']) {
    const out = await decodeTripShare(await encodeTripShare({ stops: [{ destinationId: 'PRN_a', nights: 2 }], baggage: bag }));
    assert.equal(out.baggage, bag);
  }
  const bad = await decodeTripShare(await encodeTripShare({ stops: [{ destinationId: 'PRN_a', nights: 2 }], baggage: 'trunk' }));
  assert.equal(bad.baggage, 'priority', 'an unknown bag falls back to the planner default');
});
