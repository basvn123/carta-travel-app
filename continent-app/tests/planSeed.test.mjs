// G12 plan rethink, lane L2 (decision §4, §6, §12; build plan "style
// switch"): the PlanSeed (lib/plan/seed.js), the answer sources 'explore',
// 'seed' and 'trip', Explore's when_set / nights_set, the one hold for a
// trip (styleSeed.holdForTrip, travelStyles.holdStyleChoices) and a trip
// re-seeded from another style (restyleTrip). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { exploreAnswers, makeSeed, missingEssentials, routeSeed, seedToSettings, SEED_SOURCES } from "../src/lib/plan/seed.js";
import { defaultSettings, markAnswered, normalizeSettings, screenGiven } from "../src/planner/flow/tripSettings.js";
import { holdForTrip, newTripSettings, restyleTrip, styleGiven } from "../src/planner/flow/styleSeed.js";
import { continueTo, firstOpenGuide, SETUP_SKIP } from "../src/planner/flow/flowGraph.js";
import {
  addStyle, afterChoicesChange, choicesFromStyle, holdChoices, holdStyleChoices, keepChoices, normalizeStyles,
  styleFromTemplate, switchChoices,
} from "../src/lib/travelStyles.js";
import { nightsSetOf, readSettings, whenSetOf, withDateMode, withMonth, withTripNights } from "../src/lib/settings/model.js";

// One of each, made once: a template's id is new on every call.
const FAM = styleFromTemplate("family");
const SOLO = styleFromTemplate("solo");
const fam = () => FAM;
const solo = () => SOLO;

// ---- makeSeed ----

test("makeSeed: an empty seed is the door's, with nothing fixed", () => {
  const s = makeSeed();
  assert.equal(s.v, 1);
  assert.equal(s.source, "door");
  assert.deepEqual([s.places, s.stops, s.pins, s.avoidIso2, s.coplanners], [[], [], [], [], []]);
  assert.equal(s.when, null);
  assert.equal(s.budget, null);
  assert.ok(SEED_SOURCES.includes("friends") && SEED_SOURCES.includes("kept"));
});

test("makeSeed: values are checked, unknown ones dropped", () => {
  const s = makeSeed({
    source: "nope", places: [{ kind: "place", id: "pt_lisbon", iso2: "pt" }, { kind: "place", id: "pt_lisbon" }, { kind: "planet", id: "x" }],
    stops: [{ dest: "pt_porto", nights: 99 }, { nights: 2 }],
    when: { mode: "exact", start: "2027-05-01", end: "2027-04-01" },
    party: { kind: "family", adults: 2, kids: 2, kidAges: [6, 40, 9] },
    budget: { eur: 900, kind: "day", per: "group", mode: "cap" },
    booked: { flights: false, stays: false },
    avoidIso2: ["pt", "PT", "xx1"],
    pins: ["when", "banana"],
  });
  assert.equal(s.source, "door");
  assert.deepEqual(s.places, [{ kind: "place", id: "pt_lisbon", iso2: "PT", name: "" }]);
  assert.deepEqual(s.stops, [{ dest: "pt_porto", nights: 60, dayActivities: [] }]);
  assert.equal(s.when, null, "an end before the start is no window");
  assert.deepEqual(s.party.kidAges, [6, 11]);
  assert.deepEqual(s.budget, { eur: 900, kind: "day", per: "person", mode: "cap" }, "a day budget is a person's");
  assert.equal(s.booked, null, "nothing booked is no booking");
  assert.deepEqual(s.avoidIso2, ["PT"]);
  assert.deepEqual(s.pins, ["when"]);
});

// ---- routeSeed ----

test("routeSeed: each start opens on its landing", () => {
  assert.equal(routeSeed({}), "list", "nothing known: Trips for you");
  assert.equal(routeSeed({ when: { mode: "months", months: [5] }, budget: { eur: 800 } }), "list");
  assert.equal(routeSeed({ source: "place", places: [{ kind: "place", id: "pt_lisbon" }] }), "found");
  assert.equal(routeSeed({ source: "journey", stops: [{ dest: "pt_porto", nights: 3 }] }), "trip");
  assert.equal(routeSeed({ source: "booking" }), "booked");
  assert.equal(routeSeed({ booked: { flights: [{ kind: "flight_out" }] } }), "booked");
  assert.equal(routeSeed({ source: "place", places: [{ kind: "place", id: "pt_lisbon" }] }, { openTrip: { id: "t1" } }), "choose", "S15: add to the open trip or a new one");
  assert.equal(routeSeed({ source: "journey", stops: [{ dest: "pt_porto", nights: 3 }] }, { openTrip: { id: "t1" } }), "trip");
});

// ---- seedToSettings ----

test("seedToSettings: style, then Explore, then the seed; pinned fields are the seed's", () => {
  const explore = { when: { mode: "months", start: "", end: "", months: [6], nights: 5 }, nights: 5, from: { name: "Gent", lat: 51.05, lng: 3.72 } };
  const s = seedToSettings({
    source: "place", places: [{ kind: "place", id: "pt_lisbon", iso2: "PT" }], when: { mode: "months", months: [9], nights: 4 },
    pins: ["places", "when"],
  }, { style: fam(), explore });
  assert.equal(s.style, fam().id);
  assert.equal(s.sources.who, "style");
  assert.deepEqual(s.when.months, [9], "the seed beats Explore");
  assert.equal(s.sources.when, "seed");
  assert.equal(s.sources.places, "seed");
  assert.equal(s.from.name, "Gent");
  assert.equal(s.sources.from, "explore", "From is prefilled from Explore and still asked");
});

test("seedToSettings: Explore's When only when the traveller set it; an unpinned seed value is a prefill", () => {
  const s = seedToSettings({ party: { kind: "solo", adults: 1 } }, { style: fam(), explore: { when: null, nights: 10, from: null } });
  assert.ok(!s.answered.includes("when"));
  assert.equal(s.when.nights, 10, "a set length is prefilled");
  assert.equal(s.party.adults, 1);
  assert.ok(!s.answered.includes("who"), "not pinned: asked, prefilled with the page's party");
});

test("seedToSettings: a group trip budget keeps its total, with its mode", () => {
  const s = seedToSettings({ party: { adults: 4 }, budget: { eur: 2000, kind: "total", per: "group", mode: "cap" }, pins: ["budget", "party"] });
  assert.deepEqual(s.guide.budget, { kind: "total", per: "group", mode: "cap", groupEur: 2000, eur: 500 });
  assert.equal(s.sources["g:budget"], "seed");
  assert.equal(normalizeSettings(s).guide.budget.mode, "cap", "the mode survives a normalize");
});

test("exploreAnswers: from readSettings' model, only what the traveller set", () => {
  const untouched = readSettings({}, { today: "2026-11-24" });
  assert.deepEqual(exploreAnswers(untouched), { when: null, nights: null, from: null });
  const set = readSettings(withTripNights(5)(withMonth("2027-05")({})), { today: "2026-11-24" });
  const ex = exploreAnswers(set);
  assert.deepEqual(ex.when, { mode: "months", start: "", end: "", months: [5], nights: 5 });
  assert.equal(ex.nights, 5);
  const dated = readSettings(withDateMode("dates")({}), { departDate: "2027-04-10", returnDate: "2027-04-15", today: "2026-11-24" });
  assert.deepEqual(exploreAnswers(dated).when, { mode: "exact", start: "2027-04-10", end: "2027-04-15", months: [], nights: 5 });
  const from = exploreAnswers(readSettings({ drive_home: { name: "Gent", lat: 51.05, lon: 3.72 } }, { today: "2026-11-24" })).from;
  assert.deepEqual(from, { name: "Gent", lat: 51.05, lng: 3.72, countryCode: "" });
});

// ---- when_set / nights_set ----

test("when_set and nights_set: set by touching When or the length, inferred for older accounts", () => {
  assert.equal(whenSetOf({}), false);
  assert.equal(nightsSetOf({}), false);
  assert.equal(withDateMode("any")({}).when_set, true);
  assert.equal(withMonth("2027-05")({}).when_set, true);
  assert.equal(withTripNights(4)({}).nights_set, true);
  // An account from before the flags: a stored date_mode or trip_nights was the traveller's.
  assert.equal(whenSetOf({ date_mode: "month", when_month: "2027-05" }), true);
  assert.equal(nightsSetOf({ trip_nights: 9 }), true);
  assert.equal(whenSetOf({ date_mode: null }), false);
  assert.equal(whenSetOf({ date_mode: "month", when_set: false }), false, "a stored flag wins");
  // readSettings migrates a mode in for everyone; the flag reads the raw choices.
  const migrated = readSettings({}, { dateFlex: "any", today: "2026-11-24" });
  assert.equal(migrated.dateMode, "any");
  assert.equal(migrated.whenSet, false);
});

// ---- the answer sources ----

test("sources: 'explore', 'seed' and 'trip' survive a normalize; the setup skips only words and seed", () => {
  let s = defaultSettings();
  s = markAnswered(s, "when", "explore");
  s = markAnswered(s, "from", "seed");
  s = markAnswered(s, "who", "trip");
  const n = normalizeSettings(s);
  assert.deepEqual([n.sources.when, n.sources.from, n.sources.who], ["explore", "seed", "trip"]);
  assert.deepEqual([...SETUP_SKIP], ["words", "seed"]);
  const list = ["tell", "who", "when", "from"];
  assert.equal(continueTo(list, "tell", n), "who", "a trip change is never jumped");
  assert.equal(continueTo(list, "who", n), "when", "Explore's When is asked, prefilled");
  assert.equal(continueTo(list, "when", n), null, "the seed's From is fixed");
  assert.deepEqual(screenGiven(n), ["who"], "the words never overwrite a trip change");
});

test("the guide walk passes over a pinned seed answer too", () => {
  let s = defaultSettings();
  s = markAnswered(normalizeSettings({ ...s, guide: { ...s.guide, shapes: ["one"] } }), "g:shape", "seed");
  assert.notEqual(firstOpenGuide(s), "g:shape");
});

// ---- missingEssentials ----

test("missingEssentials: only no origin at all and children without ages stop the flow", () => {
  const s = defaultSettings();
  assert.deepEqual(missingEssentials(s), ["from"]);
  assert.deepEqual(missingEssentials(s, { origin: "BRU" }), []);
  assert.deepEqual(missingEssentials(s, { airports: ["CRL"] }), []);
  assert.deepEqual(missingEssentials({ ...s, booked: { ...s.booked, flights: true } }), [], "a booked flight fixes the way there");
  const kids = normalizeSettings({ ...s, party: { kind: "family", adults: 2, kids: 2, kidAges: [] } });
  assert.deepEqual(missingEssentials(kids, { origin: "BRU" }), ["kidAges"]);
  const aged = normalizeSettings({ ...s, party: { kind: "family", adults: 2, kids: 2, kidAges: [5, 8] } });
  assert.deepEqual(missingEssentials(aged, { origin: "BRU" }), []);
  // A style with children gives the party, never the ages.
  assert.deepEqual(missingEssentials(newTripSettings(fam()), { origin: "BRU" }), ["kidAges"]);
});

// ---- restyleTrip ----

test("restyleTrip: another style replaces what the old style gave and keeps the traveller's answers", () => {
  let s = newTripSettings(fam());
  s = markAnswered(normalizeSettings({ ...s, guide: { ...s.guide, weather: "warm" } }), "g:weather");
  s = markAnswered(normalizeSettings({ ...s, when: { mode: "months", months: [7], nights: 7 } }), "when", "explore");
  s = markAnswered(normalizeSettings({ ...s, rhythm: { ...s.rhythm, pace: "packed" } }), "r:pace", "trip");
  const next = restyleTrip(s, solo());
  assert.equal(next.style, solo().id);
  assert.equal(next.party.adults, 1);
  assert.equal(next.party.kids, 0);
  assert.equal(next.sources.who, "style");
  assert.equal(next.guide.weather, "warm", "a screen answer stays");
  assert.deepEqual(next.when.months, [7], "Explore's When stays");
  assert.equal(next.sources.when, "explore");
  assert.equal(next.rhythm.pace, "packed", "a trip change stays");
  assert.ok(styleGiven(next).includes("who"));
  assert.ok(!styleGiven(next).includes("r:pace"));
});

test("restyleTrip: no style takes every trace of the old style away", () => {
  const s = newTripSettings(fam());
  const next = restyleTrip(s, null);
  assert.equal(next.style, "");
  assert.deepEqual(styleGiven(next), []);
  assert.equal(next.party.kids, 0, "the style's party goes back to the default");
  assert.ok(!next.answered.includes("who"), "so Who is asked again");
});

// ---- holdForTrip and the style hold ----

test("holdForTrip: a trip change holds the style and marks the answer the trip's", () => {
  const calls = [];
  const app = {
    travelStyles: { list: [fam(), solo()], hold: () => calls.push("hold"), holdStyle: (id) => calls.push(`holdStyle:${id}`) },
    setPartyParts: (p) => calls.push(`party:${p.adults}/${p.children}`),
    setTransportMode: (w) => calls.push(`way:${w}`),
  };
  const s = newTripSettings(fam());
  const who = holdForTrip(s, "who", { adults: 3, kids: 0, kind: "friends" }, app);
  assert.equal(who.party.adults, 3);
  assert.equal(who.sources.who, "trip");
  const way = holdForTrip(s, "way", "train", app);
  assert.equal(way.way, "train");
  assert.equal(way.sources.way, "trip");
  assert.equal(holdForTrip(s, "way", "rocket", app), s, "an unknown way changes nothing");
  const styled = holdForTrip(s, "style", solo().id, app);
  assert.equal(styled.style, solo().id);
  assert.deepEqual(calls, ["hold", "party:3/0", "hold", "way:train", `holdStyle:${solo().id}`]);
  assert.ok(!calls.some((c) => c.startsWith("switch")), "Plan never switches the app's style");
  // Without the app only the trip changes (node, tests).
  assert.equal(holdForTrip(s, "style", solo(), null).style, solo().id);
});

test("holdStyleChoices: another style for one trip holds the active one; Keep makes it active, Back undoes", () => {
  const f = fam();
  const o = solo();
  const st = addStyle(addStyle(normalizeStyles(null), o), f);
  assert.equal(st.active, f.id);
  const base = { ...choicesFromStyle(f), travel_styles: st };
  const held = afterChoicesChange(holdStyleChoices(base, o.id));
  assert.equal(held.style_held, true);
  assert.equal(held.style_held_for, o.id);
  assert.equal(held.group_size, 1, "the picked style's stay half prices the trip");
  assert.equal(normalizeStyles(held.travel_styles).active, f.id, "the active style stays");
  const kept = keepChoices(held);
  assert.equal(normalizeStyles(kept.travel_styles).active, o.id, "Keep makes the trip's style the active one");
  assert.equal(kept.style_held, false);
  const back = switchChoices(held, f.id);
  assert.equal(back.group_size, 4);
  assert.equal(back.style_held, false);
  // The active style itself picked: no hold.
  assert.equal(holdStyleChoices(base, f.id).style_held, false);
  // A plain hold names no style, so an old trip's style never comes back on Keep.
  const plain = holdChoices({ ...back, style_held_for: o.id });
  assert.equal(plain.style_held_for, "");
  assert.equal(holdStyleChoices(base, "nope"), base);
});
