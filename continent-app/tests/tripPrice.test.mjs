// T431: the week's price at the traveller's choices. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { tripPrice, includedRows, lifestyleShares } from "../src/lib/tripPrice.js";
import { PROFILES } from "../src/lib/lifestyleProfiles.js";

const budget = {
  totalEur: { low: 400, high: 800 },
  breakdown: {
    accommodation: { lowEur: 150, highEur: 350 },
    food: { lowEur: 150, highEur: 250 },
    transport: { lowEur: 60, highEur: 120 },
    activities: { lowEur: 40, highEur: 80 },
  },
};

test("sleep moves the bed line, spending moves the rest", () => {
  const p = tripPrice(budget, { sleepShare: 0, spendShare: 1 });
  assert.equal(p.rows.accommodation, 150);
  assert.equal(p.rows.food, 250);
  assert.equal(p.perPerson, 150 + 250 + 120 + 80);
});

test("the party multiplies a person and the own fare is added once", () => {
  const p = tripPrice(budget, { sleepShare: 0.5, spendShare: 0.5, party: 3, fare: 240.5, days: 7 });
  assert.equal(p.perPerson, 250 + 200 + 90 + 60);
  assert.equal(p.total, 600 * 3 + 240.5);
  assert.equal(p.perDay, Math.round(600 / 7));
});

test("a budget with no lines falls back to its total", () => {
  assert.equal(tripPrice({ totalEur: { low: 300, high: 500 } }, { spendShare: 0.5 }).perPerson, 400);
  assert.equal(tripPrice(null), null);
});

test("what is included says the travel to the start is not, until it is added", () => {
  const trip = { budget };
  assert.equal(includedRows(trip).find((r) => r.key === "travel").in, false);
  assert.equal(includedRows(trip, { fare: 120 }).find((r) => r.key === "travel").in, true);
  assert.equal(includedRows({ ...trip, included: ["Ferry tickets"], notIncluded: ["Flights"] }).length, 2);
});

// T474 (row T435-c): the page has no sliders of its own; the traveller's one
// Lifestyle places the week on its written ranges.
test("the way to sleep runs from the simplest bed to a hotel", () => {
  assert.equal(lifestyleShares(PROFILES.Easygoing, "dorm").sleepShare, 0);
  assert.equal(lifestyleShares(PROFILES.Easygoing, "hotel4").sleepShare, 1);
  const home = lifestyleShares(PROFILES.Easygoing, "home").sleepShare;
  const priv = lifestyleShares(PROFILES.Easygoing, "private").sleepShare;
  assert.ok(priv > 0 && priv < home && home < 1);
  // a tier the panel does not know lands where the panel shows it, the entire place
  assert.equal(lifestyleShares(null, "nonsense").sleepShare, home);
});

test("the habits run from the thriftiest preset to the most generous", () => {
  const shares = Object.fromEntries(Object.entries(PROFILES).map(([k, ls]) => [k, lifestyleShares(ls, "home").spendShare]));
  assert.equal(Math.min(...Object.values(shares)), 0);
  assert.equal(Math.max(...Object.values(shares)), 1);
  assert.equal(shares.Backpacker, 0);
  assert.ok(shares.Easygoing > shares.Backpacker && shares.Easygoing < 1);
  for (const v of Object.values(shares)) assert.ok(v >= 0 && v <= 1);
});

test("a changed Lifestyle moves the week and never leaves its written range", () => {
  const thrifty = tripPrice(budget, lifestyleShares(PROFILES.Backpacker, "dorm"));
  const generous = tripPrice(budget, lifestyleShares(PROFILES.Nightlife, "hotel"));
  assert.equal(thrifty.perPerson, 150 + 150 + 60 + 40);
  assert.equal(generous.perPerson, 350 + 250 + 120 + 80);
  const mid = tripPrice(budget, lifestyleShares(PROFILES.Easygoing, "home"));
  assert.ok(mid.perPerson > thrifty.perPerson && mid.perPerson < generous.perPerson);
});
