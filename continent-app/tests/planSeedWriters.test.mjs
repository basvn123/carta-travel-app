// G12 plan rethink, B2 (lanes L3, L4, S15): every door's PlanSeed
// (lib/plan/seedWriters.js, askSeed.js), the seed's route as the trip
// page's hand-over (seed.js seedToSharedTrip), booking rows in a seed, the
// booked landing (doors.js bookedLanding) and "Paid · Still to plan"
// (bookedReceipt.js bookedSplit). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { choiceStop, journeySeed, openTripOf, placeSeed, routeSeedOf } from "../src/lib/plan/seedWriters.js";
import { askPlanSeed } from "../src/lib/plan/askSeed.js";
import { emptySeed, routeSeed, seedToSettings, seedToSharedTrip } from "../src/lib/plan/seed.js";
import { bookedLanding, sharedOfSelection } from "../src/lib/plan/doors.js";
import { bookedSplit } from "../src/lib/plan/bookedReceipt.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const DESTS = {
  LIS: { city: "Lisbon", iso2: "PT", country: "Portugal", city_lat: 38.72, city_lon: -9.14 },
  OPO: { city: "Porto", iso2: "PT", country: "Portugal", city_lat: 41.15, city_lon: -8.61 },
  SIN: { city: "Sintra", iso2: "PT", country: "Portugal", city_lat: 38.80, city_lon: -9.38 },
};

test("placeSeed: a place page keeps its town, a country page its country", () => {
  const p = placeSeed({ source: "place", iso2: "pt", destId: "LIS", name: "Lisbon" });
  assert.deepEqual(p.places, [{ kind: "place", id: "LIS", iso2: "PT", name: "Lisbon" }]);
  assert.deepEqual(p.ref, { kind: "place", id: "LIS" });
  assert.deepEqual(p.pins, ["places"]);
  assert.equal(routeSeed(p), "found");
  const r = placeSeed({ source: "region", iso2: "PT", destId: "OPO", regionId: "pt-norte" });
  assert.deepEqual(r.ref, { kind: "region", id: "pt-norte" });
  assert.equal(r.places[0].id, "OPO", "the region's nearest priced town, no longer dropped");
  const c = placeSeed({ source: "country", iso2: "PT" });
  assert.deepEqual(c.places.map((x) => [x.kind, x.id]), [["country", "PT"]]);
  assert.equal(placeSeed({ iso2: "" }), null);
});

test("S15: a place page with a trip open asks, and adds the town", () => {
  const p = placeSeed({ iso2: "PT", destId: "OPO" });
  const open = openTripOf({ stops: [{ destinationId: "LIS", nights: 3 }], planLabel: "" }, "", DESTS);
  assert.deepEqual(open, { id: "draft", name: "Lisbon" });
  assert.equal(routeSeed(p, { openTrip: open }), "choose");
  assert.equal(choiceStop(p), "OPO");
  assert.equal(choiceStop(placeSeed({ iso2: "PT" })), null, "a country has no town to add");
  assert.equal(openTripOf(null), null);
  assert.equal(openTripOf({ stops: [{ destinationId: "LIS" }], planLabel: "Zomer" }, "", DESTS).name, "Zomer");
});

test("routeSeedOf + seedToSharedTrip: stops, nights, activities, legs and the label reach the trip page", () => {
  const seed = routeSeedOf({
    id: "t9", name: "Portugal by train", transport: "public",
    stops: [{ dest: "LIS", nights: 3, dayActivities: ["Tram 28"] }, { dest: "OPO", nights: 2 }],
    legs: [{ mode: "train" }],
  }, { source: "trip" });
  assert.equal(routeSeed(seed), "trip");
  const shared = seedToSharedTrip(seed, { explore: { when: { mode: "exact", start: "2027-05-01", end: "2027-05-06" } } });
  assert.deepEqual(shared.stops, [
    { destinationId: "LIS", nights: 3, activities: ["Tram 28"] },
    { destinationId: "OPO", nights: 2, activities: [] },
  ]);
  assert.equal(shared.label, "Portugal by train");
  assert.deepEqual(shared.legModes, { 0: "train" });
  assert.equal(shared.transportPref, "public");
  assert.equal(shared.tripStart, "2027-05-01", "Explore's exact dates fill the window");
  assert.equal(seedToSharedTrip(seed, { explore: { when: { mode: "months", months: [5] } } }).tripStart, "");
  assert.equal(routeSeedOf({ stops: [] }), null);
  assert.equal(routeSeedOf({ stops: [{ dest: "LIS", nights: 2 }], legs: [{ mode: "drive" }] }).legModes[0], "car");
});

test("journeySeed: a journey's route stops on the catalogue, a night a day, the last day home", () => {
  const stops = [
    { name: "Lisbon", lat: 38.72, lon: -9.14, days: [1, 2, 3] },
    { name: "Cabo da Roca", lat: 38.79, lon: -9.40, days: [4] },
    { name: "Porto", lat: 41.15, lon: -8.61, days: [5, 6, 7] },
  ];
  const s = journeySeed({ id: "j1", title: "Coast", countryCode: "PT" }, stops, DESTS);
  assert.equal(s.source, "journey");
  assert.deepEqual(s.stops.map((x) => [x.dest, x.nights]), [["LIS", 3], ["SIN", 1], ["OPO", 2]]);
  const none = journeySeed({ id: "j2", countryCode: "PT", country: "Portugal" }, [{ name: "Nowhere", days: [1] }], DESTS);
  assert.deepEqual(none.places.map((x) => x.id), ["PT"], "no town found: the country stays as the wish");
});

test("journeySeed (G12 B7a): no day places, the named base towns by exact name, the nights shared out", () => {
  const j = (basecamps) => ({ id: "j3", countryCode: "PT", durationDays: 7, basecamps });
  const stops = (s) => s.stops.map((x) => [x.dest, x.nights]);
  assert.deepEqual(stops(journeySeed(j(["Point-to-point, Lisbon to Porto"]), [], DESTS)), [["LIS", 3], ["OPO", 3]]);
  assert.deepEqual(stops(journeySeed(j(["Lisbon (Alfama or Baixa)"]), null, DESTS)), [["LIS", 6]], "words in brackets dropped");
  assert.deepEqual(stops(journeySeed(j(["Cascais/Sintra", "Porto"]), [], DESTS)), [["SIN", 3], ["OPO", 3]], "of a or b, the first the catalogue knows");
  assert.deepEqual(stops(journeySeed({ ...j(["Lisbon", "Sintra", "Porto"]), durationDays: 3 }, [], DESTS)), [["LIS", 1], ["SIN", 1]], "never more towns than nights");
  const none = journeySeed(j(["Óbidos"]), [], DESTS);
  assert.deepEqual(none.places.map((x) => x.id), ["PT"], "no catalogue name: no town guessed, the country stays");
  assert.deepEqual(journeySeed(j([]), [], DESTS).stops, [], "no base towns: none invented");
});

test("askPlanSeed: Ask's route plus the question through parseTrip (one parser)", () => {
  const s = askPlanSeed({ stops: [{ dest: "LIS", nights: 4 }], transport: "public" }, "5 days with 2 kids from 3 to 8 May 2027 under 800 euros", { lang: "en", today: new Date("2026-11-24T12:00:00Z") });
  assert.equal(s.source, "ask");
  assert.equal(s.party.kids, 2);
  assert.equal(s.when.mode, "exact");
  assert.equal(s.budget.eur, 800);
  assert.ok(s.pins.includes("when") && s.pins.includes("party") && s.pins.includes("budget"));
  assert.equal(seedToSharedTrip(s).groupSize, 2);
  assert.equal(askPlanSeed({ stops: [] }, "x"), null);
});

test("emptySeed: an empty door is Plan's home, anything known is a start", () => {
  assert.equal(emptySeed({ source: "past" }), true);
  assert.equal(emptySeed({ when: { mode: "months", months: [5] } }), false);
});

test("booked rows in a seed become the trip's imports and land on the trip page", () => {
  const seed = {
    source: "booking",
    booked: {
      flights: [{ kind: "flight_out", city: "Lisbon", title: "TAP", date: "2027-05-01", eur: 180 }],
      stays: [{ kind: "stay", city: "Lisbon", title: "Casa", date: "2027-05-01", eur: 400 }],
    },
  };
  assert.equal(routeSeed(seed), "booked");
  const s = seedToSettings(seed);
  assert.equal(s.imports.length, 2);
  assert.equal(s.booked.flights, true);
  assert.equal(s.booked.stays, true);
  const land = bookedLanding({ ...s, when: { ...s.when, mode: "exact", start: "2027-05-01", end: "2027-05-05", nights: 4 } }, DESTS);
  assert.deepEqual(land.stops.map((x) => x.destinationId), ["LIS"]);
  assert.equal(land.tripStart, "2027-05-01");
  assert.equal(land.ownFlight.booked, true);
  assert.deepEqual(land.ownStays, { LIS: 400 });
});

test("bookedLanding: a typed sentence (free, on the device) stands as a flight with no price", () => {
  const s = normalizeSettings({
    booked: { flights: true }, places: [{ kind: "place", id: "LIS", name: "Lisbon", iso2: "PT" }],
    when: { mode: "exact", start: "2027-05-03", end: "2027-05-10", nights: 7 },
  });
  const land = bookedLanding(s, DESTS);
  assert.deepEqual(land.stops.map((x) => [x.destinationId, x.nights]), [["LIS", 7]]);
  assert.equal(land.ownFlight.booked, true);
  assert.equal(land.ownFlight.costTotal, 0, "no figure invented");
  assert.equal(bookedLanding(normalizeSettings({}), DESTS), null);
  assert.equal(sharedOfSelection(null), null);
});

const parts = (o = {}) => ({ travel: 0, flights: 0, airport: 0, transfers: 0, drive: 0, between: 0, car: 0, daytrips: 0, beds: 0, days: 0, ...o });

test("bookedSplit: paid is the traveller's own fare and stays; the rest is still to plan", () => {
  const priced = {
    parts: parts({ travel: 300, beds: 400, days: 200, between: 50 }), grandTotal: 950,
    flight: { own: true, cost_total: 300 }, cartaFlight: {}, travelSplit: { legacy: true, out: 300, back: 0 },
    stayCosts: [{ ownAccom: true, accomTotal: 400 }],
  };
  assert.deepEqual(bookedSplit(priced), { paid: 700, toPlan: 250, notYet: [], unpriced: [] });
});

test("bookedSplit: a booked flight with no price is named, never counted", () => {
  const priced = {
    parts: parts({ beds: 400, days: 200 }), grandTotal: 600,
    flight: { own: true, cost_total: 0 }, cartaFlight: {}, travelSplit: { legacy: false, out: 0, back: 0 },
    stayCosts: [{ ownAccom: false, accomTotal: 400 }],
  };
  const s = bookedSplit(priced);
  assert.equal(s.paid, 0);
  assert.equal(s.toPlan, 600);
  assert.deepEqual(s.notYet, ["travel"]);
  assert.deepEqual(s.unpriced, ["travel"]);
  assert.equal(bookedSplit({ ...priced, flight: { own: false } }), null, "nothing of the traveller's: no split");
  assert.equal(bookedSplit({ ...priced, flight: { own: true, driving: true } }), null, "their own car is not a payment");
});
