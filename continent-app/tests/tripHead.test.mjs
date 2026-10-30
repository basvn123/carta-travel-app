// T885: the trip page's head in words: the countdown, the name as shown and
// how much of the trip is booked.
import test from "node:test";
import assert from "node:assert/strict";
import { bookedCount, countdownText, shownTripName } from "../src/planner/trip/tripHead.js";

const t = (k, v = {}) => `${k}${Object.keys(v).length ? JSON.stringify(v) : ""}`;
const at = (iso) => new Date(`${iso}T09:00:00`);

test("the countdown: days before, the day of the trip, done after", () => {
  assert.equal(countdownText(t, "2027-06-05", "2027-06-12", at("2026-10-30")), 'tp.cd.in{"n":218}');
  assert.equal(countdownText(t, "2027-06-05", "2027-06-12", at("2027-06-04")), "tp.cd.tomorrow");
  assert.equal(countdownText(t, "2027-06-05", "2027-06-12", at("2027-06-07")), 'tp.cd.day{"n":3,"of":8}');
  assert.equal(countdownText(t, "2027-06-05", "2027-06-12", at("2027-06-13")), "tp.cd.past");
  assert.equal(countdownText(t, "", "", at("2027-06-13")), "");
});

test("the name: the traveller's own, else the places; a bare country reads as its places", () => {
  const stops = [{ dest: { city: "Corfu", country: "Greece" } }];
  assert.equal(shownTripName("Greece", stops, "en"), "Corfu");
  assert.equal(shownTripName("", stops, "en"), "Corfu");
  assert.equal(shownTripName("Bas en Noa", stops, "en"), "Bas en Noa");
  const two = [{ dest: { city: "Split", country: "Croatia" } }, { dest: { city: "Hvar", country: "Croatia" } }];
  assert.equal(shownTripName("Croatia", two, "nl"), "Split en Hvar");
  assert.equal(shownTripName("", [], "en"), "");
});

test("booked: the flight both ways counts two, each stay one, own stays and drives none", () => {
  const stopDetails = [{ destinationId: "a", dest: {} }, { destinationId: "b", dest: {} }];
  const priced = { cartaFlight: { out: {}, back: {} } };
  assert.deepEqual(bookedCount({ flight: {}, priced, stopDetails, booked: null }), { n: 0, of: 4 });
  assert.deepEqual(bookedCount({ flight: {}, priced, stopDetails, booked: { flights: true, stays: ["b"] } }), { n: 3, of: 4 });
  assert.deepEqual(bookedCount({ flight: { driving: true }, priced, stopDetails, stayCosts: [{ ownAccom: 1 }], booked: null }), { n: 0, of: 1 });
});
