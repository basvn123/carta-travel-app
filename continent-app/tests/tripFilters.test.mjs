// The cost band and trip length filters of the curated trip list (T188).
// Run: npm test  (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { totalMid, costEdges, bandOf, filterByBand, bandCounts } from "../src/lib/tripFilters.js";
import { SHORT, WEEK } from "../src/lib/tripLength.js";

const card = (id, mid, diff = 2) => ({ id, days: 7, diff, eur: { low: mid - 100, high: mid + 100 } });
const cards = Array.from({ length: 12 }, (_, i) => card(`c${i}`, 600 + i * 100));   // 600 to 1700

test("a card's total is the midpoint of its range at the length chosen", () => {
  const c = card("a", 700, 2);
  assert.equal(totalMid(c, WEEK), 700);
  assert.equal(totalMid(c, SHORT), 400, "four sevenths of 700");
  assert.equal(totalMid(card("b", 700, 4), SHORT), 300, "a hard trip keeps three days");
  assert.equal(totalMid({ days: 7 }, WEEK), null);
});

test("the edges split the library in three and move with the length", () => {
  const week = costEdges(cards, WEEK);
  const short = costEdges(cards, SHORT);
  assert.deepEqual(week, { low: 1000, high: 1400 });
  assert.ok(short.high < week.high && short.low < week.low);
  assert.equal(costEdges(cards.slice(0, 5), WEEK), null, "too few trips to split");
});

test("a band holds the cards between its edges", () => {
  const edges = costEdges(cards, WEEK);
  assert.equal(bandOf(999, edges), "low");
  assert.equal(bandOf(1000, edges), "mid");
  assert.equal(bandOf(1400, edges), "high");
  assert.equal(bandOf(null, edges), null);
  const counts = bandCounts(cards, { length: WEEK, edges });
  assert.equal(counts.low + counts.mid + counts.high, cards.length);
  assert.deepEqual(filterByBand(cards, { length: WEEK, band: "mid", edges }).map((c) => c.id), ["c4", "c5", "c6", "c7"]);
});

test("no band, or no edges, leaves the list alone", () => {
  const edges = costEdges(cards, WEEK);
  assert.equal(filterByBand(cards, { length: WEEK, band: null, edges }), cards);
  assert.equal(filterByBand(cards, { length: WEEK, band: "low", edges: null }), cards);
});

test("the band composes with the length: a trip can change band between lengths", () => {
  const edgesW = costEdges(cards, WEEK);
  const edgesS = costEdges(cards, SHORT);
  const c = cards[6];   // 1200 for the week, about 686 short
  assert.equal(bandOf(totalMid(c, WEEK), edgesW), "mid");
  assert.equal(bandOf(totalMid(c, SHORT), edgesS), "mid", "each length has its own edges, so the position holds");
});
