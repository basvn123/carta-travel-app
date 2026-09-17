// What the "Getting there" step guesses before anybody answers (prompt T6).
// Run: npm test  (from continent-app/)
//
// The step is a form, so what is worth testing is the prefill: an opinionated
// guess is only allowed because it costs one tap to override, and a guess that
// is wrong in a SYSTEMATIC way (every leg a flight, every leg a train) costs
// the traveller the whole screen.
import test from "node:test";
import assert from "node:assert/strict";
import {
  prefillMode, legKm, openJaw, publishedLeg, FLY_KM,
} from "../src/lib/gettingThere.js";

/** Two ends of a leg, with only the fields the rules read. */
const pt = (iso2, lat, lon) => ({ iso2, lat, lon });
const leg = (a, b) => ({ from: a, to: b });

const GHENT = pt("BE", 51.05, 3.72);
const PARIS = pt("FR", 48.86, 2.35);
const LISBON = pt("PT", 38.72, -9.13);
const REYKJAVIK = pt("IS", 64.15, -21.94);
const ANDORRA = pt("AD", 42.51, 1.52);

test("a short leg is a train", () => {
  assert.equal(prefillMode(leg(GHENT, PARIS)), "train");
});

test("a long leg is a flight", () => {
  const km = legKm(leg(GHENT, LISBON));
  assert.ok(km > FLY_KM, `${km} km should be over the threshold`);
  assert.equal(prefillMode(leg(GHENT, LISBON)), "fly");
});

test("a country with no railway gets the coach, not a train", () => {
  // Andorra has no railway at all, so "train" would be a mode the traveller
  // cannot buy. It is close enough to drive or ride to.
  assert.equal(prefillMode(leg(ANDORRA, pt("ES", 41.39, 2.17))), "bus");
});

test("no railway and a long way is still a flight", () => {
  assert.equal(prefillMode(leg(GHENT, REYKJAVIK)), "fly");
});

test("the quiz's road trip beats the distance", () => {
  const quiz = { types: ["roadtrip"], around: "" };
  assert.equal(prefillMode(leg(GHENT, LISBON), { quiz }), "car");
  assert.equal(prefillMode(leg(GHENT, PARIS), { quiz }), "car");
});

test("getting around by car does too", () => {
  assert.equal(prefillMode(leg(GHENT, LISBON), { quiz: { around: "car" } }), "car");
});

test("their own car outranks everything", () => {
  assert.equal(
    prefillMode(leg(GHENT, LISBON), { drivingOwnCar: true, quiz: { around: "trainonly" } }),
    "car",
  );
});

test("the published mode wins for a hop the composer already routed", () => {
  // pipeline/trips computed this from the real route, not a straight line, and
  // only publishes a mode its estimator agreed exists.
  assert.equal(prefillMode(leg(GHENT, LISBON), { published: "train" }), "train");
});

test("a leg with no coordinates falls back rather than throwing", () => {
  assert.equal(legKm(leg(GHENT, { iso2: "FR" })), null);
  assert.equal(prefillMode(leg(GHENT, { iso2: "FR" })), "train");
  assert.equal(prefillMode(null), "train");
});

/* ── The open jaw ─────────────────────────────────────────────────────── */

const ap = (iata, km) => ({ iata, km, coverage: 100 });

test("no hint when the trip comes home from where it landed", () => {
  assert.equal(openJaw([ap("BCN", 20)], [ap("BCN", 20)]), null);
});

test("no hint when the second airport barely helps", () => {
  // Landing at BCN and flying home from GRO saves 30km: not worth two one-way
  // bookings and the explanation.
  assert.equal(openJaw([ap("BCN", 20)], [ap("GRO", 50), ap("BCN", 80)]), null);
});

test("a hint when the far end has a much closer airport", () => {
  const jaw = openJaw([ap("BCN", 20)], [ap("GRO", 15), ap("BCN", 210)]);
  assert.equal(jaw.into.iata, "BCN");
  assert.equal(jaw.home.iata, "GRO");
});

test("a hint when the arrival airport is not an option at the far end", () => {
  // Nothing to compare against, so the different airport IS the answer.
  const jaw = openJaw([ap("BCN", 20)], [ap("LIS", 12)]);
  assert.equal(jaw.home.iata, "LIS");
});

test("no hint without airports at one end", () => {
  assert.equal(openJaw([], [ap("GRO", 15)]), null);
  assert.equal(openJaw([ap("BCN", 20)], []), null);
});

/* ── Matching a hop to the trip's own published legs ───────────────────── */

const detail = {
  legs: [
    { from: "AAA", to: "BBB", mode: "train", minutes: 130, km: 210, home: false },
    { from: "BBB", to: "CCC", mode: "bus", minutes: 99, km: 85, home: false },
    { from: "CCC", to: "AAA", mode: "car", minutes: 154, km: 156, home: true },
  ],
};

test("a hop finds the leg that names both its stops", () => {
  assert.equal(publishedLeg(detail, "AAA", "BBB").mode, "train");
  assert.equal(publishedLeg(detail, "BBB", "CCC").mode, "bus");
});

test("the loop's leg home is not a hop between stops", () => {
  // Matching on position would hand this leg to a hop it is not; matching on
  // ids plus the home flag leaves it where it belongs.
  assert.equal(publishedLeg(detail, "CCC", "AAA"), null);
});

test("a hop with nothing published borrows nothing", () => {
  assert.equal(publishedLeg(detail, "AAA", "CCC"), null);
  assert.equal(publishedLeg(detail, "AAA", null), null);
  assert.equal(publishedLeg(null, "AAA", "BBB"), null);
});
