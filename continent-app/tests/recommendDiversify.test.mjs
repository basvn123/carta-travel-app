// G12 plan rethink, lane R1: the best pick stays the engine's rank 1, and
// the next five differ in country, shape and price band (MMR style).
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { diversify, diverseOrder, priceBands, similarity, countryShare, DIVERSE } from "../src/lib/recommend/diversify.js";

const trip = (id, iso2, shape, eur, score, extra = {}) => ({
  id, iso2, shape, score, qualified: true, total: { group: eur, perPerson: eur / 2 },
  slots: [{ id: "flight", eur: 100 }, { id: "stay", eur: 200 }], ...extra,
});

// Six Italian one-base trips at the top, then other countries a little lower.
const ranked = [
  trip("it1", "IT", "one", 900, 0.80),
  trip("it2", "IT", "one", 950, 0.79),
  trip("it3", "IT", "one", 1000, 0.78),
  trip("it4", "IT", "one", 1050, 0.77),
  trip("it5", "IT", "one", 1100, 0.76),
  trip("it6", "IT", "towns", 1150, 0.75),
  trip("pt1", "PT", "one", 1200, 0.72),
  trip("es1", "ES", "towns", 700, 0.71),
  trip("fr1", "FR", "one", 1500, 0.70),
  trip("hr1", "HR", "road", 800, 0.69),
];

test("R1: rank 1 is the engine's pure best, always", () => {
  assert.equal(diversify(ranked)[0].id, "it1");
  assert.equal(diverseOrder(ranked)[0].id, "it1");
});

test("R1: the top six spread over countries instead of six weeks in Italy", () => {
  assert.equal(countryShare(ranked).countries, 1);
  const top = diversify(ranked);
  assert.equal(top.length, DIVERSE.k);
  assert.ok(countryShare(top).countries >= 4, `got ${top.map((x) => x.iso2)}`);
  // The rest follows in the engine's order, nothing lost or doubled.
  const all = diverseOrder(ranked);
  assert.equal(all.length, ranked.length);
  assert.equal(new Set(all.map((x) => x.id)).size, ranked.length);
});

test("R1: a much better trip still wins over a merely different one", () => {
  const list = [trip("a", "IT", "one", 900, 0.9), trip("b", "IT", "towns", 2000, 0.89), trip("c", "PT", "one", 950, 0.2)];
  assert.deepEqual(diversify(list, { k: 2 }).map((x) => x.id), ["a", "b"]);
});

test("R1: an unqualified trip never takes a slot from a qualified one", () => {
  const list = [
    trip("a", "IT", "one", 900, 0.8),
    trip("b", "IT", "one", 900, 0.79),
    trip("c", "PT", "road", 2000, 0.9, { qualified: false }),
  ];
  assert.deepEqual(diversify(list, { k: 2 }).map((x) => x.id), ["a", "b"]);
});

test("R1: a total with a Not yet line has no price band", () => {
  const partial = trip("p", "IT", "one", 500, 0.5, { slots: [{ id: "flight", eur: null }] });
  const bands = priceBands([...ranked, partial]);
  assert.equal(bands.has("p"), false);
  assert.equal(bands.get("es1"), 0, "the cheapest third");
  assert.equal(bands.get("fr1"), 2, "the dearest third");
  // Without a band it is like another trip only by country and shape.
  assert.equal(similarity(partial, ranked[0], bands), DIVERSE.weights.country + DIVERSE.weights.shape);
});

test("R1: small and empty lists come back as they are", () => {
  assert.deepEqual(diversify([]), []);
  assert.deepEqual(diversify(null), []);
  assert.deepEqual(diversify([ranked[0]]).map((x) => x.id), ["it1"]);
  assert.equal(diversify(ranked, { k: 3 }).length, 3);
});

test("R1: pure, the trips are not changed", () => {
  const copy = JSON.stringify(ranked);
  diverseOrder(ranked);
  assert.equal(JSON.stringify(ranked), copy);
});
