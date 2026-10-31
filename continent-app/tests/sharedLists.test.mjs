// T941: shared Saved lists, the pure model in lib/sharedListModel.js.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listsFromRows, voteState, withVote, byVotes, canRemoveItem, friendsToAdd, sharedKeys, keyKind,
} from '../src/lib/sharedListModel.js';

const ROWS = {
  lists: [{ id: 'l1', owner_id: 'me', name: 'Porto' }, { id: 'l2', owner_id: 'sofie', name: 'Alps' }],
  people: [
    { list_id: 'l1', user_id: 'me', handle: 'me', display_name: 'Me' },
    { list_id: 'l1', user_id: 'sofie', handle: 'sofie_v', display_name: '' },
    { list_id: 'l2', user_id: 'sofie', handle: 'sofie_v', display_name: 'Sofie' },
  ],
  items: [
    { id: 'b', list_id: 'l1', item_key: 'trail:AT/12', added_by: 'sofie', created_at: '2026-10-02' },
    { id: 'a', list_id: 'l1', item_key: 'dest:OPO', added_by: 'me', note: 'Rooftop', created_at: '2026-10-01' },
  ],
  votes: [
    { item_id: 'b', user_id: 'me' }, { item_id: 'b', user_id: 'sofie' }, { item_id: 'b', user_id: 'me' },
  ],
};

test('rows join into lists with members, items in added order and voters', () => {
  const [l1, l2] = listsFromRows(ROWS, 'me');
  assert.equal(l1.mine, true);
  assert.equal(l2.mine, false);
  assert.deepEqual(l1.members.map((m) => m.name), ['Me', '@sofie_v']);
  assert.deepEqual(l1.items.map((it) => it.id), ['a', 'b']);
  assert.equal(l1.items[1].kind, 'trail');
  assert.deepEqual(l1.items[1].votes, ['me', 'sofie'], 'a duplicate vote row counts once');
  assert.equal(l1.items[0].note, 'Rooftop');
  assert.equal(l2.items.length, 0);
});

test('one vote per member: adding twice keeps one, taking back removes it', () => {
  const item = { id: 'x', votes: ['sofie'] };
  const on = withVote(withVote(item, 'me', true), 'me', true);
  assert.deepEqual(voteState(on, 'me'), { n: 2, mine: true });
  assert.deepEqual(voteState(withVote(on, 'me', false), 'me'), { n: 1, mine: false });
  assert.deepEqual(voteState(item, null), { n: 1, mine: false });
});

test('most votes first, ties in added order', () => {
  const out = byVotes([{ id: 1, votes: [] }, { id: 2, votes: ['a'] }, { id: 3, votes: [] }, { id: 4, votes: ['a', 'b'] }]);
  assert.deepEqual(out.map((x) => x.id), [4, 2, 1, 3]);
});

test('the owner or the adder removes an item; nobody else', () => {
  const list = { ownerId: 'me' };
  assert.equal(canRemoveItem(list, { addedBy: 'sofie' }, 'me'), true);
  assert.equal(canRemoveItem(list, { addedBy: 'sofie' }, 'sofie'), true);
  assert.equal(canRemoveItem(list, { addedBy: 'sofie' }, 'jonas'), false);
  assert.equal(canRemoveItem(list, { addedBy: 'sofie' }, null), false);
});

test('only friends not yet in the list can be added', () => {
  const list = { members: [{ userId: 'me' }, { userId: 'sofie' }] };
  const out = friendsToAdd([{ userId: 'sofie' }, { userId: 'jonas' }, null], list);
  assert.deepEqual(out.map((f) => f.userId), ['jonas']);
});

test('keys and kinds', () => {
  assert.equal(keyKind('beach:HR/9'), 'beach');
  assert.equal(keyKind('nokind'), '');
  assert.deepEqual(sharedKeys(listsFromRows(ROWS, 'me')), ['dest:OPO', 'trail:AT/12']);
});
