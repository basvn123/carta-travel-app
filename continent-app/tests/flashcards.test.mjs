import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCards, cardWords, cardCategory, buildCards, CARD_WORD_LIMIT } from '../src/lib/flashcards.js';

test('a short text stays one card', () => {
  assert.deepEqual(splitCards('Book the refuge early. It fills fast.'), ['Book the refuge early. It fills fast.']);
});

test('no card is over the word limit and no word is lost', () => {
  const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} has exactly seven words here.`).join(' ');
  const cards = splitCards(long);
  assert.ok(cards.length > 2);
  for (const c of cards) assert.ok(cardWords(c) <= CARD_WORD_LIMIT, c);
  assert.equal(cards.join(' ').split(/\s+/).length, long.split(/\s+/).length);
});

test('one sentence far over the limit is split at its commas', () => {
  const s = `${Array(30).fill('word').join(' ')}, then ${Array(30).fill('more').join(' ')}.`;
  const cards = splitCards(s);
  assert.ok(cards.length >= 2);
  for (const c of cards) assert.ok(cardWords(c) <= CARD_WORD_LIMIT);
});

test('a bold run is closed on every card it crosses', () => {
  const s = `**${Array(50).fill('alpha').join(' ')}** done.`;
  for (const c of splitCards(s)) assert.equal((c.match(/\*\*/g) || []).length % 2, 0);
});

test('abbreviations do not end a sentence', () => {
  assert.equal(splitCards('Carry cash, e.g. coins for the toilets. Pay at the door.').length, 1);
});

test('category follows the words, then the deck default', () => {
  assert.equal(cardCategory('Expect rain from noon.', 'risk'), 'weather');
  assert.equal(cardCategory('Pay 12 euros at the door.', 'risk'), 'money');
  assert.equal(cardCategory('Book two weeks in advance.', 'tip'), 'timing');
  assert.equal(cardCategory('The path is steep.', 'risk'), 'risk');
});

test('buildCards keeps the label and numbers the keys', () => {
  const cards = buildCards([{ key: 'a', text: Array(80).fill('word').join(' ') + '.', label: 'Money' }], 'tip');
  assert.ok(cards.length >= 3);
  assert.equal(cards[0].label, 'Money');
  assert.equal(cards[1].key, 'a-1');
});
