// T058-a: the planner's round flight resolves its airports the same way as
// Explore's composeTrip: the stop's own route, else a served airport within
// reach. T511 removed the fares, so no flight figure is left in the result.
// Run: npm test  (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { combineTripLegs, ownFlightTransfers } from "../src/lib/trip_planner_pricing.js";

const rec = (extra = {}) => ({
  anchor_airport: "AAA",
  ground_transport_one_way_eur: 0,
  ground_transport_minutes: 0,
  ...extra,
});
const served = (id, lat, lon, routes) => ({ id, iata: id.toUpperCase(), city: id, lat, lon, routes });
const dests = {
  a: served("a", 45, 5, { BRU: rec() }),
  // Unserved town about 60 km from a, no routes of its own.
  town: { id: "town", city: "town", lat: 45.5, lon: 5.3, routes: {} },
};

test("an unserved town flies into the nearest served airport when the catalogue is given", () => {
  const without = combineTripLegs(dests.town, "2026-11-10", dests.town, "2026-11-17");
  assert.equal(without.combinable, false);
  const r = combineTripLegs(dests.town, "2026-11-10", dests.town, "2026-11-17", 1, null, { allDests: dests });
  assert.equal(r.combinable, true);
  assert.equal(r.into_via.id, "a");
  assert.ok(r.into_ground_eur > 0);
});

// T273, then T511: the planner keeps the route and the airport transfers and
// carries no flight figure at all.
test("combineTripLegs keeps the route and carries no flight figure", () => {
  const r = combineTripLegs(dests.town, "2026-11-10", dests.town, "2026-11-17", 2, null, { allDests: dests });
  assert.equal(r.combinable, true);
  assert.equal(r.priced, false);
  assert.equal(r.origin, "BRU");
  assert.equal(r.into_anchor, "AAA");
  assert.equal(r.into_via.id, "a");
  assert.ok(r.ground_total > 0);
  for (const k of ["into_fare_eur", "out_of_fare_eur", "fare_per_person", "fare_total", "bag_total", "grand_total", "into_prov", "out_of_prov",
    "into_carrier", "out_of_carrier", "into_time", "out_of_time"]) {
    assert.equal(k in r, false, k);
  }
});

// T278: a fare the traveller typed still lands at an airport. The ids drive
// the airport-to-stop legs; the airport-to-centre hop is taken from the routed
// flight only where both use the same airport.
test("ownFlightTransfers keeps the airports and the shared airport transfer", () => {
  const routed = { ...combineTripLegs(dests.town, "2026-11-10", dests.town, "2026-11-17", 2, null, { allDests: dests }), in_from_id: "town", out_from_id: "town" };
  const same = ownFlightTransfers(routed, dests.town, dests.town, 2);
  assert.equal(same.in_from_id, "town");
  assert.ok(same.into_ground_eur > 0);
  assert.equal(same.ground_total, Math.round((same.into_ground_eur + same.out_ground_eur) * 2 * 100) / 100);
  // Landing somewhere else: the ids move, the routed transfer does not follow.
  const other = ownFlightTransfers(routed, dests.a, dests.town, 2);
  assert.equal(other.in_from_id, "a");
  assert.equal(other.into_ground_eur, 0);
  assert.equal(other.out_ground_eur, same.out_ground_eur);
  // No routed flight at all: airports only, nothing priced.
  const bare = ownFlightTransfers({ combinable: false }, dests.a, dests.a, 2);
  assert.equal(bare.ground_total, 0);
  assert.equal(bare.out_from_id, "a");
});
