// T1100 (ROADMAP D13, audit P-31): which way there a card opens on.
// Door to door time and cost below a distance, the flight above it when a
// fare exists, and the check on 50 origin and destination pairs.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chooseWay, doorHours, wayKm, transferMinutesOf, legDuration } from "../src/lib/wayChoice.js";
import { rule } from "../src/lib/price/config.js";
import { wayFor, partyOf } from "../src/lib/travelWay.js";
import { waysThere } from "../src/browse/placeWays.js";
import { FLY_KM } from "../src/lib/gettingThere.js";
import { runPairs, fixtureFlights, FIXTURE_FARE } from "../scripts/way_choice_pairs.mjs";
import { setStayRecords } from "../src/lib/staysData.js";
import { quoteComposed } from "../src/lib/price/compose.js";
import { priceDays, atDates, priceRequest } from "../src/lib/price/index.js";

const C = rule("way.choice");
const FX = JSON.parse(readFileSync(new URL("./fixtures/wayPairs.json", import.meta.url), "utf8"));
const place = (id) => FX.places.find((p) => p.id === id);
const BRUSSELS = FX.homes.find((h) => h.name === "Brussels");

test("one distance for the planner prefill and the way-there pick", () => {
  assert.equal(FLY_KM, C.fly_km);
});

test("a flight door to door counts the airport and the transfer", () => {
  const plane = { mode: "plane", perPerson: 100, minutes: 120 };
  assert.equal(doorHours(plane, { transferMinutes: 0 }), 2 + C.plane_overhead_hours);
  assert.equal(doorHours(plane, { transferMinutes: 90 }), 2 + C.plane_overhead_hours + 1.5);
  // No transfer stored: the configured hour, never zero.
  assert.equal(doorHours(plane, {}), 2 + C.plane_overhead_hours + C.unknown_transfer_hours);
  // No clock times: the distance at cruise speed plus taxiing.
  assert.equal(doorHours({ mode: "plane", perPerson: 1 }, { km: 750, transferMinutes: 0 }),
    1 + C.plane_taxi_hours + C.plane_overhead_hours);
  assert.equal(doorHours({ mode: "plane", perPerson: 1 }, {}), null);
  // A ground way's hours already count the stations.
  assert.equal(doorHours({ mode: "train", perPerson: 1, hours: 4.2 }), 4.2);
});

test("P-31: no car to Bergen, no 512 euro train to Taormina while a fare exists", () => {
  const bergen = chooseWay([
    { mode: "plane", perPerson: 320 },   // a dear fare, still the default
    { mode: "car", perPerson: 193, hours: 15 },
    { mode: "train", perPerson: 398, hours: 14.6 },
  ], { km: 1063, transferMinutes: 0 });
  assert.equal(bergen.pick, "plane");
  assert.equal(bergen.reason, "distance");
  assert.equal(bergen.cheapest, "car", "the cheapest keeps its mark");
  const taormina = chooseWay([
    { mode: "plane", perPerson: 201 },
    { mode: "train", perPerson: 512, hours: 20 },
  ], { km: 1682, transferMinutes: null });
  assert.equal(taormina.pick, "plane");
});

test("far, but a ground way faster and no dearer than the flight still wins", () => {
  const c = chooseWay([
    { mode: "plane", perPerson: 150, minutes: 80 },
    { mode: "train", perPerson: 120, hours: 4 },
  ], { km: 760, transferMinutes: 60 });
  assert.equal(c.pick, "train");
  assert.equal(c.reason, "beats_flight");
});

test("near: price plus time decides, so a 13 hour coach is not the default for 8 euro", () => {
  const c = chooseWay([
    { mode: "train", perPerson: 112, hours: 4.6 },
    { mode: "bus", perPerson: 62, hours: 7.8 },
  ], { km: 435 });
  // train 112 + 15*2*4.6 = 250 against bus 62 + 15*2*7.8 = 296
  assert.equal(c.pick, "train");
  assert.equal(c.cheapest, "bus");
  assert.equal(c.fastest, "train");
  // A short hop the coach is cheap and barely slower: the coach.
  assert.equal(chooseWay([
    { mode: "train", perPerson: 33, hours: 1.4 },
    { mode: "bus", perPerson: 16, hours: 1.6 },
  ], { km: 89 }).pick, "bus");
});

test("near, a flight is weighed like any way, with its airport hours", () => {
  const c = chooseWay([
    { mode: "plane", perPerson: 68, minutes: 50 },
    { mode: "train", perPerson: 67, hours: 2.6 },
  ], { km: 199, transferMinutes: 0 });
  assert.equal(c.pick, "train");
  assert.equal(c.fastest, "train", "fifty minutes in the air is not fastest door to door");
});

test("no fare, no flight: the rule never prefers a plane it cannot price", () => {
  assert.equal(chooseWay([{ mode: "plane", perPerson: 0 }, { mode: "car", perPerson: 200, hours: 15 }], { km: 1063 }).pick, "car");
  assert.equal(chooseWay([], {}), null);
  assert.equal(chooseWay([{ mode: "bus", perPerson: 40, hours: 5 }], {}).reason, "only");
});

test("distance and transfer read off the catalogue row", () => {
  assert.ok(Math.abs(wayKm(BRUSSELS, place("BGO")) - 1063) < 5);
  assert.equal(transferMinutesOf(place("BGO")), 0);
  assert.equal(transferMinutesOf(place("gem:amalfi-coast")), 75);
  assert.equal(transferMinutesOf(place("gem:taormina")), null);
  assert.equal(wayKm(null, place("BGO")), null);
  assert.equal(legDuration({ dep: "22:30", arr: "00:10" }), 100);
});

test("the Explore card (any way) and the place page open on the same pick", () => {
  const party = partyOf({ group_size: 2 });
  const dest = place("BGO");
  // A dear flight to Bergen: the car is cheaper, the flight is the default.
  const way = wayFor(dest, "any", { home: BRUSSELS, party, flight: { perSeat: 320, airline: "SN" } });
  assert.equal(way.mode, "plane");
  // A chosen mode is still honoured.
  assert.equal(wayFor(dest, "car", { home: BRUSSELS, party, flight: { perSeat: 320 } }).mode, "car");
  const file = { from: "BRU", to: {}, back: {} };
  const page = waysThere({ dest, anchor: "BGO", home: BRUSSELS, party, flights: file });
  assert.equal(page.pick, "car", "without a fare in the sweep the page offers no flight");
  assert.ok(page.rows.every((r) => "doorHours" in r));
});

test("50 origin and destination pairs: far flies, near weighs time and cost", () => {
  const rows = runPairs(FX, { flightFor: fixtureFlights() });
  assert.equal(rows.length, 50);
  for (const r of rows) {
    assert.ok(r.after, `${r.from} to ${r.to}: a way`);
    const plane = r.ways.find((w) => w.mode === "plane");
    if (plane && r.km >= C.fly_km) {
      assert.ok(r.after === "plane" || r.reason === "beats_flight", `${r.from} to ${r.to} (${r.km} km) flies`);
    }
    // Never a ground way of more than 12 hours door to door when a flight exists.
    const picked = r.ways.find((w) => w.mode === r.after);
    if (plane && picked.mode !== "plane") assert.ok(picked.door_h <= 12, `${r.from} to ${r.to}: ${picked.mode} ${picked.door_h} h`);
  }
  // The audit's three from Brussels.
  for (const id of ["BGO", "gem:amalfi-coast", "gem:taormina"]) {
    assert.equal(rows.find((r) => r.from === "Brussels" && r.id === id).after, "plane", id);
  }
  // An hour away is never a flight.
  assert.notEqual(rows.find((r) => r.from === "Brussels" && r.id === "gem:bruges").after, "plane");
  assert.notEqual(rows.find((r) => r.from === "Munich" && r.id === "INN").after, "plane");
  // The fixture fare is a stand-in, stated as one.
  assert.equal(FIXTURE_FARE(1000), 140);
});

test("Places (any way): a route with no fare in the sweep is not the cheapest way by leaving the flight out", () => {
  const PRICE = JSON.parse(readFileSync(new URL("./fixtures/price/destinations.json", import.meta.url), "utf8"));
  setStayRecords(PRICE.stays);
  const ALL = PRICE.destinations;
  const choices = { group_size: 2, stay_tier: "home", transport_mode: "any", drive_home: { name: "Brussels", lat: BRUSSELS.lat, lon: BRUSSELS.lon } };
  const [a, b] = ["2027-05-08", "2027-05-13"];
  const days = priceDays(ALL, atDates(priceRequest({ choices }), a, b));
  const bergen = { ...ALL.BGO, ...place("BGO"), routes: { BRU: {} } };
  const q = quoteComposed(bergen, a, b, choices, ALL, { day: days.get("BGO") });
  assert.equal(q.plane_reachable, true);
  assert.equal(q.flight, null);
  assert.equal(q.transport_mode, "car", "the drive is priced; a flight without a fare is not");
  assert.equal(q.way_reason, "only");
  // Nothing on the ground reaches: the route is priced as before (T511).
  const island = { ...bergen, local_transport: { road_connected: false } };
  assert.equal(quoteComposed(island, a, b, choices, ALL, { day: days.get("BGO") }).transport_mode, "plane");
});
