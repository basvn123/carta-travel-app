// T675: stays read from uploaded bookings become the engine's Your stays rows.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { staysFromImports, nearestStop, arrivalFromImports } from "../src/planner/flow/importStays.js";

const destinations = {
  lis: { city: "Lisbon", rating: { score: 80 } },
  lis2: { city: "Lisbon", rating: { score: 20 } },
  opo: { city: "Porto (OPO)", rating: { score: 70 } },
  far: { city: "Faro" },
};

test("nights run to the next check-in, the last to the trip's end", () => {
  const rows = staysFromImports([
    { kind: "stay", city: "Porto", date: "2027-05-14", eur: 310 },
    { kind: "flight_out", city: "Lisbon", date: "2027-05-10", eur: 90 },
    { kind: "stay", city: "lisbon", date: "2027-05-10", eur: 420.4 },
  ], destinations, { end: "2027-05-17", nights: 7 });
  assert.deepEqual(rows, [{ id: "lis", nights: 4, eur: 420 }, { id: "opo", nights: 3, eur: 310 }]);
});

test("no dates: an even share of the trip's nights; one town twice is one stop", () => {
  const rows = staysFromImports([
    { kind: "stay", city: "Faro", date: "", eur: null },
    { kind: "stay", city: "Faro", date: "", eur: 100 },
  ], destinations, { nights: 6 });
  assert.deepEqual(rows, [{ id: "far", nights: 6, eur: 100 }]);
});

test("a town the catalogue lacks is left out, not guessed", () => {
  assert.deepEqual(staysFromImports([{ kind: "stay", city: "Atlantis", date: "2027-05-10" }], destinations, {}), []);
  assert.deepEqual(staysFromImports(null, destinations), []);
});

test("the town a traveller is in: the nearest within reach, else none", () => {
  const ds = { opo: { city: "Porto", lat: 41.15, lon: -8.61 }, bra: { city: "Braga", city_lat: 41.55, city_lon: -8.42 } };
  assert.equal(nearestStop({ lat: 41.18, lng: -8.6 }, ds), "opo");
  assert.equal(nearestStop({ lat: 41.5, lng: -8.45 }, ds), "bra");
  assert.equal(nearestStop({ lat: 38.7, lng: -9.1 }, ds), null);
  assert.equal(nearestStop(null, ds), null);
});

test("an uploaded flight out names where the trip lands", () => {
  assert.equal(arrivalFromImports([
    { kind: "flight_home", city: "Porto", date: "2027-05-17" },
    { kind: "flight_out", city: "Lisbon", date: "2027-05-10" },
  ], destinations), "lis");
  assert.equal(arrivalFromImports([{ kind: "flight", city: "Faro" }], destinations), "far");
  assert.equal(arrivalFromImports([{ kind: "flight_out", city: "Atlantis" }], destinations), "");
});
