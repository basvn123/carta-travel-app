// G12 early results (owner decision 2026-11-25): the trips map fits the first
// cards, widens when a later pin lands outside the view, and never moves under
// the traveller (planner/finder/mapFit.js, used by TripsMap.jsx).
import test from "node:test";
import assert from "node:assert/strict";
import { mapFit } from "../src/planner/finder/mapFit.js";

test("G12 map fit: the first pins fit at once", () => {
  assert.equal(mapFit({ fitted: false, inView: false, touched: false, moving: false }), "first");
  assert.equal(mapFit({ fitted: false, inView: true, touched: true, moving: true }), "first");
});

test("G12 map fit: a later pin outside the view widens it", () => {
  assert.equal(mapFit({ fitted: true, inView: false, touched: false, moving: false }), "widen");
  assert.equal(mapFit({ fitted: true, inView: true, touched: false, moving: false }), null, "every pin in view: no move");
});

test("G12 map fit: never while or after the traveller pans or zooms", () => {
  assert.equal(mapFit({ fitted: true, inView: false, touched: false, moving: true }), null);
  assert.equal(mapFit({ fitted: true, inView: false, touched: true, moving: false }), null);
});
