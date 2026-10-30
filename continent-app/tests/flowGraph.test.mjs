// T653: which screens each kind of trip gets, in which order. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, answer } from "../src/planner/flow/tripSettings.js";
import {
  setupScreens, planScreens, dayScreens, fullFlow, hasDoors, nextScreen, prevScreen, firstOpenSetup,
} from "../src/planner/flow/flowGraph.js";
import { QUESTIONS, toggleValue } from "../src/planner/flow/questions.js";

const s = (patch) => normalizeSettings(patch);

test("nothing booked: every setup question, then the guide", () => {
  const n = s({});
  assert.deepEqual(setupScreens(n), ["tell", "booked", "who", "sleep", "priority", "when", "from", "way", "airports"]);
  assert.equal(hasDoors(n), true);
  assert.deepEqual(planScreens(n, "guide"), [
    "g:persona", "g:shape", "g:likes", "g:weather", "g:reach", "g:around", "g:avoid", "g:budget", "g:pick", "g:how", "g:trips",
    "p:Where", "p:Stay", "p:Getting", "p:Finish",
  ]);
  assert.deepEqual(planScreens(n, "ready"), ["p:Where", "p:Trips", "p:Getting", "p:Finish"]);
  assert.deepEqual(planScreens(n, "know"), ["p:Where", "p:Stay", "p:Getting", "p:Finish"]);
});

test("flights booked: no When, no From in setup; arrival asked in planning; no reach", () => {
  const f = s({ booked: { flights: true } });
  assert.deepEqual(setupScreens(f), ["tell", "booked", "who", "sleep", "priority"]);
  assert.deepEqual(planScreens(f, "guide"), [
    "g:persona", "g:shape", "g:likes", "g:weather", "g:around", "g:avoid", "g:budget", "g:pick", "g:how", "g:trips",
    "p:From", "p:Where", "p:Stay", "p:Getting", "p:Finish",
  ]);
});

test("T860: the airports in reach are asked only for a way there that may fly", () => {
  for (const way of ["", "any", "plane"]) assert.ok(setupScreens(s({ way })).includes("airports"), way);
  for (const way of ["train", "car"]) {
    const list = setupScreens(s({ way }));
    assert.ok(list.includes("way") && !list.includes("airports"), way);
  }
  assert.equal(s({ way: "boat" }).way, "");
});

test("stays booked: the engine goes straight to the stays; no doors screen (plan flow walk)", () => {
  const st = s({ booked: { stays: true } });
  assert.equal(hasDoors(st), false);
  assert.deepEqual(planScreens(st, "guide"), ["p:Stays", "p:Getting", "p:Finish"]);
  assert.ok(!fullFlow(st).includes("doors"));
});

test("both booked: stays then review", () => {
  const b = s({ booked: { flights: true, stays: true } });
  assert.deepEqual(planScreens(b), ["p:From", "p:Stays", "p:Finish"]);
});

test("day screens skip answered rhythm unless asked for all", () => {
  let d = s({});
  d = answer(d, "r:pace", { rhythm: { ...d.rhythm, pace: "slow" } });
  assert.ok(!dayScreens(d).includes("r:pace"));
  assert.ok(dayScreens(d, { all: true }).includes("r:pace"));
  assert.equal(dayScreens(d)[0], "daysAsk");
  assert.equal(dayScreens(d).at(-1), "daysHow");
});

test("next, prev and the first open setup question", () => {
  const list = fullFlow(s({}), "guide");
  assert.equal(nextScreen(list, "from"), "way");
  assert.equal(nextScreen(list, "airports"), "create");
  assert.equal(nextScreen(list, "create"), "tripHome");
  assert.equal(nextScreen(list, "tripHome"), "g:persona");
  assert.equal(prevScreen(list, "tell"), null);
  assert.equal(prevScreen(list, "booked"), "tell");
  assert.equal(nextScreen(list, "daysHow"), null);
  let a = s({});
  for (const id of ["booked", "who"]) a = answer(a, id, {});
  assert.equal(firstOpenSetup(a), "sleep");
});

test("every screen in every flow has a question or a known page", () => {
  const pages = new Set(["create", "tripHome", "g:trips"]);
  for (const booked of [{}, { flights: true }, { stays: true }, { flights: true, stays: true }]) {
    for (const door of ["guide", "know", "ready"]) {
      for (const id of fullFlow(s({ booked }), door)) {
        if (id.startsWith("p:") || pages.has(id)) continue;
        assert.ok(QUESTIONS[id], `${id} has no question`);
      }
    }
  }
});

test("question read and write round trip", () => {
  const q = QUESTIONS.booked;
  const base = s({});
  assert.deepEqual(q.read(base), ["nothing"]);
  const after = s({ ...base, ...q.write(base, ["flights", "car"]) });
  assert.deepEqual(q.read(after).sort(), ["car", "flights"]);
  const r = QUESTIONS["r:food"];
  const fed = s({ ...base, ...r.write(base, ["cook"]) });
  assert.deepEqual(r.read(fed), ["cook"]);
});

test("toggle: none clears the rest, max drops the oldest", () => {
  const q = QUESTIONS.booked;
  assert.deepEqual(toggleValue(q, ["nothing"], "flights"), ["flights"]);
  assert.deepEqual(toggleValue(q, ["flights", "stays"], "nothing"), ["nothing"]);
  assert.deepEqual(toggleValue(q, ["flights"], "flights"), ["nothing"]);
  const likes = QUESTIONS["g:likes"];
  assert.deepEqual(toggleValue(likes, ["beach", "food", "city"], "hiking"), ["food", "city", "hiking"]);
  assert.deepEqual(toggleValue(QUESTIONS.priority, ["price"], "comfort"), ["comfort"]);
});

test("a trip under way asks where you are and until when, not When and From", () => {
  const s = normalizeSettings({ kind: "now", booked: { flights: true } });
  assert.deepEqual(setupScreens(s), ["tell", "booked", "who", "sleep", "priority", "nowWhere", "nowUntil"]);
  assert.equal(normalizeSettings({ kind: "later" }).kind, "new");
  assert.deepEqual(normalizeSettings({ now: { name: "Porto", lat: 41.1, lon: -8.6, countryCode: "PT" } }).now, { name: "Porto", lat: 41.1, lng: -8.6, countryCode: "PT" });
});

test("T797: the trips come after question 7 and are not a question", async () => {
  const { guideQuestions, guideScreens, TRIPS_SCREEN } = await import("../src/planner/flow/flowGraph.js");
  const n = s({});
  assert.equal(guideScreens(n).at(-1), TRIPS_SCREEN);
  assert.equal(guideQuestions(n).at(-1), "g:how");
  assert.ok(!guideQuestions(n).includes(TRIPS_SCREEN));
  assert.equal(guideQuestions(n).length, 10);
  assert.equal(nextScreen(planScreens(n, "guide"), "g:pick"), "g:how");
  assert.equal(nextScreen(planScreens(n, "guide"), "g:how"), "g:trips");
  assert.equal(nextScreen(planScreens(n, "guide"), "g:trips"), "p:Where");
});

test("plan flow walk: how to plan is the trip door, the whole trip by default", () => {
  const q = QUESTIONS["g:how"];
  const base = s({});
  assert.deepEqual(q.read(base), ["guide"]);
  const ff = s({ ...base, ...q.write(base, ["flight"]) });
  assert.equal(ff.door, "flight");
  assert.deepEqual(q.read(ff), ["flight"]);
  assert.equal(s({ ...ff, ...q.write(ff, ["guide"]) }).door, "guide");
});

test("plan flow walk: Continue skips only what the words answered, never a screen answer", async () => {
  const { continueTo, setupScreens: setup } = await import("../src/planner/flow/flowGraph.js");
  const { markAnswered } = await import("../src/planner/flow/tripSettings.js");
  let a = s({});
  for (const id of ["booked", "who", "sleep", "priority"]) a = markAnswered(a, id);
  const list = [...setup(a), "create"];
  // Back on Booked, Continue goes to Who (answered on its screen), not past it.
  assert.equal(continueTo(list, "booked", a, "create"), "who");
  // Who answered by the sentence only is passed over.
  const w = markAnswered(s({}), "who", "words");
  assert.equal(continueTo([...setup(w), "create"], "booked", w, "create"), "sleep");
  // Seen on its screen, the same question is the next stop again.
  assert.equal(continueTo([...setup(w), "create"], "booked", markAnswered(w, "who"), "create"), "who");
});

test("plan flow walk: no flying (train, car, or How far 'No flying') drops every flight question", async () => {
  const { noFlying, guideScreens: guide } = await import("../src/planner/flow/flowGraph.js");
  for (const way of ["train", "car"]) {
    const g = s({ way });
    assert.ok(noFlying(g), way);
    assert.ok(!setupScreens(g).includes("airports"), `${way}: no airports`);
    assert.ok(!guide(g).includes("g:reach") && !guide(g).includes("g:how"), `${way}: no reach, no flights first`);
  }
  const overland = s({ guide: { reach: "overland" } });
  assert.ok(noFlying(overland) && !guide(overland).includes("g:how"));
  for (const way of ["", "any", "plane"]) assert.ok(!noFlying(s({ way })) && guide(s({ way })).includes("g:how"), way || "unset");
});

test("plan flow walk: a group budget keeps its total and follows the party", () => {
  const fam = s({ party: { kind: "family", adults: 2, kids: 2 }, guide: { budget: { kind: "total", per: "group", groupEur: 4000 } } });
  assert.deepEqual(fam.guide.budget, { kind: "total", per: "group", groupEur: 4000, eur: 1000 });
  // One more traveller: the total stands, the figure a person follows.
  const five = s({ ...fam, party: { ...fam.party, kids: 3 } });
  assert.equal(five.guide.budget.groupEur, 4000);
  assert.equal(five.guide.budget.eur, 800);
  // A person's budget, and an older budget with no basis, read as per person.
  assert.deepEqual(s({ guide: { budget: { kind: "total", eur: 900 } } }).guide.budget, { kind: "total", per: "person", eur: 900 });
  // A day budget is always a person's.
  assert.equal(s({ guide: { budget: { kind: "day", per: "group", groupEur: 500 } } }).guide.budget.per, "person");
});
