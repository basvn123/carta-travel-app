// T459: picks to days. A town's places fill a day before a second one opens,
// so a pick in another town never shuffles the places already on a day.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { buildDays } from "../src/planner/dayBuild.js";

const START = { lat: 51.0573, lon: 3.7236 };
const pos = { GNT: { lat: 51.054, lon: 3.72 }, BRG: { lat: 51.209, lon: 3.224 } };
const pick = (destId, idx, lat, lon, minutes = 60) => ({ destId, idx, lat, lon, minutes, name: `${destId}${idx}` });
const ghent = [pick("GNT", 1, 51.0566, 3.7253), pick("GNT", 2, 51.0573, 3.7208)];
const bruges = [pick("BRG", 1, 51.2047, 3.2247), pick("BRG", 2, 51.2052, 3.2268)];

test("two places in one town over two days share the first day", () => {
  const b = buildDays({ picks: ghent, dayCount: 2, homeId: "GNT", townPos: (id) => pos[id], start: START });
  assert.equal(b.days.length, 2);
  assert.equal(b.days[0].picks.length, 2);
  assert.equal(b.days[1].picks.length, 0);
});

test("a second town takes the second day and leaves the first alone", () => {
  const b = buildDays({ picks: [...ghent, ...bruges], dayCount: 2, homeId: "GNT", townPos: (id) => pos[id], start: START });
  assert.deepEqual(b.days.map((d) => d.destId), ["GNT", "BRG"]);
  assert.deepEqual(b.days[0].picks.map((p) => p.idx).sort(), [1, 2]);
  assert.equal(b.stops.length, 2);
});

test("a full day of visits opens the next day, and nothing is lost", () => {
  const many = Array.from({ length: 8 }, (_, i) => pick("GNT", i, 51.05 + i * 0.002, 3.72 + i * 0.002, 90));
  const b = buildDays({ picks: many, dayCount: 3, homeId: "GNT", townPos: (id) => pos[id], start: START });
  assert.equal(b.days.length, 3);
  assert.equal(b.days.flatMap((d) => d.picks).length, 8);
  assert.ok(b.days.filter((d) => d.picks.length).length >= 2, "720 minutes stayed on one day");
});
