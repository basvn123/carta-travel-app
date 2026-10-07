// The tag filter of the curated trip list (T089).
// Run: npm test  (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { tagVocabulary, filterByTag, tagCounts, tagLabel } from "../src/lib/tripTags.js";

const c = (id, tags) => ({ id, tags });
const cards = [
  c("a", ["unesco", "wine"]), c("b", ["unesco", "wine", "rare"]), c("c", ["unesco", "slow-travel"]),
  c("d", ["wine", "slow-travel"]), c("e", ["slow-travel"]), c("f"), c("g", null),
];

test("the vocabulary keeps tags on three or more trips, most common first", () => {
  assert.deepEqual(tagVocabulary(cards), ["slow-travel", "unesco", "wine"]);
  assert.deepEqual(tagVocabulary(cards, { min: 4 }), []);
  assert.deepEqual(tagVocabulary(cards, { min: 1, max: 2 }), ["slow-travel", "unesco"]);
});

test("a card with no tags never fails the vocabulary or the filter", () => {
  assert.deepEqual(filterByTag(cards, "unesco").map((x) => x.id), ["a", "b", "c"]);
  assert.equal(filterByTag(cards, null), cards);
  assert.deepEqual(filterByTag([c("f"), c("g", null)], "wine"), []);
});

test("counts read the cards given, so they follow the other filters", () => {
  const vocab = tagVocabulary(cards);
  assert.deepEqual(tagCounts(cards, vocab), { "slow-travel": 3, unesco: 3, wine: 3 });
  assert.deepEqual(tagCounts(cards.slice(0, 2), vocab), { "slow-travel": 0, unesco: 2, wine: 2 });
});

test("a tag reads as words", () => {
  assert.equal(tagLabel("hut-to-hut"), "hut to hut");
});
