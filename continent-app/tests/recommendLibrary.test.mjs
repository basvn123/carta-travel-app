// G12 plan rethink, lane R6 (B7a): the "Van Carta" row behind Search more.
// Carta's own journeys join the list only once their route is placed on
// catalogue towns and priced by the same engine; a journey with no base
// towns is skipped (never invented towns); a ceiling holds; fewer than two
// trips and no row is drawn. Run: npm test (continent-app/). Pure, made-up catalogue.
import test from "node:test";
import assert from "node:assert/strict";
import { journeyStops, libraryCandidate, libraryShortlist, libraryTrips, ROW_MIN } from "../src/lib/recommend/moreSearch.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const DESTS = {
  LIS: { city: "Lisbon", iso2: "PT", country: "Portugal", city_lat: 38.72, city_lon: -9.14 },
  OPO: { city: "Porto", iso2: "PT", country: "Portugal", city_lat: 41.15, city_lon: -8.61 },
  SEV: { city: "Seville", iso2: "ES", country: "Spain", city_lat: 37.39, city_lon: -5.99 },
};
const day = (d, name, lat, lon) => ({ day: d, name, lat, lon });
const journey = (id, places, basecamps = ["Lisbon"]) => ({ id, title: `Trip ${id}`, country: "Portugal", countryCode: "PT", basecamps, dayPlaces: places });
const LISBON_PORTO = [day(1, "Lisbon", 38.72, -9.14), day(2, "Lisbon", 38.72, -9.14), day(3, "Lisbon", 38.72, -9.14), day(4, "Porto", 41.15, -8.61), day(5, "Porto", 41.15, -8.61), day(6, "Porto", 41.15, -8.61)];
const settings = (patch = {}) => normalizeSettings({ way: "train", ...patch });
const input = (s = settings()) => ({ settings: s, data: { destinations: DESTS }, origin: null, flights: null });
const REF = { month: 5, nights: 5, dates: { out: "2027-05-08", back: "2027-05-13" } };

test("journeyStops: consecutive days in one place are one stop", () => {
  assert.deepEqual(journeyStops(LISBON_PORTO).map((s) => [s.name, s.days.length]), [["Lisbon", 3], ["Porto", 3]]);
  assert.deepEqual(journeyStops(null), []);
});

test("libraryCandidate: the journey's own towns and nights in the list's window; no base towns, no trip", () => {
  const c = libraryCandidate(journey("pt-a", LISBON_PORTO), input(), REF);
  assert.deepEqual(c.places, [{ id: "LIS", nights: 3 }, { id: "OPO", nights: 2 }], "the last day is the day home");
  assert.equal(c.shape, "towns");
  assert.equal(c.nights, 5);
  assert.deepEqual(c.dates, { out: "2027-05-08", back: "2027-05-13" });
  assert.equal(c.iso2, "PT");
  assert.equal(c.gateway, null, "a train trip does not fly");
  assert.equal(libraryCandidate(journey("pt-b", LISBON_PORTO, []), input(), REF), null, "no base towns: skipped, never invented");
  const far = [day(1, "Nowhere", 60, 20), day(2, "Nowhere", 60, 20)];
  assert.equal(libraryCandidate(journey("x", far, ["Nowhere"]), input(), REF), null, "no stop on the catalogue: skipped");
  assert.deepEqual(libraryCandidate(journey("y", null, ["Point-to-point, Lisbon to Porto"]), input(), REF)?.places.map((p) => p.id), ["LIS", "OPO"], "no day places: the named base towns");
});

test("libraryShortlist: the window's month, about its length, countries been last, named countries only", () => {
  const cards = [
    { id: "a", cc: "PT", days: 6, months: [5, 6] },
    { id: "b", cc: "ES", days: 6, months: [5] },
    { id: "c", cc: "PT", days: 6, months: [8] },
    { id: "d", cc: "PT", days: 14, months: [5] },
    { id: "e", cc: "IT", days: 7, months: [] },
  ];
  assert.deepEqual(libraryShortlist(cards, REF).map((c) => c.id), ["a", "b", "e"]);
  assert.deepEqual(libraryShortlist(cards, REF, { settings: { avoidIso2: ["PT"] } }).map((c) => c.id), ["b", "e", "a"]);
  assert.deepEqual(libraryShortlist(cards, REF, { settings: { places: [{ kind: "country", iso2: "ES" }] } }).map((c) => c.id), ["b"]);
});

test("libraryTrips: priced and marked, a ceiling holds, the list's own towns and a short row are left out", () => {
  const price = (c) => ({ id: c.places.map((p) => p.id).join("-"), places: c.places, slots: [], total: { group: 900 } });
  const rank = (trips) => trips.map((x) => ({ ...x, budget: x.places[0].id === "SEV" ? { delta: 50 } : null }));
  const js = [
    journey("pt-a", LISBON_PORTO),
    journey("pt-b", LISBON_PORTO, []),
    journey("pt-c", [day(1, "Porto", 41.15, -8.61), day(2, "Porto", 41.15, -8.61)]),
    journey("es-a", [day(1, "Seville", 37.39, -5.99), day(2, "Seville", 37.39, -5.99)]),
  ];
  const out = libraryTrips(js, input(), REF, { price, rank });
  assert.deepEqual(out.map((x) => x.id), ["LIS-OPO~lib", "OPO~lib", "SEV~lib"]);
  assert.equal(out[0].library.title, "Trip pt-a");
  const capped = libraryTrips(js, input(settings({ guide: { budget: { eur: 800, kind: "total", mode: "cap" } } })), REF, { price, rank });
  assert.ok(!capped.some((x) => x.id === "SEV~lib"), "over the ceiling: left out");
  const have = [{ places: [{ id: "LIS" }, { id: "OPO" }] }, { places: [{ id: "OPO" }] }];
  assert.deepEqual(libraryTrips(js, input(), REF, { price, rank, have }), [], `fewer than ${ROW_MIN}: no row`);
  assert.deepEqual(libraryTrips(js, input(), REF, { price: () => { throw new Error("x"); }, rank }), [], "a failed price is skipped");
});
