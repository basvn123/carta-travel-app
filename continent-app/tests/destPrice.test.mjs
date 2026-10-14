// T429: the destination page's price card totals the same day figure the
// Explore card and the map pin print (owner decision 2026-10-13, one cost
// truth), and its receipt always adds up on screen.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { priceFromIndex } from "../src/lib/destPrice.js";

const rome = { stayEur: 32.5, foodEur: 54.67, dayEur: 87.17, stayLevel: "city", foodLevel: "country" };

test("the total is the day figure times the nights and the party", () => {
  const r = priceFromIndex(rome, 7, 2);
  assert.equal(r.lines.find((l) => l.key === "stay").eur, 455);
  assert.equal(r.lines.find((l) => l.key === "ground").eur, 765.38);
  assert.equal(r.total, 1220.38);
  assert.equal(r.each, 610.19);
  assert.ok(Math.abs(r.dayEur - rome.dayEur) < 1e-9);
});

test("the total is the sum of the rounded lines", () => {
  const odd = { stayEur: 10.333, foodEur: 7.777, stayLevel: "city", foodLevel: "city" };
  const r = priceFromIndex(odd, 3, 3);
  const sum = Math.round(r.lines.reduce((s, l) => s + l.eur, 0) * 100) / 100;
  assert.equal(r.total, sum);
});

test("a line is an estimate when its figure is not measured in the town", () => {
  const r = priceFromIndex(rome, 7, 2);
  assert.equal(r.lines.find((l) => l.key === "stay").est, false);
  assert.equal(r.lines.find((l) => l.key === "ground").est, true);
  assert.equal(r.est, true);
  const measured = priceFromIndex({ ...rome, foodLevel: "city" }, 7, 2);
  assert.equal(measured.est, false);
  const repaired = priceFromIndex({ ...rome, stayLevel: "region", foodLevel: "city" }, 7, 2);
  assert.equal(repaired.est, true);
});

test("one traveller has no per-person figure", () => {
  assert.equal(priceFromIndex(rome, 7, 1).each, null);
});

test("a typed fare is added first, as the traveller's own figure", () => {
  const r = priceFromIndex(rome, 7, 2, { costTotal: 117.96 });
  assert.equal(r.lines[0].key, "flight");
  assert.equal(r.lines[0].est, false);
  assert.equal(r.total, 1338.34);
  assert.equal(priceFromIndex(rome, 7, 2, { costTotal: 0 }).lines.length, 2);
});

test("nights and party are whole and at least one", () => {
  const r = priceFromIndex(rome, 0, 0);
  assert.equal(r.nights, 1);
  assert.equal(r.people, 1);
});

test("a row without a bed or a food figure prices nothing", () => {
  assert.equal(priceFromIndex({ stayEur: null, foodEur: 20 }, 7, 2), null);
  assert.equal(priceFromIndex(null, 7, 2), null);
});
