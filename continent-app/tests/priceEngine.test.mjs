// T662 (F2): the price engine, lib/price/. Invariants V3, V6 (bed) and V7
// of plan "Carta prijslogica Explore" section 8; V1 and V2 live in
// priceGolden.test.mjs and priceSources.test.mjs, V8 in liveStays.test.mjs.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import { PROFILES } from "../src/lib/lifestyleProfiles.js";
import {
  DEFAULT_PRICE_REQUEST, priceRequest, priceDay, priceDays, costChoices, flightWindow, seatsOf, foodBreakdown,
} from "../src/lib/price/index.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/price/destinations.json", import.meta.url), "utf8"));
setStayRecords(FX.stays);
const ALL = FX.destinations;
const IDS = Object.keys(ALL);
const TIERS = ["dorm", "private", "room", "home", "hotel2", "hotel3", "hotel4", "hotel5"];
const c100 = (v) => Math.round(v * 100);

// A small deterministic generator, so a failing case can be replayed.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

function randomRequest(r) {
  const start = `2027-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`;
  const nights = 1 + Math.floor(r() * 13);
  const end = new Date(Date.parse(start) + nights * 864e5).toISOString().slice(0, 10);
  const seats = 1 + Math.floor(r() * 9);
  return priceRequest({
    choices: { group_size: seats, children: Math.floor(r() * seats), babies: Math.floor(r() * 2),
      stay_tier: pick(r, TIERS), lifestyle: { ...PROFILES[pick(r, Object.keys(PROFILES))] } },
    departDate: start, returnDate: end, ownDates: true,
    dateFlex: pick(r, [null, null, "month", "any"]),
    excluded: r() < 0.2 ? [pick(r, ["bed", "food"])] : [],
    today: "2026-10-24",
  });
}

test("B5: the default request is two people, an entire place, Easygoing, any time", () => {
  const d = DEFAULT_PRICE_REQUEST;
  assert.deepEqual(d.group, { adults: 2, children: 0, babies: 0 });
  assert.equal(d.stay, "home");
  assert.equal(d.when.kind, "any");
  assert.equal(d.nights, 7);
  assert.equal(d.view, "pp");
  assert.deepEqual(priceRequest({}).group, d.group);
  assert.equal(priceRequest({}).when.kind, "any");
});

test("V3: the lines add up; the day is the total over the seats and the nights", () => {
  const r = rng(653);
  let priced = 0;
  for (let i = 0; i < 400; i += 1) {
    const req = randomRequest(r);
    const row = priceDay(ALL[pick(r, IDS)], req, ALL);
    if (row.dayEur == null) continue;
    priced += 1;
    const n = req.nights, p = seatsOf(req);
    const lines = row.lines.filter((l) => l.status === "included");
    const lineTotals = lines.map((l) => c100(l.eur) * p * n);
    const total = lineTotals.reduce((s, v) => s + v, 0);
    assert.equal(c100(row.dayEur) * p * n, total, "total = day x seats x nights");
    assert.equal(total / p / n, c100(row.dayEur), "day = total / seats / nights");
    for (const l of row.lines) {
      if (l.eur != null) assert.ok(Math.abs(l.eur * 100 - Math.round(l.eur * 100)) < 1e-6, `${l.key} in whole cents`);
    }
  }
  assert.ok(priced > 300, `${priced} of 400 priced`);
});

test("an excluded item leaves the sum and is marked, never deleted (rule 9)", () => {
  const req = priceRequest({ excluded: ["food"] });
  const row = priceDay(ALL["gem:como"], req, ALL);
  const food = row.lines.find((l) => l.key === "food");
  assert.equal(food.status, "excluded");
  assert.ok(food.eur > 0);
  assert.equal(row.dayEur, row.lines.find((l) => l.key === "bed").eur);
});

test("an item without data is missing, never zero (rule 8)", () => {
  const row = priceDay(ALL.LIS, DEFAULT_PRICE_REQUEST, ALL);
  for (const k of ["transport", "activities"]) {
    const l = row.lines.find((x) => x.key === k);
    assert.equal(l.eur, null, k);
    assert.equal(l.quality, "missing", k);
    assert.notEqual(l.status, "included", k);
  }
  // T702: the car is priced, but not in the day unless the traveller goes by car.
  const car = row.lines.find((x) => x.key === "car");
  assert.ok(car.eur > 0);
  assert.equal(car.status, "not_included");
  const noIso = priceDay({ ...ALL.LIS, id: "Y", iso2: null }, DEFAULT_PRICE_REQUEST, ALL).lines.find((x) => x.key === "car");
  assert.equal(noIso.eur, null);
  assert.equal(noIso.quality, "missing");
  const noFood = { ...ALL.LIS, id: "X", costs: null };
  assert.equal(priceDay(noFood, DEFAULT_PRICE_REQUEST, ALL).dayEur, null);
});

test("T702: a car hire is never in the day, going by car or not", () => {
  const byCar = priceRequest({ choices: { transport_mode: "car" } });
  for (const id of IDS) {
    const base = priceDay(ALL[id], DEFAULT_PRICE_REQUEST, ALL);
    const row = priceDay(ALL[id], byCar, ALL);
    const car = row.lines.find((x) => x.key === "car");
    assert.equal(car.status, "not_included", id);
    assert.equal(car.basis.chosen, true, id);
    assert.equal(row.dayEur, base.dayEur, `${id}: going by car does not move the day`);
  }
});

test("V6 (car): a bigger party never pays more a head for the car, unless it fills another car", () => {
  const cap = 4;
  for (const id of IDS) {
    let prev = null;
    for (let seats = 1; seats <= 12; seats += 1) {
      const req = priceRequest({ choices: { group_size: seats, transport_mode: "car" } });
      const car = priceDay(ALL[id], req, ALL).lines.find((x) => x.key === "car");
      if (car.eur == null) break;
      assert.equal(car.basis.cars, Math.ceil(seats / cap), `${id} ${seats}`);
      if (prev && car.eur > prev.eur) assert.ok(car.basis.cars > prev.basis.cars, `${id} ${seats}: ${prev.eur} -> ${car.eur}`);
      prev = car;
    }
  }
  // Seven people are two cars (plan F6).
  const seven = priceDay(ALL[IDS[0]], priceRequest({ choices: { group_size: 7, transport_mode: "car" } }), ALL);
  assert.equal(seven.lines.find((x) => x.key === "car").basis.cars, 2);
});

test("V6 (bed): a bigger party never pays more a head, unless it needs another room or a bigger place", () => {
  for (const id of IDS) {
    for (const stay of TIERS) {
      let prev = null;
      for (let seats = 1; seats <= 12; seats += 1) {
        const req = priceRequest({ choices: { group_size: seats, stay_tier: stay } });
        const row = priceDay(ALL[id], req, ALL);
        const bed = row.lines[0];
        // T692: bounds per stay tier, so a solo 5-star room is no longer
        // repaired with a cheap entire place (T662-a).
        if (prev && bed.eur > prev.eur) {
          const grew = bed.basis.units > prev.basis.units || bed.basis.tier === "home";
          assert.ok(grew, `${id} ${stay} ${seats}: ${prev.eur} -> ${bed.eur} with ${prev.basis.units} -> ${bed.basis.units} ${bed.basis.unit}`);
        }
        prev = bed;
      }
    }
  }
});

test("V7: a month or any time never reads an exact date, for the bed or the flight", () => {
  const dates = { departDate: "2026-11-21", returnDate: "2026-11-28", ownDates: true };
  const month = priceRequest({ ...dates, dateFlex: "month" });
  const any = priceRequest({ ...dates, dateFlex: "any" });
  const xm = priceRequest({ ...dates, xm: 7 });
  for (const r of [month, any, xm]) {
    assert.equal(r.when.start, null);
    assert.equal(costChoices(r).start, undefined);
    assert.notEqual(flightWindow(r).kind, "exact");
    assert.equal(r.nights, 7);
  }
  assert.deepEqual(flightWindow(month), { kind: "month", ym: "2026-11" });
  assert.deepEqual(flightWindow(xm), { kind: "month", ym: "2027-07" });
  assert.deepEqual(flightWindow(any), { kind: "any" });
  // The month request prices the same whatever days sit in the date fields.
  const other = priceRequest({ departDate: "2026-11-02", returnDate: "2026-11-09", ownDates: true, dateFlex: "month" });
  for (const id of IDS) assert.equal(priceDay(ALL[id], month, ALL).dayEur, priceDay(ALL[id], other, ALL).dayEur, id);
  // Exact dates are exact for both.
  const exact = priceRequest(dates);
  assert.deepEqual(flightWindow(exact), { kind: "exact", from: "2026-11-21", to: "2026-11-28" });
  assert.equal(costChoices(exact).start, "2026-11-21");
  // Carta's own dates are not the traveller's: they read as any time (B5).
  assert.equal(priceRequest({ departDate: "2026-11-21", returnDate: "2026-11-28", ownDates: false }).when.kind, "any");
});

test("B7: the Explore month filter wins over the traveller's dates while it is on", () => {
  const r = priceRequest({ departDate: "2026-11-21", returnDate: "2026-11-28", ownDates: true, xm: 8, today: "2026-10-24" });
  assert.equal(r.when.kind, "month");
  assert.equal(r.when.month, 8);
});

test("one group: children count apart, babies take no seat (lib/party.js)", () => {
  const r = priceRequest({ choices: { group_size: 4, children: 2, babies: 1 } });
  assert.deepEqual(r.group, { adults: 2, children: 2, babies: 1 });
  assert.equal(seatsOf(r), 4);
  const kids = priceDay(ALL.LIS, r, ALL);
  const grown = priceDay(ALL.LIS, priceRequest({ choices: { group_size: 4 } }), ALL);
  assert.ok(kids.foodEur < grown.foodEur, "children eat less");
  // Two children in a dorm take one bed between them.
  const dorm = (c) => priceDay(ALL["gem:kotor"], priceRequest({ choices: { group_size: 4, children: c, stay_tier: "dorm" } }), ALL);
  assert.ok(dorm(2).stayEur < dorm(0).stayEur);
});

test("the catalogue map and a single place agree to the cent", () => {
  const r = rng(7);
  for (let i = 0; i < 60; i += 1) {
    const req = randomRequest(r);
    const map = priceDays(ALL, req);
    for (const id of IDS) assert.equal(priceDay(ALL[id], req, ALL).dayEur, map.get(id).dayEur, id);
  }
});

test("the country repair: a place with no usable bed borrows its country's median, marked", () => {
  const broken = { ...ALL.LIS, id: "LIS0", accommodation: { ...ALL.LIS.accommodation, beds: { bnb_home: { "2": 0 } } } };
  const all = { ...ALL, LIS0: broken };
  const row = priceDay(broken, DEFAULT_PRICE_REQUEST, all);
  assert.ok(row.stayEur > 0);
  assert.equal(row.lines[0].provenance.repaired, true);
  assert.equal(row.lines[0].quality, "modelled");
  assert.equal(priceDay(broken, DEFAULT_PRICE_REQUEST).dayEur, null, "alone there is nothing to borrow from");
});

test("the food breakdown sums to the food line", () => {
  const req = priceRequest({ choices: { group_size: 3, children: 1, lifestyle: { ...PROFILES.Foodie } } });
  const g = foodBreakdown(ALL["gem:como"], req, 1);
  const row = priceDay(ALL["gem:como"], req, ALL);
  assert.ok(Math.abs(g.total - row.foodEur) < 0.006);
});
