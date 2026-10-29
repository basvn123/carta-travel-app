// T798: the priced trip card's words and figures (src/planner/finder/
// finderText.js), pure helpers only, no DOM. Every figure must be read from
// the trip's own slots, a missing one stays null (NotYet), never 0, and the
// card's parts must add up to the trip's own total.
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  threeFigures, barSegments, inclusions, totalLeavesOut, budgetLine, signedMoney, factText, matchBars,
  widenQuestion, answerChips, tripName, joinList,
} from "../src/planner/finder/finderText.js";
import { findTrips } from "../src/lib/recommend/rank.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const t = (k, v = {}) => `${k}${Object.keys(v).length ? JSON.stringify(v) : ""}`;

const slot = (id, eur, owner = "carta", extra = {}) => ({ id, labelKey: `tf.slot.${id}`, owner, eur, eurGroup: eur == null ? null : eur * 2, ...extra });
const trip = (over = {}) => ({
  id: "tf_x", country: "Slovenia", iso2: "SI", nights: 7, month: 5,
  places: [{ id: "a", nights: 4 }, { id: "b", nights: 3 }],
  party: { adults: 2, children: 0, babies: 0, head: 2 },
  slots: [slot("flight", 142), slot("stay", 322), slot("food", 582), slot("local", 38), slot("activities", null, "you")],
  total: { perPerson: 1084, group: 2168 },
  budget: { eur: 1200, delta: -116 },
  match: { pct: 91, bars: [{ key: "hiking", kind: "like", p: 0.93, place: "Bled" }, { key: "food", kind: "like", p: 0.71 }, { key: "warm", kind: "weather", p: 0.5 }], conflicts: [] },
  reasons: [{ key: "tf.reason.weather", facts: { c: 19, month: 5 } }],
  catch: { key: "tf.catch.busy", facts: { place: "Bled", month: 5 } },
  ...over,
});

test("the three figures: flight, stay, days (food plus getting around)", () => {
  assert.deepEqual(threeFigures(trip()), { flight: 142, stay: 322, days: 620 });
  const noFlight = trip({ slots: [slot("flight", null), slot("stay", 322), slot("food", 582), slot("local", 38)] });
  assert.equal(threeFigures(noFlight).flight, null, "a missing flight is null, never 0");
  assert.equal(totalLeavesOut(noFlight), true);
  assert.equal(totalLeavesOut(trip()), false, "things to do alone does not make the total partial");
});

test("the cost bar: slots with a figure, in slot order", () => {
  assert.deepEqual(barSegments(trip()).map((s) => s.id), ["flight", "stay", "food", "local"]);
});

test("the inclusions line: in, yours, not yet", () => {
  const t1 = trip({ slots: [slot("flight", 142), slot("stay", 322, "you"), slot("food", 582), slot("local", 38), slot("activities", null, "you")] });
  assert.deepEqual(inclusions(t1).map((x) => x.state), ["in", "yours", "in", "in", "notYet"]);
});

test("the budget ruler: under, over, on, none", () => {
  const under = budgetLine(trip(), { locale: "en" });
  assert.equal(under.key, "tf.budget.under");
  assert.equal(under.vars.delta, "€116");
  assert.equal(under.vars.eur, "€1,200");
  const over = budgetLine(trip({ budget: { eur: 1000, delta: 84 }, total: { perPerson: 1084, group: 2168 } }), { locale: "en" });
  assert.equal(over.key, "tf.budget.over");
  assert.equal(over.over, true);
  assert.equal(over.fill, 1);
  assert.equal(budgetLine(trip({ budget: { eur: 1084, delta: 0 } })).key, "tf.budget.on");
  assert.equal(budgetLine(trip({ budget: null })), null);
});

test("signed money: the plan total's plus and minus", () => {
  assert.equal(signedMoney(24, { locale: "en" }), "+€24");
  assert.equal(signedMoney(-24, { locale: "en" }), "-€24");
  assert.equal(signedMoney(NaN), "");
});

test("a reason and the catch in the traveller's words", () => {
  assert.equal(factText({ key: "tf.reason.weather", facts: { c: 19, month: 5 } }, { t, lang: "en" }), 'tf.reason.weather{"c":19,"month":"May"}');
  const c = factText({ key: "tf.catch.budget", facts: { over: 84, eur: 1200 } }, { t, lang: "en" });
  assert.ok(c.includes('"over":"€84"') && c.includes('"eur":"€1,200"'), c);
  assert.ok(factText({ key: "tf.reason.near", facts: { like: "hiking", place: "Bled", best: "Vintgar", minutes: 12 } }, { t, lang: "en" }).includes('"like":"pf.like.hiking"'));
});

test("why this match: likes only, strongest first, whole percentages", () => {
  assert.deepEqual(matchBars(trip()).map((b) => [b.key, b.pct]), [["hiking", 93], ["food", 71]]);
  assert.deepEqual(matchBars(trip({ match: null })), []);
});

test("an empty result reopens budget, then reach", () => {
  const guide = ["g:shape", "g:likes", "g:weather", "g:reach", "g:avoid", "g:budget", "g:pick"];
  const s = normalizeSettings({ guide: { reach: "short", budget: { kind: "total", eur: 900 } } });
  assert.equal(widenQuestion(s, guide), "g:budget");
  const r = normalizeSettings({ guide: { reach: "short" } });
  assert.equal(widenQuestion(r, guide), "g:reach");
  assert.equal(widenQuestion(normalizeSettings({}), guide), "g:shape");
});

test("the answers chips name the question each reopens", () => {
  const s = normalizeSettings({
    when: { mode: "months", months: [5], nights: 7 },
    guide: { shapes: ["towns"], likes: ["hiking"], weather: "mild", reach: "short", avoid: ["crowds"], budget: { kind: "total", eur: 1200 } },
  });
  const chips = answerChips(s, { t, lang: "en", originName: "Brussels", trip: trip(), locale: "en" });
  assert.deepEqual(chips.map((c) => c.q), ["from", "when", "g:shape", "g:likes", "g:weather", "g:reach", "g:avoid", "g:budget"]);
  assert.ok(chips[1].label.startsWith("tf.chip.nightsIn"), "no setup dates: the trip's own length and month");
  assert.ok(chips.at(-1).label.includes("€1,200"));
});

test("names join the way the language joins a list", () => {
  assert.equal(joinList(["Bled", "Ljubljana"], "en"), "Bled and Ljubljana");
  assert.equal(tripName({ places: [{ id: "a" }, { id: "b" }, { id: "c" }] }, { a: { city: "Bled" }, b: { city: "Piran" }, c: { city: "Ljubljana" } }, "en"), "Bled, Piran and Ljubljana");
});

// The real engine: every card's parts add up to its own total.
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");

test("on the real catalogue the three figures and things to do add up to the card total", { skip: data ? false : "no public/app_data.json" }, () => {
  const settings = normalizeSettings({
    answered: ["who", "when"], party: { kind: "couple", adults: 2 }, priority: "balance",
    when: { mode: "exact", start: "2027-05-09", end: "2027-05-16", nights: 7 },
    guide: { shapes: ["towns"], likes: ["hiking", "food"], weather: "mild", reach: "short", avoid: ["crowds"], budget: { kind: "total", eur: 1200 } },
  });
  const trips = findTrips({ data, settings, origin: { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" }, today: "2026-10-28" });
  assert.ok(trips.length >= 6);
  for (const x of trips) {
    const f = threeFigures(x);
    const sum = (f.flight || 0) + (f.stay || 0) + (f.days || 0);
    assert.equal(sum, x.total.perPerson, `${x.id}: three figures ${sum} against total ${x.total.perPerson}`);
    assert.ok(x.match?.pct == null || x.match.pct >= 55, "the match shows from 55% up");
  }
});
