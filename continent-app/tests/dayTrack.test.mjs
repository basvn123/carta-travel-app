// The day track of T162: where the track is, where a button or key sends it,
// and the measured line split into figures for the day cards.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { clampIndex, trackIndex, trackKey, trackLeft } from "../src/lib/dayTrack.js";
import { dayStatsParts, dayStatsLine, dayFigureEstimated, dayEstimated } from "../src/lib/journeys.js";

// Seven cards. Phone: 300 px cards, 12 px gap, every card has its own stop.
const PHONE = [0, 312, 624, 936, 1248, 1560, 1872];
const PHONE_MAX = 1872;
// Desktop: three across, 220 px cards, the last three share the end stop.
const DESK = [0, 232, 464, 696, 928, 1160, 1392];
const DESK_MAX = 928;

test("the nearest card start is the current card", () => {
  assert.equal(trackIndex(PHONE, 0, PHONE_MAX, 0), 0);
  assert.equal(trackIndex(PHONE, 330, PHONE_MAX, 0), 1);
  assert.equal(trackIndex(PHONE, 1872, PHONE_MAX, 0), 6);
  assert.equal(trackIndex(DESK, 470, DESK_MAX, 0), 2);
});

test("at the far end, the card the reader stepped to wins", () => {
  // Next pressed to day 6 and 7 on desktop: the track cannot move, the index can.
  assert.equal(trackIndex(DESK, DESK_MAX, DESK_MAX, 5), 5);
  assert.equal(trackIndex(DESK, DESK_MAX, DESK_MAX, 6), 6);
  // A swipe to the end with no stepping reads the end stop.
  assert.equal(trackIndex(DESK, DESK_MAX, DESK_MAX, 0), 4);
  // Away from the end the scroll position always speaks.
  assert.equal(trackIndex(DESK, 232, DESK_MAX, 6), 1);
});

test("a short track that fits keeps the stepped card", () => {
  assert.equal(trackIndex([0, 232], 0, 0, 1), 1);
  assert.equal(trackIndex([], 0, 0, 3), 0);
});

test("the scroll target never passes the end", () => {
  assert.equal(trackLeft(PHONE, 3, PHONE_MAX), 936);
  assert.equal(trackLeft(DESK, 6, DESK_MAX), DESK_MAX);
  assert.equal(trackLeft(DESK, -2, DESK_MAX), 0);
  assert.equal(trackLeft(DESK, 99, DESK_MAX), DESK_MAX);
});

test("keys move one card, Home and End go to the ends, nothing loops", () => {
  assert.equal(trackKey("ArrowRight", 2, 7), 3);
  assert.equal(trackKey("ArrowLeft", 2, 7), 1);
  assert.equal(trackKey("ArrowRight", 6, 7), 6);
  assert.equal(trackKey("ArrowLeft", 0, 7), 0);
  assert.equal(trackKey("Home", 4, 7), 0);
  assert.equal(trackKey("End", 1, 7), 6);
  assert.equal(trackKey("Enter", 1, 7), null);
  assert.equal(clampIndex(9, 7), 6);
  assert.equal(clampIndex(3, 0), 0);
});

test("a v2.0 line of figures stays one mono part, unchanged", () => {
  const line = "8 km / 450 m ascent / 3 h realistic";
  assert.deepEqual(dayStatsParts(line, "en"), [{ key: "line", text: line, mono: true, sep: "" }]);
  assert.equal(dayStatsLine(line, "en"), line);
  assert.deepEqual(dayStatsParts(null, "en"), []);
});

test("a v2.0 line splits where its words begin, and joins back exactly", () => {
  const line = "38 km / 470 m ascent / 70% hardpack, 30% paved / two unlit tunnels";
  const parts = dayStatsParts(line, "en");
  assert.deepEqual(parts.map((p) => [p.text, p.mono, p.sep]), [
    ["38 km / 470 m ascent / 70% hardpack, 30% paved", true, ""],
    ["two unlit tunnels", false, " / "],
  ]);
  assert.equal(dayStatsLine(line, "en"), line);
  const hut = "13 km, 700 m ascent, 250 m descent to the hut. Grade: steep granite steps. Water: at the hut.";
  const [lead, note] = dayStatsParts(hut, "en");
  assert.equal(lead.text, "13 km, 700 m ascent, 250 m descent to the hut");
  assert.equal(note.sep + note.text, ". Grade: steep granite steps. Water: at the hut.");
  assert.equal(dayStatsLine(hut, "en"), hut);
  // A line that opens with words is all words.
  const words = "Rest day in town, 2 km at most";
  assert.deepEqual(dayStatsParts(words, "en"), [{ key: "note", text: words, mono: false, sep: "" }]);
});

test("a v2.1 measured line splits into mono figures and a sans note", () => {
  const stats = { distanceKm: 52, ascentM: 160, timeMin: { low: 180, high: 240 }, spendEur: { low: 3, high: 4 }, note: "asphalt" };
  const parts = dayStatsParts(stats, "en");
  assert.deepEqual(parts.map((p) => p.key), ["distanceKm", "ascentM", "timeMin", "spendEur", "note"]);
  assert.deepEqual(parts.map((p) => p.mono), [true, true, true, true, false]);
  assert.equal(dayStatsLine(stats, "en"), "52 km, +160 m, 3 h to 4 h, €3 to €4, asphalt");
});

test("the estimate mark lands on the one estimated figure", () => {
  const ledger = { by: new Map([["itinerary[2].dayStats.ascentM", "estimated"], ["itinerary[2].dayStats.distanceKm", "sourced"]]) };
  assert.equal(dayFigureEstimated(ledger, 2, "ascentM"), true);
  assert.equal(dayFigureEstimated(ledger, 2, "distanceKm"), false);
  assert.equal(dayFigureEstimated(ledger, 1, "ascentM"), false);
  assert.equal(dayFigureEstimated(null, 2, "ascentM"), false);
  assert.equal(dayEstimated(ledger, 2), true);
  assert.equal(dayEstimated(ledger, 0), false);
});
