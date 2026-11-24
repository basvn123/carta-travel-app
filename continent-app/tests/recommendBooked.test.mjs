// G12 L10 (plan rethink, decision §3.5 step 2): the trip finder honours what
// is booked. Booked dates are fixed, a booked flight's arrival town drives
// the places, and a booked stay is a stop of every trip with its own nights.
// A small made-up catalogue, so the test runs without public/.
// Run: node --test tests/recommendBooked.test.mjs (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { bookedFixes, bookedPool, buildCandidates } from "../src/lib/recommend/candidates.js";
import { normalizeSettings, fromImports } from "../src/planner/flow/tripSettings.js";

const img = { url: "https://example.org/x.jpg" };
const place = (id, city, iso2, lat, lon, score, extra = {}) => ({
  id, city, country: iso2 === "PT" ? "Portugal" : "Spain", iso2, lat, lon, image: img, rating: { score }, ...extra,
});
// Lisbon, Sintra (25 km), Setubal (35 km), Evora (110 km), Porto (275 km), Seville (Spain, 310 km).
const destinations = {
  lis: place("lis", "Lisbon", "PT", 38.72, -9.14, 8, { anchor_iata: "LIS" }),
  sin: place("sin", "Sintra", "PT", 38.80, -9.38, 7),
  set: place("set", "Setubal", "PT", 38.52, -8.89, 6),
  evo: place("evo", "Evora", "PT", 38.57, -7.91, 7.5),
  opo: place("opo", "Porto", "PT", 41.15, -8.61, 8.5),
  svq: place("svq", "Seville", "ES", 37.39, -5.98, 9),
};
const data = { destinations, meta: {} };

const settingsWith = (imports, over = {}) => fromImports(normalizeSettings({
  answered: ["who"], party: { kind: "couple", adults: 2 }, guide: { shapes: ["one", "towns"] }, ...over,
}), imports);

test("a booked flight out and home fixes the dates; the arrival town is the flight's", () => {
  const s = settingsWith([
    { kind: "flight_out", city: "Lisbon", date: "2027-05-09", title: "TP" },
    { kind: "flight_home", city: "Brussels", date: "2027-05-16", title: "TP" },
  ]);
  const f = bookedFixes(s, destinations);
  assert.deepEqual(f.dates, { out: "2027-05-09", back: "2027-05-16", nights: 7 });
  assert.equal(f.arrival, "lis");
  assert.equal(f.flights, true);
  assert.deepEqual(f.stays, []);
});

test("nothing booked fixes nothing", () => {
  assert.equal(bookedFixes(normalizeSettings({}), destinations), null);
});

test("the pool around an arrival is the town first, then rated places in reach, never far ones", () => {
  const pool = bookedPool("lis", destinations);
  assert.equal(pool[0], "lis");
  assert.ok(pool.includes("sin") && pool.includes("evo"));
  assert.ok(!pool.includes("opo") && !pool.includes("svq"), "Porto and Seville are beyond the few-towns reach");
});

test("the finder builds only around the arrival, on the booked dates, flying into it", () => {
  const s = settingsWith([
    { kind: "flight_out", city: "Lisbon", date: "2027-05-09" },
    { kind: "flight_home", city: "Lisbon", date: "2027-05-16" },
  ]);
  const cands = buildCandidates({ data, settings: s, today: "2026-11-24" });
  assert.ok(cands.length >= 2, `built ${cands.length}`);
  for (const c of cands) {
    assert.deepEqual(c.dates, { out: "2027-05-09", back: "2027-05-16" });
    assert.equal(c.month, 5);
    assert.equal(c.nights, 7);
    assert.equal(c.gateway.placeId, "lis");
    assert.equal(c.gateway.booked, true);
    for (const p of c.places) assert.ok(!["opo", "svq"].includes(p.id), `${p.id} is not near the arrival`);
  }
});

test("a booked stay pins its town and nights on every trip", () => {
  const s = settingsWith([
    { kind: "flight_out", city: "Lisbon", date: "2027-05-09" },
    { kind: "stay", city: "Lisbon", date: "2027-05-09" },
    { kind: "stay", city: "Evora", date: "2027-05-12" },
    { kind: "flight_home", city: "Lisbon", date: "2027-05-19" },
  ]);
  const f = bookedFixes(s, destinations);
  assert.deepEqual(f.stays, [{ id: "lis", nights: 3 }, { id: "evo", nights: 7 }]);
  const cands = buildCandidates({ data, settings: s, today: "2026-11-24" });
  assert.ok(cands.length >= 1);
  for (const c of cands) {
    assert.deepEqual(c.places.slice(0, 2), [{ id: "lis", nights: 3 }, { id: "evo", nights: 7 }]);
    assert.equal(c.places.reduce((n, p) => n + p.nights, 0), 10);
    assert.deepEqual(c.dates, { out: "2027-05-09", back: "2027-05-19" });
  }
});

test("a stay that prints no end runs to the trip's end, and is the whole trip", () => {
  const s = settingsWith([
    { kind: "stay", city: "Lisbon", date: "2027-06-01" },
  ], { when: { mode: "exact", start: "2027-06-01", end: "2027-06-08", nights: 7 }, answered: ["who", "when"] });
  // The stay prints no end: it runs to the trip's end, so nothing is left open.
  const f = bookedFixes(s, destinations);
  assert.deepEqual(f.stays, [{ id: "lis", nights: 7 }]);
  const cands = buildCandidates({ data, settings: s, today: "2026-11-24" });
  assert.deepEqual(cands.map((c) => c.places), [[{ id: "lis", nights: 7 }]]);
});
