// T433: every leg of a day judged before it is drawn. No leg the router
// could not walk is ever shown as a walk; a long leg is a walk with the bus
// offered; a stop far from any path is flagged on the stop.
// Run: npm test (continent-app/). The router is a stub: no network.
import test from "node:test";
import assert from "node:assert/strict";
import {
  routeDay, legStatus, routeSegments, dayChecks, isWalkable, PACE_LEG_KM,
} from "../src/lib/dayRoute.js";

const A = { lat: 48.2000, lon: 16.3700 };
const B = { lat: 48.2050, lon: 16.3750 }; // ~0.66 km from A
const C = { lat: 48.2300, lon: 16.4100 }; // ~4 km from B
const leg = (km, extra = {}) => ({ km, min: Math.round(km * 12), walkKm: km, walkMin: Math.round(km * 12), coords: [[0, 0], [1, 1]], ...extra });

test("an ordinary short leg is ok", () => {
  assert.equal(legStatus({ from: A, to: B, leg: leg(0.8), maxLegKm: 2.2 }), "ok");
});

test("no leg from the router is unrouted, never a walk", () => {
  const s = legStatus({ from: A, to: B, leg: null, maxLegKm: 2.2 });
  assert.equal(s, "unrouted");
  assert.equal(isWalkable(s), false);
});

test("a footpath far round the straight line is a detour, never a walk", () => {
  // 0.66 km apart, 5 km of path: a river with no bridge.
  const s = legStatus({ from: A, to: B, leg: leg(5), maxLegKm: 2.2 });
  assert.equal(s, "detour");
  assert.equal(isWalkable(s), false);
});

test("a winding hill path is still a walk, not a detour", () => {
  // 0.66 km apart, 1.6 km of switchbacks: under the 1.5 km extra.
  assert.equal(legStatus({ from: A, to: B, leg: leg(1.6), maxLegKm: 2.2 }), "ok");
});

test("a long leg stays a walk, flagged long", () => {
  const s = legStatus({ from: B, to: C, leg: leg(4.4), maxLegKm: PACE_LEG_KM.balanced });
  assert.equal(s, "long");
  assert.equal(isWalkable(s), true);
});

test("a stop beyond a day's reach from the start is a ride", () => {
  const far = { lat: 48.5, lon: 16.9 };
  assert.equal(legStatus({ from: A, to: far, leg: leg(50), maxLegKm: 2.2, start: A }), "far");
});

test("routeDay judges each leg and counts only walkable kilometres", async () => {
  // A to B a short walk; B to C 12 km of path for ~4 km of crow flight.
  const stub = async (pts) => ({ legs: [leg(0.9), leg(12)], snapM: pts.map(() => 20) });
  const day = await routeDay([B, C], { start: A, fetchRoute: stub });
  assert.equal(day.legs.length, 2);
  assert.equal(day.legs[0].status, "ok");
  assert.equal(day.legs[1].status, "detour");
  assert.equal(day.checked, true);
  assert.equal(day.walkKm, 0.9);
});

test("offline: not one leg routed means not checked", async () => {
  const day = await routeDay([{ lat: 50.1, lon: 4.1 }, { lat: 50.11, lon: 4.11 }], {
    start: null, fetchRoute: async () => null,
  });
  assert.equal(day.checked, false);
  assert.ok(day.legs.every((l) => l.status === "unrouted"));
  assert.ok(routeSegments(day).every((s) => s.mode === "ride"));
});

test("a stop far from any path is flagged on the stop", async () => {
  const stub = async (pts) => ({ legs: pts.slice(1).map(() => leg(0.7)), snapM: pts.map((_, i) => (i === 2 ? 900 : 10)) });
  const day = await routeDay([{ lat: 51.01, lon: 3.01 }, { lat: 51.015, lon: 3.015 }], {
    start: { lat: 51.0, lon: 3.0 }, fetchRoute: stub,
  });
  assert.deepEqual(day.offPath, [null, 900]);
});

test("a day that starts with a ride does not route the first hop on foot", async () => {
  let asked = 0;
  const stub = async (pts) => { asked = pts.length; return { legs: pts.slice(1).map(() => leg(0.5)), snapM: [] }; };
  await routeDay([{ lat: 52.0, lon: 5.0 }, { lat: 52.004, lon: 5.004 }], {
    start: { lat: 51.9, lon: 4.9 }, startsAtStart: false, fetchRoute: stub,
  });
  assert.equal(asked, 2);
});

test("segments: walk for walkable legs, ride for the rest", () => {
  const segs = routeSegments({ legs: [
    { status: "ok", coords: [[0, 0], [0.5, 0.5], [1, 1]] },
    { status: "detour", coords: [[1, 1], [3, 3], [2, 2]] },
  ] });
  assert.equal(segs[0].mode, "walk");
  assert.equal(segs[1].mode, "ride");
  assert.equal(segs[1].coordinates.length, 2);
});

test("day checks catch a place twice, a place with no position, a late finish", () => {
  const c = dayChecks([
    { name: "Dom", lat: 1, lon: 1 }, { name: "Dom", lat: 1, lon: 1 }, { name: "x" },
  ], { endMin: 19 * 60, backBy: 18 * 60 });
  assert.deepEqual(c.dupes, [1]);
  assert.deepEqual(c.unplaced, [2]);
  assert.equal(c.late, true);
});

test("a stop a kilometre from any path makes its legs unreachable, never a walk", async () => {
  // A seabed reserve: OSRM snaps it to a path 1.4 km away and calls the leg
  // short; it is not a place anybody walks to.
  const stub = async (pts) => ({ legs: pts.slice(1).map(() => leg(0.8)), snapM: pts.map((_, i) => (i === 2 ? 1400 : 10)) });
  const day = await routeDay([{ lat: 44.1, lon: 9.7 }, { lat: 44.105, lon: 9.705 }, { lat: 44.11, lon: 9.71 }], {
    start: { lat: 44.098, lon: 9.698 }, fetchRoute: stub,
  });
  assert.equal(day.legs[1].status, "unreachable");
  assert.equal(day.legs[2].status, "unreachable");
  assert.equal(day.legs[0].status, "ok");
  assert.equal(isWalkable("unreachable"), false);
});
