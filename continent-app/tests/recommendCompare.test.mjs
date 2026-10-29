// T802: the compare table's rows (src/lib/recommend/compare.js), pure, no
// DOM. The rows come in one order, each decidable row marks exactly one
// best cell, a tie or a single figure marks none, a missing figure is
// never the best, the budget row is gone without a budget, and every money
// cell is the trip's own slot or total, to the euro.
// Run: npm test (continent-app/). The catalogue test skips without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { compareRows, daysEur, doorMinutes, ROW_KEYS, MAX_COMPARE } from "../src/lib/recommend/compare.js";
import { threeFigures } from "../src/planner/finder/finderText.js";
import { findTrips } from "../src/lib/recommend/rank.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const slot = (id, eur, extra = {}) => ({ id, labelKey: `tf.slot.${id}`, owner: "carta", eur, eurGroup: eur == null ? null : eur * 2, ...extra });
const flight = (eur, minutes = 95) => slot("flight", eur, { pick: { facts: { out: { minutes }, stops: 0 } } });
const trip = (id, { fl = 142, stay = 322, food = 582, local = 38, pct = 91, budget = 1200, gw = 60, minutes = 95, places = ["a"] } = {}) => {
  const slots = [flight(fl, minutes), slot("stay", stay), slot("food", food), slot("local", local), slot("activities", null)];
  const perPerson = slots.reduce((n, s) => n + (s.eur ?? 0), 0);
  return {
    id, month: 5, nights: 7,
    places: places.map((p) => ({ id: p, nights: 7 })),
    gateway: gw == null ? null : { iata: "LJU", minutes: gw },
    slots,
    total: { perPerson, group: perPerson * 2 },
    budget: budget ? { eur: budget, delta: perPerson - budget } : null,
    match: pct == null ? null : { pct },
  };
};
const destinations = {
  a: { taste: { tmax_by_month: [0, 0, 0, 0, 21, 0, 0, 0, 0, 0, 0, 0], crowd_by_month: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0] } },
  b: { taste: { tmax_by_month: [0, 0, 0, 0, 25, 0, 0, 0, 0, 0, 0, 0], crowd_by_month: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
  c: { taste: { tmax_by_month: [0, 0, 0, 0, 17, 0, 0, 0, 0, 0, 0, 0], crowd_by_month: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] } },
};
const settings = { guide: { weather: "mild", budget: { kind: "total", eur: 1200 } } };
const row = (rows, key) => rows.find((r) => r.key === key);
const bestAt = (r) => r.cells.flatMap((c, i) => (c.best ? [i] : []));

test("the rows come in the plan's order, the budget last", () => {
  const rows = compareRows([trip("x"), trip("y", { stay: 300 })], { settings, destinations });
  assert.deepEqual(rows.map((r) => r.key), ROW_KEYS);
  assert.equal(MAX_COMPARE, 4);
});

test("one best per decidable row, in the right direction", () => {
  const trips = [
    trip("x", { fl: 142, stay: 322, food: 582, pct: 91, gw: 60, minutes: 95, places: ["a"] }),
    trip("y", { fl: 168, stay: 280, food: 480, pct: 84, gw: 30, minutes: 60, places: ["b"] }),
    trip("z", { fl: 118, stay: 497, food: 600, pct: 82, gw: 90, minutes: 70, places: ["c"] }),
  ];
  const rows = compareRows(trips, { settings, destinations });
  for (const r of rows) assert.ok(bestAt(r).length <= 1, `${r.key} marks at most one`);
  assert.deepEqual(bestAt(row(rows, "total")), [1], "lowest total");
  assert.deepEqual(bestAt(row(rows, "flight")), [2], "cheapest flight");
  assert.deepEqual(bestAt(row(rows, "stay")), [1]);
  assert.deepEqual(bestAt(row(rows, "match")), [0], "highest match");
  assert.deepEqual(bestAt(row(rows, "door")), [1], "x 155, y 90, z 160: lowest");
  assert.deepEqual(bestAt(row(rows, "weather")), [0], "21 is the mild answer's 21");
  assert.deepEqual(bestAt(row(rows, "crowds")), [1], "quietest");
  assert.deepEqual(bestAt(row(rows, "budget")), [1], "furthest under");
});

test("no best on a tie or with one figure", () => {
  const rows = compareRows([trip("x"), trip("y")], { settings, destinations });
  for (const r of rows) assert.deepEqual(bestAt(r), [], `${r.key} is tied`);
  const one = compareRows([trip("x", { pct: null }), trip("y", { pct: 80 })], { settings, destinations });
  assert.deepEqual(bestAt(row(one, "match")), [], "one figure decides nothing");
  const noWeather = compareRows([trip("x", { places: ["a"] }), trip("y", { places: ["b"] })], { settings: { guide: { weather: "", budget: {} } }, destinations });
  assert.deepEqual(bestAt(row(noWeather, "weather")), [], "no weather answer, no direction");
});

test("a missing figure is never the best", () => {
  const rows = compareRows([trip("x", { fl: null }), trip("y", { fl: 300 }), trip("z", { fl: 250, gw: null })], { settings, destinations });
  const fl = row(rows, "flight");
  assert.equal(fl.cells[0].value, null);
  assert.equal(fl.cells[0].best, false);
  assert.deepEqual(bestAt(fl), [2]);
  assert.equal(row(rows, "door").cells[2].value, null, "no gateway transfer, no door to door");
  // x's total leaves the flight out: shown, never the best, even when lowest.
  const total = row(rows, "total");
  assert.equal(total.cells[0].partial, true);
  assert.deepEqual(bestAt(total), [2]);
  assert.equal(row(rows, "budget").cells[0].best, false);
});

test("the budget row is hidden without a budget", () => {
  const rows = compareRows([trip("x", { budget: 0 }), trip("y", { budget: 0, stay: 200 })], { settings, destinations });
  assert.equal(rows.some((r) => r.key === "budget"), false);
  assert.deepEqual(rows.map((r) => r.key), ROW_KEYS.slice(0, -1));
});

test("door to door is the outbound flight plus the transfer", () => {
  assert.equal(doorMinutes(trip("x", { minutes: 95, gw: 60 })), 155);
  assert.equal(doorMinutes(trip("x", { minutes: null })), null);
});

const PUB = new URL("../public/", import.meta.url);
const hasData = existsSync(new URL("app_data.json", PUB));

test("on the catalogue: every money cell is the trip's own figure, to the euro", { skip: !hasData }, () => {
  const pub = (p) => JSON.parse(readFileSync(new URL(p, PUB), "utf8"));
  const data = pub("app_data.json");
  const flights = JSON.parse(readFileSync(new URL("./fixtures/tf1-flights-BRU.json", import.meta.url), "utf8"));
  const s = normalizeSettings({
    party: { kind: "couple", adults: 2 }, priority: "balance",
    when: { mode: "exact", start: "2026-11-21", end: "2026-11-28", nights: 7 },
    guide: { shapes: [], likes: ["hiking", "food"], weather: "mild", reach: "short", avoid: ["crowds"], budget: { kind: "total", eur: 1200 } },
  });
  const trips = findTrips({
    data, countryInsights: pub("country_insights.json").countries, layerIndexes: {}, settings: s,
    origin: { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" }, flights, today: "2026-10-28",
  });
  assert.ok(trips.length >= 4);
  for (let i = 0; i + 4 <= trips.length; i += 4) {
    const cols = trips.slice(i, i + 4);
    const rows = compareRows(cols, { settings: s, destinations: data.destinations });
    cols.forEach((t, k) => {
      const fig = threeFigures(t);
      assert.equal(row(rows, "total").cells[k].value, t.total.perPerson);
      assert.equal(row(rows, "flight").cells[k].value, fig.flight);
      assert.equal(row(rows, "stay").cells[k].value, fig.stay);
      assert.equal(row(rows, "days").cells[k].value, fig.days);
      assert.equal(daysEur(t), fig.days);
      assert.equal(row(rows, "budget").cells[k].value, t.budget.delta);
      assert.equal(row(rows, "match").cells[k].value, t.match?.pct ?? null);
    });
    for (const r of rows) assert.ok(bestAt(r).length <= 1);
  }
});
