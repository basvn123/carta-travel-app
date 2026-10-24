// T517: flight prices in a trip: swept file, live answer, hours, bags,
// freshness, and a typed fare winning.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import {
  sweptDay, sweptCheapest, pickLeg, legCost, fitsHours, cheapestReturn, MAX_AGE_MS,
} from "../src/lib/flights/flights.js";
import { bagFee, bagTier } from "../src/lib/flights/bagFees.js";
import { existsSync, readFileSync } from "node:fs";
import { quoteTrip, tripLines } from "../src/lib/tripTotal.js";
import { withOriginRoutes, destAnchor } from "../src/lib/origins.js";

const NOW = Date.UTC(2026, 9, 21, 20, 0);
const fresh = Math.floor((NOW - 3600000) / 60000);
const stale = Math.floor((NOW - MAX_AGE_MS - 60000) / 60000);
// T692: a far date (over 14 days ahead) is swept weekly, so it may be 8 days old.
const farOk = Math.floor((NOW - 5 * 86400000) / 60000);
const farStale = Math.floor((NOW - 8 * 86400000 - 60000) / 60000);
const file = {
  v: 1, from: "BRU", checked: "2026-10-21T19:07:00Z",
  to: {
    BCN: {
      "2026-11-18": [87, "VY", "21:55", "23:59", 0, fresh],
      "2026-11-20": null,
      "2026-11-22": [64, "FR", "06:30", "08:40", 0, fresh],
      "2026-10-27": [9, "FR", "06:30", "08:40", 0, stale],
      "2026-11-24": [12, "FR", "06:30", "08:40", 0, farStale],
      "2026-11-26": [99, "FR", "06:30", "08:40", 0, farOk],
    },
  },
  back: { BCN: { "2026-11-25": [70, "VY", "19:10", "21:15", 0, fresh] } },
};

test("a swept day is a leg, a searched day with no flight is null, an unsearched one undefined", () => {
  assert.deepEqual(sweptDay(file, "out", "BCN", "2026-11-18", NOW), {
    date: "2026-11-18", price: 87, airline: "VY", dep: "21:55", arr: "23:59", stops: 0, checked: fresh * 60000, source: "swept",
  });
  assert.equal(sweptDay(file, "out", "BCN", "2026-11-20", NOW), null);
  assert.equal(sweptDay(file, "out", "BCN", "2026-11-19", NOW), undefined);
  assert.equal(sweptDay(file, "back", "BCN", "2026-11-25", NOW).price, 70);
});

test("a price older than its sweep cycle is never shown: 3 days near, 8 days far (T692)", () => {
  assert.equal(sweptDay(file, "out", "BCN", "2026-10-27", NOW), undefined, "near, over 3 days");
  assert.equal(sweptDay(file, "out", "BCN", "2026-11-24", NOW), undefined, "far, over 8 days");
  assert.equal(sweptDay(file, "out", "BCN", "2026-11-26", NOW).price, 99, "far, 5 days old");
  assert.equal(sweptCheapest(file, "out", "BCN", "2026-11", NOW).price, 64);
});

test("the cheapest return in a month", () => {
  const r = cheapestReturn(file, "BCN", "2026-11", NOW);
  assert.equal(r.perSeat, 64 + 70);
  assert.equal(r.out.airline, "FR");
  assert.equal(cheapestReturn(file, "LIS", "2026-11", NOW), null);
});

test("live beats swept, and the hours filter picks inside the window", () => {
  const live = {
    checked: "2026-10-21T19:55:00Z", link: "https://www.google.com/travel/flights?q=x",
    flights: [
      { price: 80, airline: "VY", dep: "21:55", arr: "23:59", stops: 0, flightNo: "VY1083" },
      { price: 113, airline: "SN", dep: "14:50", arr: "16:50", stops: 0, flightNo: "SN3703" },
      { price: 132, airline: "KL", dep: "07:05", arr: "11:15", stops: 1, flightNo: "KL1702" },
    ],
  };
  const any = pickLeg({ file, live, dir: "out", airport: "BCN", date: "2026-11-18", now: NOW });
  assert.equal(any.price, 80);
  assert.equal(any.source, "live");
  const morning = pickLeg({ file, live, dir: "out", airport: "BCN", date: "2026-11-18", hours: "morning", now: NOW });
  assert.equal(morning.airline, "KL");
  // No live answer: the swept flight, if it fits the hours.
  assert.equal(pickLeg({ file, live: null, dir: "out", airport: "BCN", date: "2026-11-18", now: NOW }).source, "swept");
  assert.equal(pickLeg({ file, live: null, dir: "out", airport: "BCN", date: "2026-11-18", hours: "morning", now: NOW }), undefined);
  // A live day with no flights at all: no flight.
  assert.equal(pickLeg({ file, live: { checked: "x", flights: [] }, dir: "out", airport: "BCN", date: "2026-11-18", now: NOW }), null);
});

test("hours bands", () => {
  assert.ok(fitsHours("06:30", "morning"));
  assert.ok(!fitsHours("12:00", "morning"));
  assert.ok(fitsHours("12:00", "midday"));
  assert.ok(fitsHours("23:30", "evening"));
  assert.ok(fitsHours("03:10", "any"));
});

test("bags: per person per way, by airline, full-service cabin bag included", () => {
  assert.equal(bagTier("small"), "none");
  assert.equal(bagTier("priority_10kg"), "cabin");
  assert.equal(bagTier("checked"), "checked");
  assert.deepEqual(bagFee("FR", "priority_10kg"), { eur: 20, known: true });
  assert.deepEqual(bagFee("KL", "priority_10kg"), { eur: 0, known: true });
  assert.equal(bagFee("KL", "checked_20kg").eur, 35);
  assert.deepEqual(bagFee("ZZ", "checked_20kg"), { eur: 0, known: false });
  const leg = { price: 33, airline: "FR" };
  assert.deepEqual(legCost(leg, { paying: 3, bagKey: "priority_10kg" }),
    { fare: 99, bags: 60, bagsKnown: true, total: 159, perSeat: 53 });
  assert.equal(legCost(null), null);
});

// ---- In a whole trip (quoteTrip) ------------------------------------------

const DATA = new URL("../public/app_data.json", import.meta.url);
const raw = existsSync(DATA) ? JSON.parse(readFileSync(DATA, "utf8")) : null;
const skip = raw ? false : "public/app_data.json is not on this machine";

test("a trip's total carries Carta's flight there and home, and a typed fare replaces it", { skip }, () => {
  const data = withOriginRoutes(raw, "BRU");
  const bcn = Object.values(data.destinations).find((d) => destAnchor(d) === "BCN" && d.iata === "BCN");
  assert.ok(bcn, "Barcelona is in the catalogue");
  const t = Date.now() - 60000;
  const min = Math.floor(t / 60000);
  const start = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 23 * 86400000).toISOString().slice(0, 10);
  data.flights = {
    v: 1, from: "BRU",
    to: { BCN: { [start]: [87, "VY", "21:55", "23:59", 0, min] } },
    back: { BCN: { [end]: [64, "FR", "06:30", "08:40", 0, min] } },
  };
  const state = {
    stops: [{ destinationId: bcn.id, nights: 3, activities: [] }],
    tripStart: start, tripEnd: end, groupSize: 2, baggage: "priority_10kg", transportPref: "auto",
  };
  const p = quoteTrip(state, { data });
  assert.equal(p.cartaFlight.out.price, 87);
  assert.equal(p.cartaFlight.back.airline, "FR");
  // Vueling cabin bag 18, Ryanair 20, for two people each way.
  assert.equal(p.parts.flights, (87 + 18) * 2 + (64 + 20) * 2);
  const lines = tripLines(p);
  assert.deepEqual(lines.filter((l) => l.kind === "flight").map((l) => l.key), ["out", "back"]);
  const sum = lines.reduce((n, l) => n + l.eur, 0);
  assert.ok(Math.abs(sum - p.grandTotal) < 0.05, `lines ${sum} sum to the total ${p.grandTotal}`);

  const typed = quoteTrip({ ...state, ownFlight: { mode: "fly", costOut: 150, costBack: 0 } }, { data });
  assert.equal(typed.cartaFlight.out, null);
  assert.equal(typed.parts.flights, (64 + 20) * 2);
  assert.equal(tripLines(typed).find((l) => l.key === "out").kind, "yours");
});

test("near the wanted day: the cheapest within four days, with its own date", async () => {
  const { sweptNear, roundTripNear } = await import("../src/lib/flights/flights.js");
  assert.equal(sweptNear(file, "out", "BCN", "2026-11-19", { now: NOW }).date, "2026-11-18");
  assert.equal(sweptNear(file, "out", "BCN", "2026-11-21", { now: NOW }).price, 64);
  assert.equal(sweptNear(file, "out", "BCN", "2026-12-10", { now: NOW }), null);
  const rt = roundTripNear(file, "BCN", "2026-11-21", "2026-11-26", { paying: 2, bagKey: "small", now: NOW });
  assert.equal(rt.total, (64 + 70) * 2);
  assert.equal(rt.out.date, "2026-11-22");
  assert.equal(roundTripNear(file, "BRU", "2026-11-21", "2026-11-26", { now: NOW }), null);
});
