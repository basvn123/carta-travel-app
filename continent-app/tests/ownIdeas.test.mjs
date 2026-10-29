import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addIdea, setIdeaDay, removeIdea, ideasOnDay, setDayNote, IDEA_MAX } from '../src/planner/trip/ownIdeas.js';

const empty = { ideas: [], dayNotes: {} };

test('an idea is kept in the traveller\'s words, for later, and can be put on a day and back', () => {
  let x = addIdea(empty, '  Swim in   Lake Bohinj ', { now: 1 });
  assert.equal(x.ideas.length, 1);
  assert.equal(x.ideas[0].text, 'Swim in Lake Bohinj');
  assert.equal(x.ideas[0].day, null);
  const id = x.ideas[0].id;
  x = setIdeaDay(x, id, 4);
  assert.deepEqual(ideasOnDay(x, 4).map((i) => i.text), ['Swim in Lake Bohinj']);
  x = setIdeaDay(x, id, null);
  assert.equal(ideasOnDay(x, 4).length, 0);
  x = removeIdea(x, id);
  assert.equal(x.ideas.length, 0);
});

test('a blank idea adds nothing, and a long one is cut', () => {
  assert.equal(addIdea(empty, '   '), empty);
  assert.equal(addIdea(empty, 'x'.repeat(500)).ideas[0].text.length, IDEA_MAX);
});

test('a day note is set in a few words and cleared with an empty text', () => {
  let x = setDayNote(empty, 2, 'Old town, lazy lunch, castle at sunset');
  assert.equal(x.dayNotes[2], 'Old town, lazy lunch, castle at sunset');
  x = setDayNote(x, 2, '');
  assert.equal(x.dayNotes[2], undefined);
});
