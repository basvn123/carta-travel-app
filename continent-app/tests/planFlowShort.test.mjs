// G12 plan rethink B3, the question rule (decision §12, owner, binding):
// "for every question, check whether the travel style captures it; if not,
// keep the question".
//   - With no style every question is asked once; with a style Who, the bed,
//     what matters most, the way there and the style's guide answers are
//     passed over.
//   - When and From are asked, prefilled from Explore (source 'explore').
//   - Kid ages are asked whenever children come and an age is missing.
//   - Weather, reach and the shape only while the place is open.
//   - A style switch re-seeds the trip and recomputes what is asked; the
//     traveller's own answers stay.
//   - The quick-start mark carries where the planner opens ('ask' or 'trips').
// Replaces the T1103 short-setup tests (tell, who, when, from).
// Run: npm test (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, markAnswered } from "../src/planner/flow/tripSettings.js";
import {
  askedSetup, askOpen, firstAsked, nextAsked, kidAgesMissing, STYLE_HELD, SETUP_SKIP, guideScreens, guideQuestions,
  openGuideQuestions, firstOpenGuide, tripUnderWay, TRIPS_SCREEN, setupScreens, FIRST_SETUP, firstSetup,
} from "../src/planner/flow/flowGraph.js";
import { newTripSettings, restyleTrip, holdForTrip, styleDraftOfTrip } from "../src/planner/flow/styleSeed.js";
import { seedToSettings } from "../src/lib/plan/seed.js";
import { normalizeStyle, STYLE_ANSWERS, styleFromDraft } from "../src/lib/travelStyles.js";
import { markQuickStart, peekQuickStart, peekQuickMode, clearQuickStart } from "../src/planner/flow/quickStart.js";

const s = (patch) => normalizeSettings(patch);
const style = (patch = {}) => normalizeStyle({
  id: "st1", who: { kind: "couple", adults: 2 }, stay: "hotel3", way: "plane", priority: "balance",
  explore: { shapes: ["towns"], likes: ["food", "culture"], avoid: ["crowds"], around: "public" },
  days: { mornings: "early", pace: "slow" }, ...patch,
});
/** The questions a trip walks, from the door, by Continue alone. */
const walk = (x) => {
  const list = ["tell", ...askedSetup(x), "create"];
  const out = [];
  let k = nextAsked(list, "tell", x, "create");
  while (k && k !== "create") { out.push(k); k = nextAsked(list, k, x, "create"); }
  return out;
};

test("§12: no style, every setup question is asked once (Tell is the door's line)", () => {
  const x = s({});
  assert.deepEqual(askedSetup(x), ["booked", "who", "sleep", "priority", "when", "from", "way", "airports"]);
  assert.deepEqual(walk(x), askedSetup(x));
  assert.equal(firstAsked(x), "booked");
});

test("§12: with a style, Who, the bed, what matters most and the way there are passed over", () => {
  const x = newTripSettings(style());
  for (const id of ["who", "sleep", "priority", "way"]) assert.equal(askOpen(x, id), false, id);
  assert.deepEqual(walk(x), ["booked", "when", "from", "airports"]);
  // A train style answers the way there and so drops the airports.
  assert.deepEqual(walk(newTripSettings(style({ way: "train" }))), ["booked", "when", "from"]);
  // A bus style has no planner way: the way there stays a question.
  assert.ok(walk(newTripSettings(style({ way: "bus" }))).includes("way"));
});

test("§12: the style's guide answers are passed over, weather and reach stay while the place is open", () => {
  const x = newTripSettings(style());
  assert.deepEqual(openGuideQuestions(x), ["g:weather", "g:reach", "g:budget", "g:pick", "g:how"]);
  assert.equal(firstOpenGuide(x), "g:weather");
  // A known place: weather, reach and the shape are not asked.
  const placed = normalizeSettings({ ...x, places: [{ kind: "place", id: "lisbon" }] });
  for (const id of ["g:weather", "g:reach", "g:shape"]) assert.ok(!guideScreens(placed).includes(id), id);
  assert.equal(guideScreens(placed).at(-1), TRIPS_SCREEN);
});

test("§12: a returning traveller with a style and an open place passes 11 screens to the first price", () => {
  const x = newTripSettings(style());
  const screens = ["home", ...walk(x), ...openGuideQuestions(x), TRIPS_SCREEN];
  assert.equal(screens.length, 11);
});

test("§12: the held ids are the style's answers plus the way there", () => {
  for (const id of STYLE_ANSWERS.filter((x) => x !== "g:persona")) assert.ok(STYLE_HELD.includes(id), id);
  assert.ok(STYLE_HELD.includes("way"));
  assert.ok(SETUP_SKIP.includes("style") && SETUP_SKIP.includes("words") && SETUP_SKIP.includes("seed"));
  assert.ok(!SETUP_SKIP.includes("explore"), "Explore's answers are asked, prefilled");
});

test("§12: When and From come prefilled from Explore and are still asked", () => {
  const explore = {
    when: { mode: "months", start: "", end: "", months: [5], nights: 5 },
    nights: 5,
    from: { name: "Gent", lat: 51.05, lng: 3.72, countryCode: "BE" },
  };
  const x = seedToSettings({}, { style: style(), explore });
  assert.deepEqual(x.when.months, [5]);
  assert.equal(x.from.name, "Gent");
  assert.equal(x.sources.when, "explore");
  assert.ok(askOpen(x, "when") && askOpen(x, "from"), "one tap confirms them");
  assert.deepEqual(walk(x), ["booked", "when", "from", "airports"]);
});

test("§12: kid ages are asked whenever children come and an age is missing", () => {
  const fam = newTripSettings(style({ who: { kind: "family", adults: 2, kids: 2 } }));
  assert.equal(fam.party.kids, 2);
  assert.ok(kidAgesMissing(fam));
  assert.deepEqual(walk(fam).slice(0, 2), ["booked", "ages"]);
  const aged = markAnswered(normalizeSettings({ ...fam, party: { ...fam.party, kidAges: [5, 9] } }), "ages");
  assert.equal(askOpen(aged, "ages"), false);
  assert.ok(!walk(aged).includes("ages"));
  assert.ok(!askedSetup(s({})).includes("ages"), "no children, no ages");
});

test("§12: a question answered on its own screen is never jumped", () => {
  const x = markAnswered(newTripSettings(style()), "when");
  assert.ok(walk(x).includes("when"));
});

test("style switch: re-seeded, what is asked recomputed, the traveller's own answers kept", () => {
  let x = newTripSettings(style());
  x = markAnswered(normalizeSettings({ ...x, when: { mode: "months", months: [9], nights: 4 } }), "when");
  // Switched to no style: the style questions come back, When stays theirs.
  const bare = holdForTrip(x, "style", null, null);
  assert.equal(bare.style, "");
  for (const id of ["who", "sleep", "priority", "way"]) assert.ok(askOpen(bare, id), id);
  assert.deepEqual(bare.when.months, [9]);
  assert.ok(bare.answered.includes("when"));
  // Another style answers them again.
  const other = restyleTrip(bare, style({ id: "st2", way: "train" }));
  assert.equal(other.style, "st2");
  assert.equal(other.way, "train");
  assert.ok(!askOpen(other, "who") && !askOpen(other, "way"));
});

test("Save as travel style: a draft from the trip's own answers", () => {
  const x = s({ party: { kind: "friends", adults: 4 }, priority: "price", way: "train", guide: { likes: ["nightlife"], shapes: ["one"] } });
  const st = styleFromDraft(styleDraftOfTrip(x, { stay_tier: "private" }));
  assert.equal(st.who.adults, 4);
  assert.equal(st.stay, "private");
  assert.equal(st.way, "train");
  assert.equal(st.priority, "price");
  assert.deepEqual(st.explore.likes, ["nightlife"]);
  // A trip made from that style asks none of the style questions again.
  const next = newTripSettings(st);
  for (const id of ["who", "sleep", "priority", "way"]) assert.equal(askOpen(next, id), false, id);
});

test("T1103 kept: the old short setup and the trip-under-way check", () => {
  assert.deepEqual(firstSetup(s({})), ["tell", "who", "when", "from"]);
  assert.deepEqual(FIRST_SETUP, ["tell", "who", "when", "from"]);
  const now = s({ kind: "now" });
  assert.deepEqual(firstSetup(now), setupScreens(now));
  assert.deepEqual(askedSetup(now), setupScreens(now).filter((id) => id !== "tell"));
  const today = "2026-11-06";
  assert.equal(tripUnderWay([], today), false);
  assert.equal(tripUnderWay(null, today), false);
  assert.equal(tripUnderWay([{ start: "2026-12-01", end: "2026-12-08" }], today), false);
  assert.equal(tripUnderWay([{ start: "2026-11-06", end: "2026-11-06" }], today), true);
  assert.equal(tripUnderWay([{ start: "2026-11-01", end: "" }, { months: [11] }], today), false);
  assert.equal(guideQuestions(s({})).length, 9);
});

test("quick-start mark: its mode survives a peek and goes on clear", () => {
  clearQuickStart();
  assert.equal(peekQuickStart(), false);
  assert.equal(peekQuickMode(), "");
  markQuickStart("ask");
  assert.equal(peekQuickMode(), "ask");
  assert.equal(peekQuickMode(), "ask", "peek does not clear (StrictMode runs initialisers twice)");
  markQuickStart();
  assert.equal(peekQuickMode(), "trips", "the default stays the priced trips");
  markQuickStart("nonsense");
  assert.equal(peekQuickMode(), "trips");
  clearQuickStart();
  assert.equal(peekQuickStart(), false);
});
