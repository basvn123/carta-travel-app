// T794: the trip finder's order, budget ruler, match, reasons and catch
// (lib/recommend/rank.js, reasons.js). The rules are pinned on small
// hand-built trips; the plan's example answers then run on the published
// catalogue, and the time to build and rank 24 trips is measured.
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  rankTrips, findTrips, budgetRuler, budgetOf, applyLevers, qualifies, LEVERS, RANK, blendOf, matchPct,
} from "../src/lib/recommend/rank.js";
import { tripFit, reasonsFor, catchFor } from "../src/lib/recommend/reasons.js";
import { SLOT_ROWS, slotTotals } from "../src/lib/recommend/slots.js";
import { buildTrips } from "../src/lib/recommend/trips.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { tasteFor } from "../src/lib/recommend/candidates.js";
import { MATCH } from "../src/lib/match.js";
import { en } from "../src/i18n/en.js";
import { de } from "../src/i18n/de.js";
import { nl } from "../src/i18n/nl.js";
import { fr } from "../src/i18n/fr.js";
import { es } from "../src/i18n/es.js";
import { it as itLang } from "../src/i18n/it.js";
import SLOTS from "../config/slots.json" with { type: "json" };

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";

const settings = (guide = {}, over = {}) => normalizeSettings({
  answered: ["who", "when"],
  party: { kind: "couple", adults: 2 },
  when: { mode: "exact", start: "2027-05-09", end: "2027-05-16", nights: 7 },
  guide: { shapes: ["towns"], likes: ["hiking"], weather: "mild", reach: "short", avoid: [], budget: { kind: "total", eur: 1000 }, ...guide },
  ...over,
});

// ---- hand-built trips ------------------------------------------------------

const crowd = (tier) => Array(12).fill(tier);
const place = (city, hiking, { score = 8, tier = 0, tmax = 20, car = false } = {}) => ({
  city,
  rating: { score },
  taste: {
    likes: { hiking: [hiking, { n: 4, best: `${city} trail`, band: "good", minutes: 12 }], food: [0.3, { known: "tag" }] },
    crowd_by_month: crowd(tier), car_need: car, tmax_by_month: Array(12).fill(tmax),
  },
});
const DESTS = {
  a: place("Alpha", 0.9),
  b: place("Bravo", 0.8, { score: 9 }),
  c: place("Charlie", 0.2, { score: 9.5 }),
  d: place("Delta", 0.9, { tier: 3 }),
  e: place("Echo", 0.95, { score: 9 }),
};
const FAKE = { destinations: DESTS };
const slotRow = (id, eur, extra = {}) => ({ id, labelKey: `tf.slot.${id}`, owner: "carta", eur, eurGroup: eur == null ? null : eur * 2, pick: null, options: null, because: null, quality: "modelled", ...extra });
const fakeTrip = (id, placeId, perPerson, extra = {}) => {
  const slots = [slotRow("flight", 100), slotRow("stay", perPerson - 300), slotRow("food", 150), slotRow("local", 50), slotRow("activities", null)];
  return {
    id, country: "Testland", iso2: "TL", places: [{ id: placeId, nights: 7 }], month: 5, nights: 7,
    gateway: { iata: "TST", minutes: 30, mode: "bus" }, slots, total: slotTotals(slots), signals: {}, ...extra,
  };
};

test("the budget ruler: under is negative, over positive, none is null", () => {
  const s = settings();
  const t = fakeTrip("t1", "a", 884);
  assert.deepEqual(budgetRuler(t, s), { eur: 1000, delta: -116 });
  assert.deepEqual(budgetRuler(fakeTrip("t2", "a", 1100), s), { eur: 1000, delta: 100 });
  assert.equal(budgetRuler(t, settings({ budget: { kind: "total", eur: 0 } })), null);
  assert.equal(budgetOf(settings({ budget: { kind: "day", eur: 100 } }), 7), 700);
});

test("the budget ranks: a trip over it sinks by the configured amount", () => {
  // Echo fits better and rates higher, so only the budget can sink it (T884: answers lead).
  const trips = [fakeTrip("over", "e", 1400), fakeTrip("under", "a", 900)];
  const none = rankTrips(trips, { settings: settings({ budget: { kind: "total", eur: 0 } }), data: FAKE });
  assert.equal(none[0].id, "over", "without a budget the better place leads");
  const withBudget = rankTrips(trips, { settings: settings(), data: FAKE });
  assert.equal(withBudget[0].id, "under", "over budget, it sinks");
  const o1 = none.find((t) => t.id === "over");
  const o2 = withBudget.find((t) => t.id === "over");
  // 0.3 points (of 10) a hundred euros over, on the blend's 0..1 scale (T884).
  assert.ok(Math.abs((o1.score - o2.score) - ((400 / 100) * 0.3) / 10) < 1e-9);
});

test("fit first: a trip whose main like reads under the minimum ranks below", () => {
  const trips = [fakeTrip("weak", "c", 800), fakeTrip("fits", "a", 800)];
  const ranked = rankTrips(trips, { settings: settings(), data: FAKE });
  assert.deepEqual(ranked.map((t) => t.id), ["fits", "weak"]);
  assert.equal(ranked[1].qualified, false);
  assert.equal(RANK.mainLikeMin, 0.5);
  // A hard conflict disqualifies too: a car needed by a traveller without one.
  const s = settings({ avoid: ["car"] });
  const info = tripFit(fakeTrip("car", "a", 800), tasteFor(s), { a: place("Alpha", 0.9, { car: true }) });
  assert.equal(qualifies(info, s), false);
});

test("the match shows from match.show_min up, else null", () => {
  const s = settings({ avoid: ["crowds"] });
  const strong = tripFit(fakeTrip("s", "a", 800), tasteFor(s), DESTS);
  assert.equal(strong.pct, Math.round(strong.F * 100));
  const busy = tripFit(fakeTrip("b", "d", 800), tasteFor(s), DESTS);
  assert.ok(busy.F < MATCH.show_min, "a busy month for a quiet traveller pulls the fit down");
  assert.equal(busy.pct, null);
  const [r] = rankTrips([fakeTrip("b", "d", 800)], { settings: s, data: FAKE });
  assert.equal(r.match.pct, null);
  assert.ok(r.match.conflicts.some((c) => c.key === "busy"));
});

test("reasons: at most three, the like first, in the traveller's terms", () => {
  const s = settings({ avoid: ["crowds"] });
  const info = tripFit(fakeTrip("r", "a", 800), tasteFor(s), DESTS);
  const reasons = reasonsFor(fakeTrip("r", "a", 800), { settings: s, info });
  assert.ok(reasons.length >= 1 && reasons.length <= 3);
  assert.deepEqual(reasons[0], { key: "tf.reason.near", facts: { like: "hiking", place: "Alpha", best: "Alpha trail", minutes: 12, n: 4 } });
  assert.ok(reasons.some((r) => r.key === "tf.reason.weather" && r.facts.c === 20 && r.facts.month === 5));
  assert.ok(reasons.some((r) => r.key === "tf.reason.quiet"));
});

test("the catch: a conflict first, then the budget, then a long travel day", () => {
  const s = settings({ avoid: ["crowds"] });
  const busy = fakeTrip("x", "d", 1200);
  const ib = tripFit(busy, tasteFor(s), DESTS);
  assert.equal(catchFor(busy, { info: ib, budget: budgetRuler(busy, s) }).key, "tf.catch.busy");
  const over = fakeTrip("y", "a", 1200);
  const io = tripFit(over, tasteFor(s), DESTS);
  assert.deepEqual(catchFor(over, { info: io, budget: budgetRuler(over, s) }), { key: "tf.catch.budget", facts: { over: 200, eur: 1000 } });
  const far = fakeTrip("z", "a", 800, { gateway: { iata: "TST", minutes: 150, mode: "bus" } });
  assert.equal(catchFor(far, { info: io, budget: budgetRuler(far, s) }).key, "tf.catch.longDay");
});

test("levers swap a slot to an option or narrow the shapes; nothing else", () => {
  const food = (eur) => slotRow("food", eur, {
    options: [{ id: "cook", eur: 90, eurGroup: 180, delta: -60 }, { id: "mix", eur: 150, eurGroup: 300, delta: 0 }, { id: "out", eur: 240, eurGroup: 480, delta: 90 }],
  });
  const t = fakeTrip("l", "a", 800);
  t.slots = t.slots.map((x) => (x.id === "food" ? food(150) : x));
  t.total = slotTotals(t.slots);
  const [cook] = applyLevers([t], { food: "cook" });
  assert.equal(cook.total.perPerson, t.total.perPerson - 60);
  const [out] = applyLevers([t], { food: "out" });
  assert.equal(out.total.perPerson, t.total.perPerson + 90);
  assert.equal(applyLevers([t], { food: "feast" })[0], t);
  const two = { ...fakeTrip("two", "a", 800), places: [{ id: "a", nights: 4 }, { id: "b", nights: 3 }] };
  assert.deepEqual(applyLevers([t, two], { bases: "one" }).map((x) => x.id), ["l"]);
  assert.deepEqual(applyLevers([t, two], { bases: "several" }).map((x) => x.id), ["two"]);
  // The food lever's levels are the food slot's own options (config/slots.json).
  const row = SLOTS.slots.find((r) => r.id === "food");
  for (const o of row.options) assert.equal(LEVERS.food.values[o.id], o.lifestyle);
});

test("ranking leaves the built trips as they were", () => {
  const trips = [fakeTrip("a1", "a", 800)];
  const before = JSON.stringify(trips);
  rankTrips(trips, { settings: settings(), data: FAKE, levers: { food: "cook" } });
  assert.equal(JSON.stringify(trips), before);
});

test("every reason, catch, budget and option key is in all six languages", () => {
  const langs = { en, de, nl, fr, es, it: itLang };
  const keys = Object.keys(en).filter((k) => /^tf\.(reason|catch|budget|opt)\./.test(k));
  assert.ok(keys.length >= 40);
  for (const [name, dict] of Object.entries(langs)) {
    for (const k of keys) assert.ok(dict[k], `${name} has ${k}`);
  }
  for (const k of ["tf.reason.near", "tf.catch.busy", "tf.budget.under"]) {
    assert.ok(!/[€—–·~]/.test(en[k]), `${k} has no euro sign, dash or tilde`);
  }
});

// ---- the example answers, on the published catalogue ------------------------

const layerIndexes = data ? {
  trails: read("trails/index.json"), beaches: read("beaches/index.json"), lakes: read("lakes/index.json"),
  mountains: read("mountains/index.json"), cycling: read("cycling/index.json"),
} : {};
const countryInsights = read("country_insights.json")?.countries || null;
const example = (shapes = ["towns"]) => settings({ shapes, likes: ["hiking", "food"], avoid: ["crowds"], budget: { kind: "total", eur: 1200 } });
const input = (s) => ({ data, countryInsights, layerIndexes, settings: s, origin: { iata: "BRU", lat: 50.85, lon: 4.35 }, flights: null, today: "2026-10-28" });

test("the example answers: every trip carries a match or null, up to 3 reasons and a catch", { skip }, () => {
  const trips = findTrips(input(example()));
  assert.ok(trips.length >= 6);
  for (const t of trips) {
    assert.ok(t.match === null || t.match.pct === null || t.match.fit >= MATCH.show_min * 100);
    if (t.match?.pct != null) assert.equal(t.match.pct, matchPct(t.score), "the badge is the ranked score");
    assert.ok(t.reasons.length <= 3);
    for (const r of t.reasons) assert.ok(r.key.startsWith("tf.reason."), r.key);
    assert.ok(t.catch && t.catch.key.startsWith("tf.catch."), `${t.country} has a catch`);
    assert.deepEqual(t.budget, { eur: 1200, delta: t.total.perPerson - 1200 });
    assert.deepEqual(t.slots.map((s) => s.id), SLOT_ROWS.map((r) => r.id));
  }
  for (let i = 1; i < trips.length; i++) {
    const [a, b] = [trips[i - 1], trips[i]];
    assert.ok(a.qualified > b.qualified || (a.qualified === b.qualified && a.score >= b.score), "ranked best first");
  }
});

test("time to build and rank 24 trips (target under 50 ms after warm-up)", { skip }, (t) => {
  const s = example([]);
  const once = findTrips(input(s));
  assert.equal(once.length, 24, "any shape: eight countries times three shapes");
  const fresh = () => ({ ...input(s), data: { ...data } });
  const build = [];
  const rank = [];
  for (let i = 0; i < 5; i++) {
    const inp = fresh();
    let a = performance.now();
    const trips = buildTrips(inp);
    build.push(performance.now() - a);
    a = performance.now();
    rankTrips(trips, { settings: s, data, levers: { food: i % 2 ? "cook" : "out" } });
    rank.push(performance.now() - a);
  }
  const med = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
  t.diagnostic(`build 24 trips (memo miss) median ${med(build).toFixed(1)} ms; re-rank with a lever median ${med(rank).toFixed(2)} ms`);
  assert.ok(med(rank) < 50, "a lever re-ranks in under 50 ms");
});

test("the badge is the ranked score: the order follows the number shown (T884)", () => {
  // A strong fit in an average place outranks a weak fit in the best rated one.
  const s = settings({ budget: { kind: "total", eur: 0 } });
  const trips = [fakeTrip("famous", "c", 800), fakeTrip("fits", "a", 800)];
  const ranked = rankTrips(trips, { settings: s, data: FAKE });
  for (const t of ranked) if (t.match?.pct != null) assert.equal(t.match.pct, matchPct(t.score));
  const shown = ranked.filter((t) => t.match?.pct != null).map((t) => t.match.pct);
  assert.deepEqual(shown, [...shown].sort((a, b) => b - a), "the shown figures fall down the list");
  assert.equal(blendOf(0.8, null, 6), 0.6 * 0.8 + 0.4 * 0.6);
  assert.equal(blendOf(0.8, 0.4, null), 0.75 * 0.8 + 0.25 * 0.4);
  assert.equal(blendOf(null, null, 7), 0.7);
  assert.equal(matchPct(1.2), 99);
});
