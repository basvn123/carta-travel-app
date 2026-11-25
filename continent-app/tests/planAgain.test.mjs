// G12 L12 (plan rethink, decision §3.2 S10, N5): plan again, somewhere new.
// The seed from a past trip keeps its month, length and party, carries the
// countries been and the trip's own logged spend as a reference only
// (decision 0013), and the finder puts the countries been after new ones.
// Run: node --test tests/planAgain.test.mjs (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { pastAgainSeed } from "../src/lib/plan/seedWriters.js";
import { seedToSettings } from "../src/lib/plan/seed.js";
import { rankTrips } from "../src/lib/recommend/rank.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const past = { id: "p1", name: "Lisbon", start: "2025-05-10", nights: 7, spendPP: 588, party: { adults: 2, kids: 0 } };

test("a past trip seeds its month, length, party, the countries been and its spend", () => {
  const seed = pastAgainSeed(past, { been: ["pt", "ES", "xx1"] });
  assert.equal(seed.source, "past");
  assert.equal(seed.label, "Lisbon");
  assert.deepEqual(seed.when, { mode: "months", start: "", end: "", months: [5], nights: 7 });
  assert.equal(seed.party.adults, 2);
  assert.deepEqual(seed.avoidIso2, ["PT", "ES"]);
  assert.deepEqual(seed.spendRef, { eurPP: 588, nights: 7, planId: "p1", year: 2025 });
});

test("no logged spend means no reference line, never a guessed one", () => {
  const seed = pastAgainSeed({ ...past, spendPP: null }, { been: [] });
  assert.equal(seed.spendRef, null);
});

test("the settings carry the countries been and the spend, and the spend is never a budget", () => {
  const s = seedToSettings(pastAgainSeed(past, { been: ["PT"] }));
  assert.deepEqual(s.avoidIso2, ["PT"]);
  assert.equal(s.spendRef.eurPP, 588);
  assert.equal(s.spendRef.label, "Lisbon");
  assert.equal(s.guide.budget.eur, 0, "own spend never becomes the trip's budget");
  assert.ok(!s.answered.includes("g:budget"));
  // Month and length are a prefill: still asked.
  assert.ok(!s.answered.includes("when"));
  assert.deepEqual(s.when.months, [5]);
});

test("the finder ranks countries been after new ones, fit first unchanged", () => {
  const trip = (id, iso2, F) => ({ id, iso2, country: iso2, places: [], slots: [], total: { group: 1000, perPerson: 500 }, signals: {}, F });
  const settings = normalizeSettings({ avoidIso2: ["PT"] });
  const plain = rankTrips([trip("a", "PT"), trip("b", "IT")], { settings: normalizeSettings({}), data: { destinations: {} } });
  const ranked = rankTrips([trip("a", "PT"), trip("b", "IT")], { settings, data: { destinations: {} } });
  assert.deepEqual(plain.map((x) => x.id), ["a", "b"], "ties keep the id order without countries been");
  assert.deepEqual(ranked.map((x) => x.id), ["b", "a"]);
  assert.equal(ranked[1].been, true);
  assert.equal(ranked[0].been, undefined);
});
