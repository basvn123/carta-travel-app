// T856: every answer carries, and a new plan starts clean.
//   - Start planning always starts a new trip (PlanFlow calls
//     tripsStore.startNew every time): an open draft too empty to be listed
//     (answers, no trip made) is cleared, so its old `answered` cannot
//     block the new plan's words; a draft with a trip in it stays listed.
//   - Tell Carta's words never overwrite a screen's answer, but words typed
//     again replace what the earlier words answered (screenAnswered).
//   - The way of travel (choices.transport_mode) seeds every leg's mode in
//     Getting there, and a trip-finder trip priced on a flight flies there
//     and home (prefillMode way, flown).
// Run: npm test (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { listTrips, startNewTrip } from "../src/planner/tripsStore.js";
import { fromDraft } from "../src/planner/flow/tripSettings.js";
import { prefillFromText, screenAnswered } from "../src/planner/flow/prefill.js";
import { prefillMode, wayLegMode, FLY_KM, legKm } from "../src/lib/gettingThere.js";

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
const PD = "carta.plannerDraft.v1";
const stale = JSON.stringify({
  version: 2,
  settings: { answered: ["tell", "who", "when"], note: "two of us in May", party: { kind: "couple", adults: 2 }, trip: { name: "", created: 0 } },
});

test("T856: a new plan clears an open draft that holds old answers and no trip", () => {
  const s = fakeStorage({ [PD]: stale });
  assert.equal(listTrips(s, 1000).length, 0, "too empty to be listed, so the old door skipped startNew");
  startNewTrip(s, 2000);
  assert.equal(s.getItem(PD), null, "the old answers are gone");
  assert.deepEqual(fromDraft(JSON.parse(s.getItem(PD) || "null")).answered, [], "the new plan has nothing answered");
  assert.equal(listTrips(s, 2000).length, 0, "nothing listed either");
});

test("T856: a new plan keeps an open trip with something in it in the list", () => {
  const made = JSON.stringify({ version: 2, settings: { answered: ["who"], trip: { name: "Lisbon", created: 5 } } });
  const s = fakeStorage({ [PD]: made });
  startNewTrip(s, 2000);
  assert.equal(s.getItem(PD), null);
  const list = listTrips(s, 2000);
  assert.equal(list.length, 1);
  assert.equal(list[0].meta.name, "Lisbon");
  assert.equal(list[0].active, false);
});

test("T856: words typed again replace the earlier words' answers, never a screen's", () => {
  const note = "two of us in May";
  assert.deepEqual(prefillFromText(note).answered.sort(), ["when", "who"]);
  // who and when came from the words, priority from its screen.
  const s = { note, answered: ["tell", "who", "when", "priority"] };
  assert.deepEqual(screenAnswered(s), ["tell", "priority"]);
  // No words yet: every answer is a screen's.
  assert.deepEqual(screenAnswered({ note: "", answered: ["who"] }), ["who"]);
  assert.deepEqual(screenAnswered(null), []);
});

const pt = (iso2, lat, lon) => ({ iso2, lat, lon });
const GHENT = pt("BE", 51.05, 3.72);
const PARIS = pt("FR", 48.86, 2.35);
const MUNICH = pt("DE", 48.14, 11.58);
const LISBON = pt("PT", 38.72, -9.13);
const VALLETTA = pt("MT", 35.9, 14.51);
const out = (to) => ({ kind: "out", from: GHENT, to });
const back = (from) => ({ kind: "back", from, to: GHENT });
const hop = (a, b) => ({ kind: "inter", from: a, to: b });

test("T856: the way of travel seeds every leg it fits", () => {
  assert.equal(wayLegMode("plane"), "fly");
  assert.equal(wayLegMode("any"), "");
  assert.equal(wayLegMode(undefined), "");
  assert.ok(legKm(out(MUNICH)) < FLY_KM, "Munich is train distance from Ghent");
  // Any way: the distance rules, as before.
  assert.equal(prefillMode(out(MUNICH)), "train");
  assert.equal(prefillMode(out(MUNICH), { way: "any" }), "train");
  // A plane: there and home fly, a hop between stops keeps the rules.
  assert.equal(prefillMode(out(MUNICH), { way: "plane" }), "fly");
  assert.equal(prefillMode(back(MUNICH), { way: "plane" }), "fly");
  assert.equal(prefillMode(hop(MUNICH, PARIS), { way: "plane" }), "train");
  // A train, a coach, the car: every leg.
  assert.equal(prefillMode(out(LISBON), { way: "train" }), "train");
  assert.equal(prefillMode(hop(MUNICH, PARIS), { way: "bus" }), "bus");
  assert.equal(prefillMode(back(LISBON), { way: "car" }), "car");
  // A train where there is no railway falls through to the rules.
  assert.equal(prefillMode(out(VALLETTA), { way: "train" }), "fly");
  // The trip's own published hop still wins.
  assert.equal(prefillMode(hop(MUNICH, PARIS), { way: "car", published: "ferry" }), "ferry");
});

test("T856: a trip-finder trip priced on a flight flies there and home, whatever the distance", () => {
  assert.equal(prefillMode(out(MUNICH), { flown: true }), "fly");
  assert.equal(prefillMode(back(MUNICH), { flown: true, way: "train" }), "fly", "the card's flight wins over the way");
  assert.equal(prefillMode(hop(MUNICH, PARIS), { flown: true }), "train", "a hop between stops is not the flight");
  assert.equal(prefillMode(out(MUNICH), { flown: true, drivingOwnCar: true }), "car", "their own car still drives");
});
