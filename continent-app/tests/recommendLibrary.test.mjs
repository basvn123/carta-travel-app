// G12 plan rethink, lane R6 (B7a): the "Van Carta" row behind Search more.
// Carta's own journeys join the list only once their route is placed on
// catalogue towns and priced by the same engine; a journey with no base
// towns is skipped (never invented towns); a ceiling holds; fewer than two
// trips and no row is drawn. Run: npm test (continent-app/). Pure, made-up catalogue.
import test from "node:test";
import assert from "node:assert/strict";
import { journeyStops, landerPool, libraryCandidate, libraryShortlist, libraryTrips, ROW_MIN } from "../src/lib/recommend/moreSearch.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { alternatives } from "../src/lib/recommend/alternatives.js";
import { searchMoreInSteps } from "../src/lib/recommend/searchMore.js";

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

test("landerPool (B7a): the open finder without the named places, some of the same country; alternatives stay like for like", () => {
  const slots = (flight) => [{ id: "flight", eur: flight }, { id: "stay", eur: 300 }];
  const cand = (id, iso2) => ({ iso2, places: [{ id, nights: 4 }] });
  let asked = null;
  const build = (inp) => { asked = inp.settings.places; return [cand("LIS", "PT"), cand("SEV", "ES"), cand("MAD", "ES"), cand("OPO", "PT"), cand("FAR", "PT"), cand("ROM", "IT")]; };
  const notYet = (id) => id === "SEV";
  const price = (c) => ({ id: c.places[0].id, iso2: c.iso2, shape: "one", places: c.places, slots: slots(notYet(c.places[0].id) ? null : 100), total: { group: notYet(c.places[0].id) ? 200 : 500 } });
  const trip = { id: "LIS", iso2: "PT", shape: "one", places: [{ id: "LIS", nights: 4 }], slots: slots(100), total: { group: 700 } };
  const s = settings({ places: [{ kind: "place", id: "LIS" }] });
  const pool = landerPool(trip, input(s), { build, price, rank: (x) => x, tries: 4 });
  assert.deepEqual(asked, [], "the named places dropped");
  assert.deepEqual(pool.map((x) => x.id), ["OPO", "FAR", "SEV", "MAD"], "the trip itself out; two of its country first");
  const rel = Object.fromEntries(alternatives(trip, pool, {}).map((r) => [r.key, r]));
  assert.equal(rel.cheaper.trip.id, "OPO");
  assert.equal(rel.country.trip.id, "SEV");
  assert.equal(rel.country.diff, null, "a Not yet total shows no difference and never counts as cheaper");
  assert.deepEqual(landerPool(trip, input(s), { build: () => { throw new Error("x"); }, price, rank: (x) => x }), []);
});

test("G12 early results: Search more shows the cheaper months biggest saving first, then each journey as it is ready, and never re-sorts", async () => {
  const slots = [{ id: "flight", eur: 100 }, { id: "stay", eur: 300 }];
  const base = (id) => ({ id, places: [{ id }], slots, total: { group: 800 } });
  const list = [base("A"), base("B"), base("C"), { ...base("N"), slots: [{ id: "flight", eur: null }] }];
  // The lever finds a cheaper week for A (save 20) and C (save 90): C saves more but comes later.
  const saves = { A: 20, C: 90 };
  const lever = (t) => (saves[t.id] ? { trip: { id: `${t.id}-w` }, diff: -saves[t.id], month: 6 } : null);
  const price = (c) => ({ id: c.places.map((p) => p.id).join("-"), places: c.places, slots: [], total: { group: 900 } });
  const rank = (x) => ({ ...x, budget: null });
  const js = [
    journey("pt-a", LISBON_PORTO),
    journey("pt-c", [day(1, "Porto", 41.15, -8.61), day(2, "Porto", 41.15, -8.61)]),
    journey("es-a", [day(1, "Seville", 37.39, -5.99), day(2, "Seville", 37.39, -5.99)]),
  ];
  const seen = [];
  let frames = 0;
  const out = await searchMoreInSteps({
    trips: list, input: input(), ref: REF, journeys: Promise.resolve(js), lever, price, rank,
    yieldFrame: async () => { frames += 1; },
    onSome: (s) => seen.push({ month: s.month.map((m) => m.trip.id), library: s.library.map((x) => x.id), left: s.left }),
  });
  assert.deepEqual(out.month.map((m) => m.trip.id), ["C-w", "A-w"], "the biggest saving first, though found later (G12 go on)");
  const firstMonth = seen.findIndex((x) => x.month.length);
  assert.deepEqual(seen[firstMonth].month, ["C-w", "A-w"], "the months show together once their tries are done, never one by one");
  assert.deepEqual(out.library.map((x) => x.id), ["LIS-OPO~lib", "OPO~lib", "SEV~lib"]);
  assert.ok(frames >= 6, "the browser paints between tries");
  for (let i = 1; i < seen.length; i++) {
    assert.deepEqual(seen[i].month.slice(0, seen[i - 1].month.length), seen[i - 1].month, "a shown week keeps its place");
    assert.deepEqual(seen[i].library.slice(0, seen[i - 1].library.length), seen[i - 1].library, "a shown journey keeps its place");
  }
  assert.ok(seen.every((s) => s.library.length === 0 || s.library.length >= ROW_MIN), "never a row of one");
  assert.equal(seen[0].left, null, "while the journeys load the count is unknown, not guessed");
  assert.equal(seen.at(-1).left, 0);
  let alive = true;
  const stopped = await searchMoreInSteps({ trips: list, input: input(), ref: REF, journeys: js, lever, price, rank, alive: () => alive, yieldFrame: async () => { alive = false; } });
  assert.equal(stopped, null, "a new answer set stops the search");
});
