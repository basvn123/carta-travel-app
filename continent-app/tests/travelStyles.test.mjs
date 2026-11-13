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
  assert.equal(s.guide.around, 'car');
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
  assert.equal(aroundOf(s), 'car');
  assert.equal(dayPrefs(s).steps, 5000);
  const walkers = normalizeSettings({ ...s, guide: { ...s.guide, around: 'public' } });
  assert.equal(dayPrefs(walkers).steps, 10000);
  // An older trip's own day answer still wins.
  const old = normalizeSettings({ ...s, rhythm: { ...s.rhythm, around: 'walk' } });
  assert.equal(dayPrefs(old).steps, 15000);
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
