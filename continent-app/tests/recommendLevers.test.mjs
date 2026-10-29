// T803: the trade-off levers (src/lib/recommend/rank.js). Each lever value
// names an existing setting, the food lever prices what a fresh build at
// that Lifestyle prices, the flight lever re-orders the trips on the swept
// facts (rule a) without touching a price, the same answers and levers
// always give the same order, and a bases lever that leaves no trip falls
// back to the whole list.
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import RECOMMEND from "../config/recommend.json" with { type: "json" };
import { LEVERS, applyLevers, findTrips, flightPull, FLIGHT_PULL } from "../src/lib/recommend/rank.js";
import { buildTrips } from "../src/lib/recommend/trips.js";
import { PROFILES } from "../src/lib/lifestyleProfiles.js";
import { normalizeSettings, LEVER_VALUES } from "../src/planner/flow/tripSettings.js";

test("each lever value maps to its setting", () => {
  assert.deepEqual(LEVERS.flight.values, { cheapest: "price", quickest: "comfort", times: "balanced" });
  assert.equal(LEVERS.flight.setting, "flightRank");
  assert.deepEqual(LEVERS.food.values, { cook: "Backpacker", mix: "Easygoing", out: "Foodie" });
  assert.equal(LEVERS.food.setting, "lifestyle");
  for (const v of Object.values(LEVERS.food.values)) assert.ok(PROFILES[v], `${v} is a Lifestyle preset`);
  assert.deepEqual(LEVERS.bases.values, { one: ["one"], several: ["towns", "road"] });
  assert.equal(LEVERS.bases.setting, "guide.shapes");
});

test("the settings keep the levers, and only known values", () => {
  const s = normalizeSettings({ guide: { levers: { flight: "quickest", food: "nope", bases: "one", extra: "x" } } });
  assert.deepEqual(s.guide.levers, { flight: "quickest", bases: "one" });
  assert.deepEqual(normalizeSettings({}).guide.levers, {});
  for (const [k, def] of Object.entries(LEVERS)) {
    assert.deepEqual(LEVER_VALUES[k], Object.keys(def.values), `the settings know every ${k} value`);
  }
});

const slot = (id, eur, facts = null) => ({ id, eur, eurGroup: eur == null ? null : eur * 2, owner: "carta", pick: facts ? { facts } : null, options: null });
const fake = (id, { eur, stops, dep = "10:00", arr = "12:00", minutes = 120, gw = 30, places = 1 }) => ({
  id,
  places: Array.from({ length: places }, (_, i) => ({ id: `${id}${i}`, nights: 2 })),
  gateway: { iata: "X", minutes: gw },
  slots: [slot("flight", eur, stops == null ? null : { stops, out: { dep, arr, stops, price: eur / 2, minutes }, back: { dep, arr, stops, price: eur / 2 } })],
});

test("the flight pull: the lever's order, ties share a place, no facts sit in the middle", () => {
  const trips = [
    fake("a", { eur: 300, stops: 0, dep: "06:00" }),
    fake("b", { eur: 120, stops: 1 }),
    fake("c", { eur: 200, stops: 0, minutes: 90 }),
    fake("d", { eur: null }),
  ];
  const cheap = flightPull(trips, "cheapest");
  assert.ok(cheap.get("b") < cheap.get("c") && cheap.get("c") < cheap.get("a"), "cheapest flight first");
  assert.equal(cheap.get("d"), FLIGHT_PULL / 2, "no figure: the middle");
  assert.equal(Math.max(...cheap.values()), FLIGHT_PULL);
  const quick = flightPull(trips, "quickest");
  assert.ok(quick.get("c") < quick.get("a") && quick.get("a") < quick.get("b"), "direct first, then door to door");
  const times = flightPull(trips, "times");
  assert.ok(times.get("c") < times.get("a"), "a 06:00 departure costs comfort");
  const tied = flightPull([fake("x", { eur: 100, stops: 0 }), fake("y", { eur: 100, stops: 0 })], "cheapest");
  assert.equal(tied.get("x"), tied.get("y"));
  assert.equal(flightPull(trips, null).size, 0, "no lever, no pull");
});

test("a bases lever that leaves no trip falls back to every trip", () => {
  const trips = [fake("a", { eur: 1, places: 2 }), fake("b", { eur: 1, places: 3 })];
  assert.deepEqual(applyLevers(trips, { bases: "one" }).map((t) => t.id), ["a", "b"]);
  assert.deepEqual(applyLevers([...trips, fake("c", { eur: 1 })], { bases: "one" }).map((t) => t.id), ["c"]);
});

const PUB = new URL("../public/", import.meta.url);
const hasData = existsSync(new URL("app_data.json", PUB));
const pub = (p) => JSON.parse(readFileSync(new URL(p, PUB), "utf8"));

function baseInput(extra = {}) {
  const data = pub("app_data.json");
  const flights = JSON.parse(readFileSync(new URL("./fixtures/tf1-flights-BRU.json", import.meta.url), "utf8"));
  const settings = normalizeSettings({
    party: { kind: "couple", adults: 2 }, priority: "balance",
    when: { mode: "exact", start: "2026-11-21", end: "2026-11-28", nights: 7 },
    guide: { shapes: [], likes: ["hiking", "food"], weather: "mild", reach: "short", avoid: ["crowds"], budget: { kind: "total", eur: 1200 } },
  });
  return {
    data, countryInsights: pub("country_insights.json").countries, layerIndexes: {}, settings,
    origin: { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" }, flights, today: "2026-10-28", ...extra,
  };
}

test("on the catalogue: the food lever prices what a fresh build at that Lifestyle prices", { skip: !hasData }, () => {
  const input = baseInput();
  for (const [lever, preset] of Object.entries(LEVERS.food.values)) {
    const levered = findTrips(input, { levers: { food: lever } });
    const fresh = new Map(buildTrips({ ...input, lifestyle: PROFILES[preset] }).map((t) => [t.id, t]));
    let n = 0;
    for (const t of levered) {
      const f = fresh.get(t.id);
      const food = (x) => x.slots.find((s) => s.id === "food").eur;
      if (!f || food(f) == null) continue;
      assert.equal(food(t), food(f), `${lever} ${t.id}: the food line, to the euro`);
      assert.ok(Math.abs(t.total.perPerson - t.slots.reduce((sum, s) => sum + (s.eur ?? 0), 0)) < 0.005, "the total is the slots, to the cent");
      n++;
    }
    assert.ok(n >= 10, `${lever}: compared ${n} trips`);
  }
});

test("on the catalogue: the flight lever re-orders under rule (a) and changes no price", { skip: !hasData }, () => {
  const input = baseInput();
  const plain = findTrips(input);
  const byId = new Map(plain.map((t) => [t.id, t.total.perPerson]));
  const orders = new Set([plain.map((t) => t.id).join()]);
  for (const flight of Object.keys(LEVERS.flight.values)) {
    const got = findTrips(input, { levers: { flight } });
    for (const t of got) assert.equal(t.total.perPerson, byId.get(t.id), `${flight} keeps ${t.id}'s price`);
    orders.add(got.map((t) => t.id).join());
  }
  assert.ok(orders.size >= 3, `the flight lever moves the order (${orders.size} distinct orders)`);
});

test("on the catalogue: the same answers and levers give the same order", { skip: !hasData }, () => {
  const levers = { flight: "times", food: "cook", bases: "several" };
  const a = findTrips(baseInput(), { levers }).map((t) => t.id);
  const b = findTrips(baseInput(), { levers: { ...levers } }).map((t) => t.id);
  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
  assert.equal(RECOMMEND.budget.sinkPer100 * 5, FLIGHT_PULL);
});
