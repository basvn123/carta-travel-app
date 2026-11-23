// E9 phase A (ROADMAP C9, I5, I12, G12, G4; logic wave 2): the state-scope races as replays.
// Written first, as a characterisation of today (flag E9 old); the target cases are
// { todo: true } until the commit that makes them pass turns them into plain tests.
// The replays run the real pure functions in the order App.jsx runs them
// (scripts/eval/lib/state-engine.mjs). Run: node --test tests/stateScope.test.mjs (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { replayJourneys } from '../scripts/eval/lib/state-engine.mjs';

const old = replayJourneys('old');
const now = () => replayJourneys('new');

test('E9 old, G-1: a held trip party is written into the style on a bare-root reload (today)', () => {
  assert.equal(old.reloadHeld.styleAdults, 4);
  assert.equal(old.reloadHeld.styleKind, 'friends');
});
test('E9 new, G-1: the load order keeps On my own as 1 adult', { todo: true }, () => {
  const j = now().reloadHeld;
  assert.equal(j.styleAdults, 1);
  assert.equal(j.styleKind, 'solo');
});

test('E9 old, J-2: any query, the device\'s own included, skips the account pull (today)', () => {
  assert.equal(old.reloadOwnQuery.pullsAccount, false);
  assert.equal(old.foreignLink.pullsAccount, false);
});
test('E9 new, J-2/G-2/G-3: a reload with the device\'s own query pulls the account; a shared link does not', { todo: true }, () => {
  const j = now();
  assert.equal(j.reloadOwnQuery.pullsAccount, true);
  assert.equal(j.foreignLink.pullsAccount, false);
});

test('E9 old, G-19: a sign-in replaces a party edited signed out, without a hold (today)', () => {
  assert.equal(old.signInEdited.groupSize, 3);
  assert.equal(old.signInEdited.held, false);
});
test('E9 new, G-19: a sign-in holds the device\'s party instead of overwriting it', { todo: true }, () => {
  const j = now().signInEdited;
  assert.equal(j.groupSize, 2);
  assert.equal(j.held, true);
});

test('E9 old, G-7: a new trip keeps the held bed (today)', () => {
  assert.equal(old.newTripHeld.stayTier, 'hotel4');
  assert.equal(old.newTripHeld.held, true);
});
test('E9 new, G-7: a new trip lifts the hold, so the bed is the style\'s', { todo: true }, () => {
  const j = now().newTripHeld;
  assert.equal(j.stayTier, j.styleStay);
  assert.equal(j.held, false);
});

test('E9 old, G-16/J-13: the address language is pushed to the account (today)', () => {
  assert.equal(old.langPush.pulled, null);
  assert.equal(old.langPush.pushed, 'nl');
});
test('E9 new, G-16/J-13: the language pushes only from the picker', { todo: true }, () => {
  assert.equal(now().langPush.pushed, 'en');
});

test('E9 old, E-3/V-6: old links narrow Explore with filters that have no chip (today)', () => {
  assert.deepEqual(old.legacyLink.narrowing, ['ratingRange', 'topBeachOnly', 'bigOnly', 'topPick']);
});
test('E9 new, E-3/V-6: hidden legacy keys never narrow Explore', { todo: true }, () => {
  const j = now().legacyLink;
  assert.deepEqual(j.narrowing, []);
  assert.equal(j.gemOnly, true);
});

test('E9 old, old links: the shortlist stays the device\'s and a link\'s home point is never read (wave 0a)', () => {
  assert.equal(old.oldPersonLink.shortlist, 'dest:gem:mine');
  assert.equal(old.oldPersonLink.homePoint, false);
});
test('E9 new, old links: person keys leave the address once read', { todo: true }, () => {
  const j = now().oldPersonLink;
  assert.equal(j.shortlist, 'dest:gem:mine');
  assert.equal(j.favInAddress, false);
  assert.equal(j.dhInAddress, false);
});
