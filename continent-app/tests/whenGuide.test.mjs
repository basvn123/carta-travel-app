// T1022: When to go, worked out (src/lib/whenGuide.js).
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { monthsOf, whenVerdict, stayByMonth, stayKindsOf, crowdStanding } from "../src/lib/whenGuide.js";

// Rome's climate normals [high, low, rain mm, comfort] and monthly crowd tiers.
const CLIMATE = { best: [4, 5], m: [
  [12, 4.1, 73, 39], [13, 4, 79, 42], [16, 7, 69, 55], [20, 10, 56, 80], [24, 14, 57, 84], [29, 18, 34, 70],
  [32.9, 21.1, 26, 63], [33, 21, 26, 60], [28, 17, 70, 72], [23, 13, 82, 66], [17, 10, 114, 47], [13, 5, 91, 40],
] };
const CROWD = { nights_per_km2: 10390, monthly: { tier: [1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2] } };

test("T1022: Rome's months carry comfort and crowd tiers", () => {
  const m = monthsOf(CLIMATE, CROWD);
  assert.equal(m.length, 12);
  assert.deepEqual(m[4], { month: 5, hi: 24, lo: 14, rain: 57, tier: "great", crowd: 3 });
  assert.equal(m[0].tier, "poor");
  assert.equal(monthsOf({ m: [] }, CROWD), null);
  assert.equal(monthsOf(CLIMATE, null)[0].crowd, null);
});

test("T1022: the verdict names the best months, hot and packed ones, and cold ones", () => {
  const v = whenVerdict(monthsOf(CLIMATE, CROWD), CLIMATE.best);
  assert.deepEqual(v.best, [4, 5]);
  assert.deepEqual(v.range, { lo: 20, hi: 24 });
  assert.deepEqual(v.hot, [7, 8]);
  assert.deepEqual(v.cold, [1, 2, 12]);
  assert.deepEqual(v.quieter, [], "every other pleasant month in Rome is busy");
});

test("T1022: a pleasant quiet month is offered as the quieter choice", () => {
  const crowd = { monthly: { tier: [0, 0, 1, 3, 3, 2, 3, 3, 1, 1, 0, 0] } };
  const v = whenVerdict(monthsOf(CLIMATE, crowd), CLIMATE.best);
  assert.deepEqual(v.quieter, [9, 10]);
});

const REC = {
  season_q: "mfmfmffmfmff",
  month: {
    dorm: [27, 27, 28, 28, 40, 40, 72, 72, 72, 76, 76, 76],
    hotel3: [113, 113, 129, 129, 139, 139, 129, 129, 129, 129, 129, 129],
    bnb_home: [134, 134, 134, 134, 134, 134, 134, 134, 134, 134, 134, 134],
  },
};

test("T1022: stay prices by month show only the scraped months", () => {
  const h = stayByMonth(REC, "hotel");
  assert.equal(h.tier, "hotel3");
  assert.deepEqual(h.values, [113, null, 129, null, 139, null, null, 129, null, 129, null, null]);
  assert.deepEqual([h.lo, h.hi, h.cheap, h.dear, h.flat], [113, 139, [1], [5], false]);
  const home = stayByMonth(REC, "home");
  assert.equal(home.flat, true);
  assert.equal(stayByMonth(REC, "nothing"), null);
  assert.equal(stayByMonth({ season_q: "ffffffffffff", month: REC.month }, "hotel"), null, "no scraped month, no figure");
  assert.deepEqual(stayKindsOf(REC), ["hostel", "hotel", "home"]);
  assert.deepEqual(stayKindsOf(null), []);
});

test("T1022: the crowd standing is the share of places with fewer nights", () => {
  const all = { A: { crowding: { nights_per_km2: 10 } }, B: { crowding: { nights_per_km2: 500 } },
    C: { crowding: { nights_per_km2: 10390 } }, D: {} };
  assert.equal(crowdStanding("C", all), 1);
  assert.equal(crowdStanding("A", all), 0);
  assert.equal(crowdStanding("D", all), null);
});
