// T487: a day as Google Maps links that keep every stop. A phone's browser
// takes 3 stops between the start and the end of a link.
// Run: npm test (continent-app/). No network.
import test from "node:test";
import assert from "node:assert/strict";
import { googleMapsDirParts, GMAPS_STOPS_PHONE } from "../src/lib/routing.js";

const pts = (n) => Array.from({ length: n }, (_, i) => ({ lat: 45 + i / 100, lon: 9 + i / 100, city: `S${i}` }));
const stopsIn = (url) => {
  const q = new URL(url).searchParams;
  return [q.get("origin"), ...(q.get("waypoints") ? q.get("waypoints").split("|") : []), q.get("destination")];
};

test("five points fit one phone link", () => {
  const parts = googleMapsDirParts(pts(5), "walking", GMAPS_STOPS_PHONE);
  assert.equal(parts.length, 1);
  assert.equal(stopsIn(parts[0].url).length, 5);
});

test("eleven points on a phone: three parts, each ends where the next begins, none dropped", () => {
  const all = pts(11);
  const parts = googleMapsDirParts(all, "walking", GMAPS_STOPS_PHONE);
  assert.equal(parts.length, 3);
  for (const p of parts) assert.ok(stopsIn(p.url).length <= GMAPS_STOPS_PHONE + 2);
  for (let i = 1; i < parts.length; i++) assert.equal(parts[i].from, parts[i - 1].to);
  const walked = parts.flatMap((p, i) => stopsIn(p.url).slice(i ? 1 : 0));
  assert.deepEqual(walked, all.map((p) => `${p.lat},${p.lon}`));
  assert.equal(parts[2].to.city, "S10");
});

test("the desktop link keeps up to nine stops, and fewer than two points give nothing", () => {
  assert.equal(googleMapsDirParts(pts(11)).length, 1);
  assert.equal(googleMapsDirParts(pts(12)).length, 2);
  assert.deepEqual(googleMapsDirParts(pts(1)), []);
  assert.deepEqual(googleMapsDirParts([{ lat: NaN, lon: 1 }, { lat: 1, lon: 1 }]), []);
});
