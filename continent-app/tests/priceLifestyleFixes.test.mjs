// R4: the price follows the trip's settings. A hired car replaces the bus
// and metro (no local fares twice) and brings its own parking and local
// driving; the trip hire and the day's car line count cars the same way
// (babies take a car seat); a stay filter prices a stop at its own nights;
// the first-run receipt counts children and local fares.
// Run: node --test tests/priceLifestyleFixes.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import {
  tripRequest, priceDay, atDates, priceRequest, stopNightsFor, priceDaysAtNights, quoteStay,
} from "../src/lib/price/index.js";
import { quoteTrip } from "../src/lib/price/trip.js";
import { carLocalCost, ENGINE_CAR_MODEL } from "../src/lib/price/car.js";
import { rule } from "../src/lib/price/config.js";
import { priceReceipt } from "../src/lib/firstRun.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/price/destinations.json", import.meta.url), "utf8"));
setStayRecords(FX.stays);
const BASE = FX.destinations;
const c100 = (v) => Math.round(v * 100);
const START = "2027-05-08";
const END = "2027-05-13";

// Lisbon with a measured metro fare, so the day holds a transport line.
const FARE = {
  ...BASE.LIS, id: "FARE", place: { ...(BASE.LIS.place || {}), class: "city" },
  local_transport: { ...(BASE.LIS.local_transport || {}), fare: { currency: "EUR", ride_eur: 1.8, day_pass_eur: 6.8, source: "test", date: "2026-10-24", quality: "measured" } },
};
const ALL = { ...BASE, FARE };
const DATA = { destinations: ALL, meta: {} };
const stateFor = (over = {}) => ({
  stops: [{ destinationId: "FARE", nights: 5, activities: [] }],
  tripStart: START, groupSize: 2, stayTier: "home", transportPref: "auto", ...over,
});
const lineOf = (day, key) => day.lines.find((l) => l.key === key);

test("a hire-car trip drops the local fares: its days fall by exactly the transport line", () => {
  const bus = quoteTrip(stateFor(), { data: DATA });
  const car = quoteTrip(stateFor({ transportPref: "car" }), { data: DATA });
  const req = atDates(tripRequest(stateFor()), START, END);
  const fare = lineOf(priceDay(FARE, req, ALL), "transport");
  assert.equal(fare.status, "included");
  assert.ok(fare.eur > 0);
  assert.equal(c100(bus.parts.days - car.parts.days), c100(fare.eur * 5 * 2));
  // The figure stays for the opened price; only its status changes.
  const hired = lineOf(priceDay(FARE, atDates(tripRequest(stateFor({ transportPref: "car" })), START, END), ALL), "transport");
  assert.equal(hired.status, "not_included");
  assert.equal(hired.eur, fare.eur);
  assert.equal(hired.basis.reason, "hire");
  assert.equal(c100(car.parts.beds), c100(bus.parts.beds), "beds do not move");
});

test("Explore's transport 'car' (one's own car there) keeps the local fares", () => {
  const req = priceRequest({ choices: { group_size: 2, transport_mode: "car" } });
  assert.equal(req.hire, false);
  assert.equal(lineOf(priceDay(FARE, req, ALL), "transport").status, "included");
  // An own car on a planned trip is the drive there, not a hire either.
  assert.equal(tripRequest({ transportPref: "owncar" }).hire, false);
  assert.equal(tripRequest({ transportPref: "car" }).hire, true);
});

test("a hire adds parking by place class and a short daily drive, per car, to the car part", () => {
  const { parking_eur_per_night: park, km_per_day: km } = rule("car.local");
  const car = quoteTrip(stateFor({ transportPref: "car" }), { data: DATA });
  const fuel = ENGINE_CAR_MODEL.fuel_price_by_iso2[FARE.iso2] ?? ENGINE_CAR_MODEL.fuel_price_eur_per_l;
  const litres = ENGINE_CAR_MODEL.consumption_l_per_100km / 100;
  assert.equal(car.carLocal.parking_eur, park.city * 5);
  assert.equal(c100(car.carLocal.fuel_eur), c100(km * litres * fuel * 5));
  assert.equal(c100(car.parts.car), c100(car.carRental.eur_total + car.carLocal.eur_total + (car.vignettes?.eur_total || 0)));
  // Seven people are two cars: twice the parking and the driving.
  const seven = quoteTrip(stateFor({ groupSize: 7, transportPref: "car" }), { data: DATA });
  assert.equal(seven.carLocal.cars, 2);
  assert.equal(seven.carLocal.parking_eur, park.city * 5 * 2);
  // No hire, no parking.
  assert.equal(quoteTrip(stateFor(), { data: DATA }).carLocal, null);
});

test("parking: an unknown class prices as a town, a village parks free, a pass-through stop costs nothing", () => {
  const { parking_eur_per_night: park } = rule("car.local");
  const at = (cls, nights = 2) => carLocalCost([{ nights, dest: { ...FARE, place: cls ? { class: cls } : {} } }], 1);
  assert.equal(at(null).parking_eur, park.town * 2);
  assert.equal(at("village").parking_eur, 0);
  assert.equal(at("metro", 0).eur_total, 0);
  assert.ok(park.metro >= park.city && park.city >= park.town && park.town >= park.village, "dearer where towns are bigger");
});

test("cars are counted the same in the trip hire and the day's car line: a baby takes a car seat", () => {
  const state = stateFor({ groupSize: 4, babies: 1, transportPref: "car" });
  const trip = quoteTrip(state, { data: DATA });
  const day = priceDay(FARE, atDates(tripRequest(state), START, END), ALL);
  assert.equal(trip.carRental.cars, 2);
  assert.equal(lineOf(day, "car").basis.cars, trip.carRental.cars);
  const four = stateFor({ groupSize: 4, transportPref: "car" });
  assert.equal(quoteTrip(four, { data: DATA }).carRental.cars, 1);
  assert.equal(lineOf(priceDay(FARE, atDates(tripRequest(four), START, END), ALL), "car").basis.cars, 1);
});

test("the stay filter prices a stop at its own nights, the planned stop's figure", () => {
  assert.equal(stopNightsFor({ FARE: 4 }, "FARE", 2), 4);
  assert.equal(stopNightsFor({ FARE: 0 }, "FARE", 2), 2);
  assert.equal(stopNightsFor(null, "LIS", 2), 2);
  const req = tripRequest({ groupSize: 2, stayTier: "home" });
  const at4 = priceDaysAtNights(ALL, req, START, 4).get("FARE");
  const at2 = priceDaysAtNights(ALL, req, START, 2).get("FARE");
  const stop = quoteStay(FARE, 4, START, req, ALL);
  assert.equal(at4.stayEur, stop.accom.per_night, "the filter's night is the stop's night");
  // An entire place spreads its fees over more nights.
  assert.ok(at4.stayEur < at2.stayEur);
});

test("the first-run receipt counts children and local fares", () => {
  const opts = { from: START, to: END, people: 2, stayTier: "home", destinations: ALL };
  const adults = priceReceipt(FARE, opts);
  assert.deepEqual(adults.lines.map((l) => l.key), ["stay", "ground", "transport"]);
  const kids = priceReceipt(FARE, { ...opts, children: 2 });
  assert.equal(kids.people, 4);
  assert.ok(kids.total > adults.total);
  const day = priceDay(FARE, atDates(tripRequest({ groupSize: 2, children: 2 }), START, END), ALL);
  const g = kids.lines.find((l) => l.key === "ground");
  assert.equal(c100(g.eur), c100(day.foodEur * 5 * 4));
  assert.equal(c100(kids.total), c100(kids.lines.reduce((s, l) => s + l.eur, 0)));
});
