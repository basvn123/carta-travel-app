// The booking order of T169: bookingWindows prose into ordered steps.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { bookingOrder, leadOf } from "../src/lib/bookingOrder.js";

test("orders furthest lead time first and keeps the rest as notes", () => {
  const { steps, notes } = bookingOrder(
    "Restaurants two to four weeks ahead. Beds 3-4 months out. Bikes three to four weeks. Unstaffed refuges cannot be booked at all.");
  assert.deepEqual(steps.map((s) => s.text.split(' ')[0]), ["Beds", "Restaurants", "Bikes"]);
  assert.equal(notes.length, 1);
});

test("semicolon lists split and en dashes read as ranges", () => {
  const { steps } = bookingOrder("Pena 5\u20137 days; Jer\u00f3nimos 1\u20132 weeks; Prado 2\u20133 months. Gulbenkian is same-day.");
  assert.equal(steps.length, 4);
  assert.equal(steps[0].text.startsWith("Prado"), true);
  assert.equal(steps.at(-1).lead.kind, "same");
});

test("as soon as the season opens sorts first", () => {
  const { steps } = bookingOrder("Guesthouses 3 months. Boat: as soon as the season opens.");
  assert.equal(steps[0].lead.kind, "soon");
});

test("no lead time, no step; a hyphenated length is not a lead time", () => {
  assert.equal(leadOf("A 7-day pass covers it."), null);
  assert.equal(bookingOrder("").steps.length, 0);
});
