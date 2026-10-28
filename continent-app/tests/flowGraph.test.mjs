// T653: which screens each kind of trip gets, in which order. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, answer } from "../src/planner/flow/tripSettings.js";
import {
  setupScreens, planScreens, dayScreens, fullFlow, hasDoors, nextScreen, prevScreen, firstOpenSetup,
} from "../src/planner/flow/flowGraph.js";
import { QUESTIONS, toggleValue } from "../src/planner/flow/questions.js";

const s = (patch) => normalizeSettings(patch);

test("nothing booked: every setup question, the doors, the guide", () => {
  const n = s({});
  assert.deepEqual(setupScreens(n), ["tell", "booked", "who", "sleep", "priority", "when", "from"]);
  assert.equal(hasDoors(n), true);
  assert.deepEqual(planScreens(n, "guide"), [
    "g:shape", "g:likes", "g:weather", "g:reach", "g:avoid", "g:budget", "g:pick",
    "p:Where", "p:Stay", "p:Getting", "p:Finish",
  ]);
  assert.deepEqual(planScreens(n, "ready"), ["p:Where", "p:Trips", "p:Getting", "p:Finish"]);
  assert.deepEqual(planScreens(n, "know"), ["p:Where", "p:Stay", "p:Getting", "p:Finish"]);
});

test("flights booked: no When, no From in setup; arrival asked in planning; no reach", () => {
  const f = s({ booked: { flights: true } });
  assert.deepEqual(setupScreens(f), ["tell", "booked", "who", "sleep", "priority"]);
  assert.deepEqual(planScreens(f, "guide"), [
    "g:shape", "g:likes", "g:weather", "g:avoid", "g:budget", "g:pick",
    "p:From", "p:Where", "p:Stay", "p:Getting", "p:Finish",
  ]);
});

test("stays booked: no doors, straight to the stays", () => {
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
  assert.equal(nextScreen(list, "from"), "create");
  assert.equal(nextScreen(list, "create"), "tripHome");
  assert.equal(nextScreen(list, "doors"), "g:shape");
  assert.equal(prevScreen(list, "tell"), null);
  assert.equal(prevScreen(list, "booked"), "tell");
  assert.equal(nextScreen(list, "daysHow"), null);
  let a = s({});
  for (const id of ["booked", "who"]) a = answer(a, id, {});
  assert.equal(firstOpenSetup(a), "sleep");
});

test("every screen in every flow has a question or a known page", () => {
  const pages = new Set(["create", "tripHome", "doors"]);
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
