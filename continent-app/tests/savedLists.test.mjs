// T925: the traveller's saved lists and the price each save was made at
// (lib/savedLists.js). A move since saving shows only when a price was
// recorded at save time; an Undo keeps the first price; the account's copy
// merges without losing a list or a note.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const {
  noteSaved, noteUnsaved, loadSavedLists, priceChange, createList, toggleInList, moveList,
  deleteList, restoreList, renameList, setNote, mergeSavedLists, REVIVE_MS,
} = await import('../src/lib/savedLists.js');

test('priceChange: none without a save price, whole euros, under a euro is no news', () => {
  assert.equal(priceChange(null, 90), null);
  assert.equal(priceChange({ at: 1 }, 90), null);
  assert.deepEqual(priceChange({ eur: 96, at: 5 }, 90.4), { diff: -6, at: 5 });
  assert.equal(priceChange({ eur: 90, at: 5 }, 90.4), null);
  assert.equal(priceChange({ eur: 90 }, null), null);
});

test('noteSaved records the price; an Undo inside a minute keeps it, a later save takes today\'s', () => {
  store.clear();
  noteSaved('dest:BCN', 101.6, 1000);
  assert.equal(loadSavedLists().meta['dest:BCN'].eur, 102);
  noteUnsaved('dest:BCN', 2000);
  noteSaved('dest:BCN', 80, 2000 + REVIVE_MS - 1);
  assert.equal(loadSavedLists().meta['dest:BCN'].eur, 102);
  noteUnsaved('dest:BCN', 5000);
  noteSaved('dest:BCN', 80, 5000 + REVIVE_MS + 1);
  assert.equal(loadSavedLists().meta['dest:BCN'].eur, 80);
  noteSaved('trail:AT/12', null, 9);
  assert.equal(loadSavedLists().meta['trail:AT/12'].eur, undefined);
});

test('lists: create, put a save in two lists, move, rename, delete and restore', () => {
  store.clear();
  const a = createList('Summer', ['dest:BCN'], 1).id;
  const b = createList('Hikes', [], 2).id;
  toggleInList(b, 'dest:BCN');
  let s = loadSavedLists();
  assert.deepEqual(s.lists.map((l) => l.keys), [['dest:BCN'], ['dest:BCN']]);
  moveList(b, -1);
  renameList(a, 'Summer 2027');
  s = loadSavedLists();
  assert.deepEqual(s.lists.map((l) => l.name), ['Hikes', 'Summer 2027']);
  const { removed, at } = deleteList(b);
  assert.equal(loadSavedLists().lists.length, 1);
  restoreList(removed, at);
  assert.deepEqual(loadSavedLists().lists.map((l) => l.id), [b, a]);
  assert.equal(createList('  ', [], 3).id, null);
});

test('notes: trimmed, capped, emptied away', () => {
  store.clear();
  setNote('dest:LIS', '  For the birthday  ');
  assert.equal(loadSavedLists().meta['dest:LIS'].note, 'For the birthday');
  setNote('dest:LIS', '');
  assert.equal(loadSavedLists().meta['dest:LIS'], undefined);
});

test('mergeSavedLists: union of lists and keys, the earlier save price wins, a local note wins', () => {
  const local = { lists: [{ id: 'l1', name: 'Mine', keys: ['dest:A'], at: 1 }], meta: { 'dest:A': { at: 50, eur: 70, note: 'here' } } };
  const remote = {
    lists: [{ id: 'l1', name: 'Theirs', keys: ['dest:B'], at: 1 }, { id: 'l2', name: 'Other', keys: [], at: 2 }],
    meta: { 'dest:A': { at: 10, eur: 90, note: 'there' }, 'dest:C': { at: 3, eur: 40 } },
  };
  const m = mergeSavedLists(local, remote);
  assert.deepEqual(m.lists.map((l) => [l.id, l.name, l.keys]), [['l1', 'Mine', ['dest:A', 'dest:B']], ['l2', 'Other', []]]);
  assert.deepEqual(m.meta['dest:A'], { at: 10, eur: 90, note: 'here' });
  assert.deepEqual(m.meta['dest:C'], { at: 3, eur: 40 });
});
