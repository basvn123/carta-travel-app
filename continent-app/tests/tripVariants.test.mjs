// The same route at several lengths is one card (prompt T5).
// Run: npm test  (from continent-app/)
//
// groupTripVariants is what stops the Trips step printing "Bruges and Paris"
// three times with one photograph between them. The rules it has to keep: the
// grouping is the ordered city sequence and nothing else, the preselected
// variant is the one nearest the traveller's window, and a route published at
// one length only stays exactly as it arrived.
import test from "node:test";
import assert from "node:assert/strict";
import { groupTripVariants } from "../src/lib/trips.js";

/** A trip card, with only the fields the grouping reads. */
const trip = (id, days, cities, opts = {}) => ({
  id,
  days,
  score: opts.score ?? 50,
  cities: cities.map((city) => ({ city, cc: opts.cc || "BE", n: 1 })),
  ...opts,
});

const BRUGES_PARIS = ["Bruges", "Paris"];

test("the same ordered cities at three lengths become one card", () => {
  const rows = groupTripVariants([
    trip("bp-5", 5, BRUGES_PARIS),
    trip("bp-6", 6, BRUGES_PARIS),
    trip("bp-7", 7, BRUGES_PARIS),
  ], 6);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].variants.map((v) => v.days), [5, 6, 7]);
});

test("the preselected variant is the one nearest the window", () => {
  const list = [trip("bp-5", 5, BRUGES_PARIS), trip("bp-9", 9, BRUGES_PARIS)];
  assert.equal(groupTripVariants(list, 6)[0].id, "bp-5");
  assert.equal(groupTripVariants(list, 8)[0].id, "bp-9");
});

test("a tie goes to the longer trip", () => {
  // Five days asked for, four and six on offer: six fits by having a slow
  // morning in it, four does not fit by losing an afternoon.
  const rows = groupTripVariants(
    [trip("bp-4", 4, BRUGES_PARIS), trip("bp-6", 6, BRUGES_PARIS)],
    5,
  );
  assert.equal(rows[0].days, 6);
});

test("with no window the ranking's own winner leads", () => {
  // Input order is the ranked order, so the first row of a group stands.
  const rows = groupTripVariants([
    trip("bp-7", 7, BRUGES_PARIS, { score: 80 }),
    trip("bp-5", 5, BRUGES_PARIS, { score: 40 }),
  ], null);
  assert.equal(rows[0].id, "bp-7");
  assert.deepEqual(rows[0].variants.map((v) => v.days), [5, 7]);
});

test("a different order of the same cities is a different trip", () => {
  const rows = groupTripVariants([
    trip("bp", 5, ["Bruges", "Paris"]),
    trip("pb", 5, ["Paris", "Bruges"]),
  ], 5);
  assert.equal(rows.length, 2);
});

test("the city key ignores accents and airport qualifiers", () => {
  // cityKeyName folds "Koln (CGN)" and "Koeln" onto one stop, so two exports
  // of the same route do not draw two cards.
  const rows = groupTripVariants([
    trip("a", 5, ["Köln (CGN)", "Paris"]),
    trip("b", 6, ["Köln", "Paris"]),
  ], 5);
  assert.equal(rows.length, 1);
});

test("a route published once keeps one variant and its own fields", () => {
  const only = trip("solo", 4, ["Lisbon"], { score: 91 });
  const rows = groupTripVariants([only], 7);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "solo");
  assert.equal(rows[0].score, 91);
  assert.equal(rows[0].variants.length, 1);
});

test("junk rows are skipped rather than grouped", () => {
  const rows = groupTripVariants([null, { id: "x", days: 3 }, trip("ok", 3, ["Rome"])], 3);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "ok");
});

test("one chip per length, not one per pace", () => {
  // The same cities are also composed at several paces and shapes, so a route
  // arrives twice at seven days. Two chips both reading "7 days" would be a
  // choice with no difference in it, so the best-scoring of each length wins.
  const rows = groupTripVariants([
    trip("bp-7-packed", 7, BRUGES_PARIS, { score: 80, pace: "packed" }),
    trip("bp-7-relaxed", 7, BRUGES_PARIS, { score: 60, pace: "relaxed" }),
    trip("bp-8", 8, BRUGES_PARIS, { score: 70 }),
  ], 7);
  assert.deepEqual(rows[0].variants.map((v) => v.days), [7, 8]);
  assert.equal(rows[0].variants[0].id, "bp-7-packed");
  assert.equal(rows[0].id, "bp-7-packed");
});
