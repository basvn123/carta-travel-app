// T669: the journeys library as ready trips. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { buildCityIndex, journeyToTripCard, journeyStops, isJourneyId } from "../src/lib/journeyTrips.js";

const destinations = {
  SPU: { city: "Split", iso2: "HR", rating: { score: 8.9 } },
  MKS: { city: "Makarska", iso2: "HR", rating: { score: 8.1 } },
  MKS2: { city: "Makarska", iso2: "HR", rating: { score: 7.2 } },
  BOL: { city: "Bol", iso2: "HR", rating: { score: 8.4 } },
  FLR: { city: "Florence", iso2: "IT", rating: { score: 9.4 } },
  SIE: { city: "Siena", iso2: "IT", rating: { score: 9 } },
};
const index = buildCityIndex(destinations);

const card = {
  id: "hr-beach-week-makarska-riviera", title: "A Family Beach Week", cc: "HR", countries: ["HR"],
  days: 7, pd: { low: 64, high: 107 }, gw: "SPU", tags: ["beach", "one-base"],
  visits: ["Makarska", "Brela", "Bol", "Biokovo"], hero: { url: "https://x/m.jpg" }, sub: "Makarska Riviera",
};

test("a card resolves its towns, the best rated row of a name, and ranks as a trip", () => {
  const c = journeyToTripCard(card, index, destinations);
  assert.equal(c.id, "j:hr-beach-week-makarska-riviera");
  assert.ok(isJourneyId(c.id));
  assert.deepEqual(c.cities.map((x) => x.id), ["MKS", "BOL"]);
  assert.equal(c.days, 7);
  assert.equal(c.nights, 6);
  assert.equal(c.cost.per_day_eur, 86);
  assert.equal(c.pace, "base");
  assert.deepEqual(c.countries, ["HR"]);
});

test("no town known: the gateway; nothing at all: not offered", () => {
  const g = journeyToTripCard({ ...card, visits: ["Nowhere"] }, index, destinations);
  assert.deepEqual(g.cities.map((x) => x.id), ["SPU"]);
  assert.equal(journeyToTripCard({ ...card, visits: ["Nowhere"], gw: "XXX" }, index, destinations), null);
});

test("stops follow the itinerary's sleep references", () => {
  const detail = {
    countryCode: "IT", durationDays: 6, basecamps: ["Florence", "Siena"],
    itinerary: [{ sleepRef: 1 }, { sleepRef: 1 }, { sleepRef: 1 }, { sleepRef: 2 }, { sleepRef: 2 }, { sleepRef: null }],
  };
  const r = journeyStops(detail, null, index, destinations);
  assert.deepEqual(r.stops, [{ dest: "FLR", nights: 3 }, { dest: "SIE", nights: 2 }]);
  assert.equal(r.missing, 0);
});

test("no sleep references share the nights; unknown bases are counted missing", () => {
  const detail = { countryCode: "IT", durationDays: 6, basecamps: ["Florence", "Atlantis", "Siena"], itinerary: [] };
  const r = journeyStops(detail, null, index, destinations);
  assert.deepEqual(r.stops, [{ dest: "FLR", nights: 3 }, { dest: "SIE", nights: 2 }]);
  assert.equal(r.missing, 1);
});

test("no bases: the card's first town gets every night", () => {
  const c = journeyToTripCard(card, index, destinations);
  const r = journeyStops({ countryCode: "HR", durationDays: 7, basecamps: [] }, c, index, destinations);
  assert.deepEqual(r.stops, [{ dest: "MKS", nights: 6 }]);
});
