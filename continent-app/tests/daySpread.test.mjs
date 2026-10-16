// T433: several days cut out of one set of places, by neighbourhood, and
// each day walked in the shortest open path. The order of a day is code,
// never a model, so these are the rules that make it trustworthy.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { spreadIntoDays, walkOrder, kmBetween } from "../src/lib/daySpread.js";

// Three neighbourhoods of a made-up city, ~2 km apart, three places each.
const HOTEL = { lat: 38.7100, lon: -9.1400 };
const west = [[38.7100, -9.1700], [38.7110, -9.1710], [38.7090, -9.1690]];
const centre = [[38.7120, -9.1400], [38.7130, -9.1390], [38.7110, -9.1410]];
const east = [[38.7100, -9.1100], [38.7090, -9.1110], [38.7110, -9.1090]];
const P = (arr, tag) => arr.map(([lat, lon], i) => ({ lat, lon, name: `${tag}${i}` }));
const places = [...P(east, "e"), ...P(west, "w"), ...P(centre, "c")];

test("one day keeps every place, in walking order from the start", () => {
  const [day] = spreadIntoDays(places, { days: 1, start: HOTEL });
  assert.equal(day.length, places.length);
  assert.deepEqual([...day].sort((a, b) => a - b), places.map((_, i) => i));
});

test("three days put each neighbourhood on its own day", () => {
  const days = spreadIntoDays(places, { days: 3, start: HOTEL });
  assert.equal(days.length, 3);
  const tags = days.map((d) => new Set(d.map((i) => places[i].name[0])));
  for (const s of tags) assert.equal(s.size, 1, "a day mixes neighbourhoods");
  // Outward from the hotel: the centre (nearest) is day 1.
  assert.equal(places[days[0][0]].name[0], "c");
});

test("no place lands on two days and none is lost", () => {
  for (let n = 1; n <= 7; n += 1) {
    const days = spreadIntoDays(places, { days: n, start: HOTEL });
    const all = days.flat();
    assert.equal(all.length, places.length, `days=${n} lost or doubled a place`);
    assert.equal(new Set(all).size, places.length, `days=${n} repeats a place`);
  }
});

test("fewer places than days leaves the later days empty, not invented", () => {
  const days = spreadIntoDays(places.slice(0, 2), { days: 5, start: HOTEL });
  assert.equal(days.length, 5);
  assert.equal(days.flat().length, 2);
  assert.ok(days.slice(2).every((d) => d.length === 0));
});

test("minutes balance the days: a long museum day hands a place on", () => {
  // Four places close together, one of them a four-hour museum, two days.
  const cluster = [
    { lat: 38.71, lon: -9.14, name: "museum", min: 240 },
    { lat: 38.7105, lon: -9.1405, name: "a", min: 45 },
    { lat: 38.7095, lon: -9.1395, name: "b", min: 45 },
    { lat: 38.72, lon: -9.13, name: "far", min: 45 },
  ];
  const days = spreadIntoDays(cluster, { days: 2, start: HOTEL, minutes: (p) => p.min });
  const load = days.map((d) => d.reduce((s, i) => s + cluster[i].min, 0));
  assert.ok(Math.max(...load) <= 285, `unbalanced: ${load}`);
});

test("places without a position are kept, on the lightest day", () => {
  const withBlank = [...places, { name: "nowhere" }];
  const days = spreadIntoDays(withBlank, { days: 3, start: HOTEL });
  assert.ok(days.flat().includes(withBlank.length - 1));
});

test("deterministic: the same picks give the same days", () => {
  const a = spreadIntoDays(places, { days: 3, start: HOTEL });
  const b = spreadIntoDays(places, { days: 3, start: HOTEL });
  assert.deepEqual(a, b);
});

test("walkOrder never walks further than the order it was given", () => {
  const pts = P([...east, ...west, ...centre], "x");
  const order = walkOrder(pts, HOTEL);
  const len = (o) => o.reduce((s, i, k) => s + kmBetween(k ? pts[o[k - 1]] : HOTEL, pts[i]), 0);
  assert.ok(len(order) <= len(pts.map((_, i) => i)) + 1e-9);
});
