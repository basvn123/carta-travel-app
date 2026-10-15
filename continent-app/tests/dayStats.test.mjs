// T431: one reader for a trip day's figures. Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { dayStatsOf, weekStats, highOf, minutesOfLine } from "../src/lib/dayStats.js";

test("a written line gives distance, climb, drop, high point and hours", () => {
  const d = dayStatsOf({ title: "Summit day", dayStats: "12 km / 700 m ascent / 1,400 m descent / summit 2,942 m / 6 h 30 min-7 h 30 min realistic" }, "hiking");
  assert.equal(d.km, 12);
  assert.equal(d.up, 700);
  assert.equal(d.down, 1400);
  assert.equal(d.high, 2942);
  assert.equal(d.minutes, 450);
});

test("heights skip climbs, drops and areas", () => {
  assert.equal(highOf("18 km / 250 m ascent / 1,400 m descent / Madriu valley 42 km²"), null);
  assert.equal(highOf("Arinsal 1,550 m / refuge 2,260 m"), 2260);
});

test("hours come from the day, not from a transfer", () => {
  assert.equal(minutesOfLine("6 km of town walking / BCN 3 h 15 min"), null);
  assert.equal(minutesOfLine("14 km / 800 m ascent / 6-7 h realistic"), 420);
  assert.equal(minutesOfLine("8 km / 3 h realistic"), 180);
});

test("a typed line wins over the written one", () => {
  const d = dayStatsOf({ title: "Day", dayStats: "22 km", stats: { mode: "walk", distanceKm: 22, ascentM: 420, descentM: 470, highM: 660, timeMin: { low: 330, high: 330 } } }, "pilgrim");
  assert.deepEqual([d.km, d.up, d.down, d.high, d.minutes, d.mode], [22, 420, 470, 660, 330, "walk"]);
});

test("a city day has no high point", () => {
  assert.equal(dayStatsOf({ title: "Old town", dayStats: "6 km of town walking / Escaldes 1,100 m" }, "city").high, null);
});

test("the week adds up and names its hardest climb", () => {
  const w = weekStats({ tripTypeSlug: "hiking", itinerary: [
    { day: 1, title: "A", dayStats: "8 km / 450 m ascent / 3 h realistic" },
    { day: 2, title: "B", dayStats: "12 km / 900 m ascent / summit 2,713 m / 6 h realistic" },
    { day: 3, title: "Rest day", dayStats: "Rest" },
  ] });
  assert.equal(w.km, 20);
  assert.equal(w.up, 1350);
  assert.equal(w.high, 2713);
  assert.deepEqual(w.biggest, { day: 2, up: 900 });
  assert.equal(w.hoursMax, 6);
});
