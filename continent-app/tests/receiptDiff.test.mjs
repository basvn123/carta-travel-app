// G12 plan rethink B5 (lane L9, decision §3.3): what a chip change did to the
// price. A whole-trip difference only like for like; with "Not yet" in both,
// only the priced lines' difference, flagged partial; with different live
// lines, no figure.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { receiptDiff, receiptOfTrip, receiptOfQuote } from "../src/lib/price/receiptDiff.js";

const trip = (flight, stay, food = 200) => ({
  slots: [
    { id: "flight", eur: flight == null ? null : flight / 2, eurGroup: flight },
    { id: "stay", eur: stay / 2, eurGroup: stay },
    { id: "food", eur: food / 2, eurGroup: food },
    { id: "activities", eur: null },
  ],
  total: { group: (flight || 0) + stay + food },
});

test("like for like: the whole-trip difference and the lines that moved, biggest first", () => {
  const d = receiptDiff(receiptOfTrip(trip(300, 800)), receiptOfTrip(trip(420, 760)));
  assert.equal(d.comparable, true);
  assert.equal(d.partial, false);
  assert.equal(d.total, 80);
  assert.deepEqual(d.lines, [{ id: "flight", diff: 120 }, { id: "stay", diff: -40 }]);
});

test("Not yet in both: only the priced lines, flagged partial", () => {
  const d = receiptDiff(receiptOfTrip(trip(null, 800)), receiptOfTrip(trip(null, 760)));
  assert.equal(d.comparable, true);
  assert.equal(d.partial, true);
  assert.equal(d.total, -40);
  assert.deepEqual(d.notYet, ["flight"]);
});

test("different live lines: no figure", () => {
  const d = receiptDiff(receiptOfTrip(trip(300, 800)), receiptOfTrip(trip(null, 760)));
  assert.equal(d.comparable, false);
  assert.equal(d.total, null);
});

test("no change is a zero, and nothing in is nothing out", () => {
  assert.equal(receiptDiff(receiptOfTrip(trip(300, 800)), receiptOfTrip(trip(300, 800))).total, 0);
  assert.equal(receiptDiff(null, receiptOfTrip(trip(300, 800))), null);
  assert.equal(receiptOfTrip(null), null);
});

test("a quote reads through the cost tiles; a way there with no figure is Not yet", () => {
  const q = (beds) => ({ grandTotal: 100 + beds, parts: { flights: 100, beds, days: 0 }, travelSplit: { legacy: true } });
  const d = receiptDiff(receiptOfQuote(q(500)), receiptOfQuote(q(450)));
  assert.equal(d.comparable, true);
  assert.equal(d.total, -50);
  const r = receiptOfQuote({ grandTotal: 500, parts: { beds: 500 }, travelSplit: { legacy: false, out: 0, back: 0 } });
  assert.equal(r.lines.travel, null);
});
