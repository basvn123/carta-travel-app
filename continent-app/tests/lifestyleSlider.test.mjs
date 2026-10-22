// The trip page's Lifestyle slider of T173: the stops are the Lifestyle
// panel's sleep groups, and each stop places the receipt on the trip's own
// authored range. Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { offeredSleepGroups, optionsFor, tierForGroup } from "../src/lib/sleepGroups.js";
import { offeredStayTiers } from "../src/lib/runtime_pricing.js";
import { stopIndexFor, stopShare, between, tripFigures, sayKey } from "../src/lib/lifestyleSlider.js";

// The tiers a v18 dataset can price (meta.stays.tiers, written by apply_stays.py).
const MEASURED = { stays: { tiers: ["dorm", "private", "room", "home", "hotel2", "hotel3", "hotel4", "hotel5"] } };

// The Andorra hiking week's authored budget (public/journeys/journey/ad-hiking-coma-pedrosa-madriu.json).
const ANDORRA = {
  totalEur: { low: 780, high: 1250 },
  perDayEur: { low: 111, high: 179 },
  breakdown: {
    accommodation: { lowEur: 300, highEur: 470 },
    food: { lowEur: 190, highEur: 300 },
    transport: { lowEur: 160, highEur: 280 },
    activities: { lowEur: 130, highEur: 200 },
  },
};

test("the slider offers the panel's three kinds of stay, cheapest first", () => {
  const stops = offeredSleepGroups(offeredStayTiers(MEASURED));
  assert.deepEqual(stops.map((s) => s.key), ["hostel", "home", "hotel"]);
  // A hostel means a dorm bed, a home an entire place, a hotel 3 star, until somebody says otherwise.
  assert.deepEqual(stops[0].offered, ["dorm", "private"]);
  assert.deepEqual(stops[1].offered, ["home", "room"]);
  assert.deepEqual(stops[2].offered, ["hotel3", "hotel2", "hotel4", "hotel5"]);
  assert.deepEqual(optionsFor(stops[1]).map((o) => o.tier), ["room", "home"]);
  assert.deepEqual(optionsFor(stops[2]).map((o) => o.tier), ["hotel2", "hotel3", "hotel4", "hotel5"]);
});

test("with nothing measured there is one stop, so no slider", () => {
  assert.equal(offeredSleepGroups(offeredStayTiers(null)).length, 1);
  assert.equal(offeredSleepGroups(null).length, 0);
});

test("the stored tier picks its stop, and an unknown tier lands on the entire place", () => {
  const stops = offeredSleepGroups(offeredStayTiers(MEASURED));
  assert.equal(stopIndexFor(stops, "dorm"), 0);
  assert.equal(stopIndexFor(stops, "private"), 0);
  assert.equal(stopIndexFor(stops, "room"), 1);
  assert.equal(stopIndexFor(stops, "home"), 1);
  assert.equal(stopIndexFor(stops, "hotel4"), 2);
  assert.equal(stopIndexFor(stops, "castle"), 1);
  assert.equal(stopIndexFor([], "home"), -1);
});

test("moving to the hotel stop keeps a chosen grade and otherwise lands on 3 star", () => {
  const stops = offeredSleepGroups(offeredStayTiers(MEASURED));
  assert.equal(tierForGroup(stops[2], "hotel5"), "hotel5");
  assert.equal(tierForGroup(stops[2], "home"), "hotel3");
  assert.equal(tierForGroup(stops[0], "hotel5"), "dorm");
  assert.equal(tierForGroup(stops[1], "room"), "room");
});

test("stops sit evenly from the low end to the high end", () => {
  assert.equal(stopShare(0, 4), 0);
  assert.equal(stopShare(3, 4), 1);
  assert.ok(Math.abs(stopShare(1, 4) - 1 / 3) < 1e-9);
  assert.equal(stopShare(0, 1), 0.5);
});

test("between rounds to whole euros and survives a missing end", () => {
  assert.equal(between(780, 1250, 0.5), 1015);
  assert.equal(between(null, 1250, 0.5), 1250);
  assert.equal(between(780, undefined, 0.5), 780);
  assert.equal(between(null, null, 0.5), null);
});

test("the ends of the slider show the authored figures exactly", () => {
  const low = tripFigures(ANDORRA, 0);
  const high = tripFigures(ANDORRA, 1);
  assert.equal(low.total, 780);
  assert.equal(low.perDay, 111);
  assert.equal(low.rows.accommodation, 300);
  assert.equal(high.total, 1250);
  assert.equal(high.perDay, 179);
  assert.equal(high.rows.activities, 200);
});

test("the home, middle of three stops, sits half way along the range", () => {
  const f = tripFigures(ANDORRA, stopShare(1, 3));
  assert.equal(f.total, 1015);
  assert.equal(f.perDay, 145);
  assert.equal(f.rows.food, 245);
});

test("no per-day range means the total over the days", () => {
  const f = tripFigures({ totalEur: { low: 700, high: 1400 } }, 0.5, 7);
  assert.equal(f.total, 1050);
  assert.equal(f.perDay, 150);
  assert.equal(f.rows.food, null);
  assert.equal(tripFigures({}, 0.5), null);
});

test("every stop has its own sentence", () => {
  const keys = ["hostel", "home", "hotel"].map(sayKey);
  assert.equal(new Set(keys).size, 3);
  assert.equal(sayKey("castle"), "journey.lsSayHome");
});
