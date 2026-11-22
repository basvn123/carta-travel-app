// Explore round 2 fix round (G12, D10): the pure parts of the flow fixes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isOne, countKey } from '../src/lib/plural.js';
import { nameLines } from '../src/browse/nameLines.js';
import { castleOnly, PICKS } from '../src/browse/filters/filterModel.js';
import { addRecentText, readRecent, addRecent } from '../src/lib/search/recent.js';
import { openAskChat, askChatState, closeAskChat } from '../src/browse/ask/askChatStore.js';
import { openSettings, settingsSheetState, closeSettings } from '../src/browse/settings/settingsSheetStore.js';

test('plural rules: French 1 and 0 are singular, English 0 is not (F3)', () => {
  assert.equal(countKey('fr', 1, 'one', 'many'), 'one');
  assert.equal(countKey('fr', 0, 'one', 'many'), 'one');
  assert.equal(countKey('en', 0, 'one', 'many'), 'many');
  assert.equal(countKey('de', 2, 'one', 'many'), 'many');
  assert.equal(isOne('nl', 1), true);
  assert.equal(isOne('es', 'x'), false);
});

test('a rail name takes the lines its words need (owner: no cut text)', () => {
  const w = (s) => s.length * 10; // 10 px a character
  assert.equal(nameLines('Rome', 100, w), 1);
  assert.equal(nameLines('Rhine Falls (Schaffhausen)', 150, w), 2);
  assert.equal(nameLines('Stockholm Archipelago (Vaxholm)', 100, w), 4);
  assert.equal(nameLines("'s-Hertogenbosch", 140, w), 2, 'breaks after the hyphen');
  assert.equal(nameLines('Saint-Jean-Pied-de-Port', 230, w), 1);
});

test('Old towns leaves out a castle on its own, keeps a town with a castle (m3)', () => {
  assert.equal(castleOnly({ categories: ['castle', 'fairytale', 'alps'] }), true);
  assert.equal(castleOnly({ categories: ['village', 'medieval', 'castle'] }), false);
  assert.equal(castleOnly({ categories: ['city', 'historic'] }), false);
  const guided = { d: { X: { v: { oldtown: 100 } } } };
  assert.equal(typeof PICKS.oldtown.test, 'function');
  assert.equal(PICKS.oldtown.test({ id: 'X', categories: ['castle'] }, guided), false);
});

test('Enter keeps the typed search in Recent, once per name (F4)', () => {
  const box = new Map();
  const storage = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v), removeItem: (k) => box.delete(k) };
  addRecentText('Belgium', storage);
  assert.deepEqual(readRecent(storage).map((r) => [r.type, r.name]), [['text', 'Belgium']]);
  addRecent({ type: 'place', key: 'p:OPO', name: 'Porto' }, storage);
  addRecentText('belgium', storage);
  assert.deepEqual(readRecent(storage).map((r) => r.name), ['Belgium', 'Porto'], 'the same name moves up, not twice');
  addRecentText('   ', storage);
  assert.equal(readRecent(storage).length, 2);
});

test('one side panel at a time: Settings and Ask close each other (flow-corners 1)', () => {
  openSettings({ step: 'when' });
  openAskChat(null);
  assert.equal(settingsSheetState().isOpen, false);
  assert.equal(askChatState().open, true);
  openSettings();
  assert.equal(askChatState().open, false);
  assert.equal(settingsSheetState().isOpen, true);
  closeSettings();
  closeAskChat();
});
