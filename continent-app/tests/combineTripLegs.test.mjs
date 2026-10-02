// T058-a: the planner's round flight takes the same three steps as Explore's
// planeFare: a stored day, a served airport within reach, then the month
// band. Run: npm test  (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { combineTripLegs, unpricedFlight } from "../src/lib/trip_planner_pricing.js";

const rec = (extra = {}) => ({
  anchor_airport: "AAA",
  outbound_fare: { "2026-11-10": 30 },
  return_fare: { "2026-11-17": 40 },
  outbound_time: {}, return_time: {}, outbound_carrier: {}, return_carrier: {},
  s: "FR", o: 20400,
  ...extra,
});
const served = (id, lat, lon, routes) => ({ id, iata: id.toUpperCase(), city: id, lat, lon, routes });
const dests = {
  a: served("a", 45, 5, { BRU: rec() }),
  // Unserved town about 60 km from a, no routes of its own.
  town: { id: "town", city: "town", lat: 45.5, lon: 5.3, routes: {} },
};

test("stored days win and carry the record source and age", () => {
  const r = combineTripLegs(dests.a, "2026-11-10", dests.a, "2026-11-17");
  assert.equal(r.combinable, true);
  assert.equal(r.fare_estimated, false);
  assert.deepEqual(r.into_prov, { s: "FR", o: 20400 });
  assert.deepEqual(r.out_of_prov, { s: "FR", o: 20400 });
});

test("a carrier tag on the day replaces the record source", () => {
  const d = served("b", 45, 5, { BRU: rec({ outbound_carrier: { "2026-11-10": "W6" } }) });
  const r = combineTripLegs(d, "2026-11-10", d, "2026-11-17");
  assert.equal(r.into_prov.s, "W6");
  assert.equal(r.out_of_prov.s, "FR");
});

test("an unserved town flies into the nearest served airport when the catalogue is given", () => {
  const without = combineTripLegs(dests.town, "2026-11-10", dests.town, "2026-11-17");
  assert.equal(without.combinable, false);
  const r = combineTripLegs(dests.town, "2026-11-10", dests.town, "2026-11-17", 1, "cabin", null, { allDests: dests });
  assert.equal(r.combinable, true);
  assert.equal(r.into_via.id, "a");
  assert.ok(r.into_ground_eur > 0);
});

test("a date with no stored day prices the band only when estimates are asked for", () => {
  const d = served("c", 45, 5, { BRU: rec({ outbound_estimate: { "2026-12": 55 }, return_estimate: { "2026-12": 60 } }) });
  assert.equal(combineTripLegs(d, "2026-12-05", d, "2026-12-12").reason, "no_fare_for_date");
  const r = combineTripLegs(d, "2026-12-05", d, "2026-12-12", 1, "cabin", null, { estimates: true });
  assert.equal(r.combinable, true);
  assert.equal(r.fare_estimated, true);
  assert.equal(r.fare_per_person, 115);
  assert.deepEqual(r.into_prov, { s: "EST", e: 1 });
});

// T273: Carta does not price flights. The planner keeps the route and the
// airport transfers and drops every flight figure.
test("unpricedFlight keeps the route and drops every flight figure", () => {
  const r = unpricedFlight(combineTripLegs(dests.town, "2026-11-10", dests.town, "2026-11-17", 2, "checked", null, { allDests: dests }));
  assert.equal(r.combinable, true);
  assert.equal(r.priced, false);
  assert.equal(r.origin, "BRU");
  assert.equal(r.into_via.id, "a");
  assert.ok(r.ground_total > 0);
  for (const k of ["into_fare_eur", "out_of_fare_eur", "fare_per_person", "fare_total", "bag_total", "grand_total", "into_prov", "out_of_prov"]) {
    assert.equal(k in r, false, k);
  }
  const none = { combinable: false, reason: "no_shared_origin" };
  assert.equal(unpricedFlight(none), none);
});
