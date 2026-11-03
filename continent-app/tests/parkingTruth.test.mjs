import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parkingTruth } from "../src/lib/parkingTruth.js";

const park = (id) => JSON.parse(readFileSync(new URL(`../public/dossier/${id}.json`, import.meta.url), "utf8")).parking;

test("Rome: the zone, the four park-and-rides, no surface lot inside the zone (T1030)", () => {
  const r = parkingTruth(park("FCO"));
  assert.equal(r.restricted, true);
  assert.deepEqual(r.rides.map((x) => x.name), ["Anagnina", "Laurentina", "Battistini", "Cipro"]);
  assert.equal(r.spots.length, 0);
  // Trastevere sits 1.45 km from the centre: a station car park, not a P+R.
  assert.ok(!r.rides.some((x) => /trastevere/i.test(x.name)));
});

test("Amsterdam: the underground garages stay inside the zone", () => {
  const r = parkingTruth(park("AMS"));
  assert.ok(r.spots.length > 0);
  assert.ok(r.spots.every((s) => s.type === "underground"));
});

test("Hallstatt: no street bay, no coach park", () => {
  const r = parkingTruth(park("gem-hallstatt"));
  assert.equal(r.spots.length, 0);
  assert.deepEqual(r.named.map((x) => x.name), ["P1", "P2", "P3"]);
});

test("filters: park-and-rides filed as car parks, street names, unnamed and small spots", () => {
  const r = parkingTruth({
    web: { restricted: false, park_ride_names: ["P+R Zuid"], car_parks: [{ name: "P+R Noord" }, { name: "Viale Carlo" }, { name: "Garage Centrum" }] },
    spots: [{ capacity: 300, type: "underground" }, { name: "Tiny", capacity: 8, type: "surface" }, { name: "Bay", capacity: 90, type: "street_side" }, { name: "Big", capacity: 400, type: "surface" }],
    park_ride: { name: "Close", dist_m: 900 },
  });
  assert.deepEqual(r.named.map((x) => x.name), ["Garage Centrum"]);
  assert.deepEqual(r.spots.map((x) => x.name), ["Big"]);
  assert.deepEqual(r.rides.map((x) => x.name), ["P+R Zuid"]);
  assert.equal(parkingTruth({ web: { restricted: false }, spots: [] }), null);
});
