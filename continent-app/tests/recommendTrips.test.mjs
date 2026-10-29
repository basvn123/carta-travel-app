// T793: the trip finder's candidates and priced trips (lib/recommend/
// candidates.js, trips.js). The plan's example answers (two people from
// Brussels, 9 to 16 May, a few towns, hiking and food, mild, a short flight,
// no crowds, EUR 1,200 each) must give 6 to 24 trips, each with every slot,
// and the same answers must give the same trips with the same ids.
// Run: npm test (continent-app/). Uses public/; the catalogue tests skip without it.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  splitNights, shapesFor, datesFor, startIn, bestMonth, transportFor, tasteFor, CANDIDATES,
} from "../src/lib/recommend/candidates.js";
import { buildTrips, tripId, stableHash, receiptOf } from "../src/lib/recommend/trips.js";
import { SLOT_ROWS, ADAPTERS, slotTotals } from "../src/lib/recommend/slots.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { haversineKm } from "../src/lib/runtime_pricing.js";

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";
const layerIndexes = data ? {
  trails: read("trails/index.json"), beaches: read("beaches/index.json"), lakes: read("lakes/index.json"),
  mountains: read("mountains/index.json"), cycling: read("cycling/index.json"),
} : {};
const countryInsights = read("country_insights.json")?.countries || null;

const BRUSSELS = { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" };

/** The plan's example answers. */
function example(over = {}) {
  return normalizeSettings({
    answered: ["who", "when"],
    party: { kind: "couple", adults: 2 },
    priority: "balance",
    when: { mode: "exact", start: "2027-05-09", end: "2027-05-16", nights: 7 },
    guide: {
      shapes: ["towns"], likes: ["hiking", "food"], weather: "mild", reach: "short", avoid: ["crowds"],
      budget: { kind: "total", eur: 1200 },
    },
    ...over,
  });
}

/** A swept flight file with one fresh fare a day, both ways, for the airports given. */
function sweptFile(airports, from = "2027-05-01", days = 30, price = 90) {
  const checked = Math.floor(Date.now() / 60000);
  const day = (k) => new Date(Date.parse(`${from}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
  const leg = (k) => [price + (k % 5) * 7, "SN", "07:05", "08:40", 0, checked];
  const side = () => Object.fromEntries(airports.map((a) => [a, Object.fromEntries(Array.from({ length: days }, (_, k) => [day(k), leg(k)]))]));
  return { v: 1, from: "BRU", checked, to: side(), back: side() };
}

const input = (settings, over = {}) => ({
  data, countryInsights, layerIndexes, settings, origin: BRUSSELS, flights: null, today: "2026-10-28", ...over,
});

test("nights split the planner's way: the remainder to the first places", () => {
  assert.deepEqual(splitNights(7, 2), [4, 3]);
  assert.deepEqual(splitNights(7, 3), [3, 2, 2]);
  assert.deepEqual(splitNights(2, 3), [1, 1, 1]);
});

test("shapes: any means one place, a few towns and a road trip; no car means no road trip", () => {
  const s = (shapes, avoid = []) => example({ guide: { ...example().guide, shapes, avoid } });
  assert.deepEqual(shapesFor(s([])).shapes, CANDIDATES.anyShapes);
  assert.deepEqual(shapesFor(s([], ["car"])).shapes, ["one", "towns"]);
  const several = shapesFor(s(["countries", "oneway"]));
  assert.deepEqual(several.shapes, ["towns"]);
  assert.deepEqual(several.gaps, ["countries", "oneway"], "the shapes this batch cannot build are recorded");
});

test("transport: a road trip hires a car; no flying drives from home, or takes the train without a car", () => {
  const s = (reach, avoid = []) => example({ guide: { ...example().guide, reach, avoid } });
  assert.equal(transportFor("road", s("short")), "car");
  assert.equal(transportFor("towns", s("short")), "auto");
  assert.equal(transportFor("towns", s("overland")), "owncar");
  assert.equal(transportFor("towns", s("overland", ["car"])), "train");
});

test("dates: the setup's, else the config's nights from the first Saturday of the month", () => {
  const exact = datesFor(example(), 5, "2026-10-28");
  assert.deepEqual(exact, { nights: 7, out: "2027-05-09", back: "2027-05-16", fromSetup: true });
  const any = example({ answered: ["who"], when: { mode: "any", nights: 10 } });
  const d = datesFor(any, 5, "2026-10-28");
  assert.equal(d.nights, 7, "an unanswered When takes config dates.nights");
  assert.equal(d.out, "2027-05-01");
  assert.equal(new Date(`${d.out}T00:00:00Z`).getUTCDay(), 6);
  assert.equal(startIn(11, "2026-10-28"), "2026-11-07");
  assert.equal(startIn(10, "2026-10-28"), "2027-10-02", "a month already under way is next year's");
});

test("the best month follows the weather answer", { skip }, () => {
  const lju = data.destinations.LJU;
  const mild = bestMonth([lju], "mild", "2026-10-28");
  const warm = bestMonth([lju], "warm", "2026-10-28");
  const high = (m) => lju.taste.tmax_by_month[m - 1];
  assert.ok(Math.abs(high(mild) - 21) <= 2, `mild month ${mild} reads ${high(mild)}`);
  assert.ok(high(warm) >= high(mild), "warm is warmer than mild");
});

test("the taste: the trip's likes, quiet for no crowds, no car for no car", () => {
  const t = tasteFor(example({ guide: { ...example().guide, avoid: ["crowds", "car"] } }));
  assert.deepEqual(t.likes, ["hiking", "food"]);
  assert.equal(t.quiet, "quiet");
  assert.equal(t.noCar, true);
});

test("the example answers give 6 to 24 priced trips, each with every slot", { skip }, () => {
  const trips = buildTrips(input(example()));
  assert.ok(trips.length >= 6 && trips.length <= 24, `${trips.length} trips`);
  for (const t of trips) {
    assert.deepEqual(t.slots.map((s) => s.id), SLOT_ROWS.map((r) => r.id));
    assert.equal(t.slots.find((s) => s.id === "activities").eur, null);
    assert.equal(t.places.reduce((n, p) => n + p.nights, 0), t.nights);
    assert.ok(t.places.length >= 1 && t.places.length <= 3);
    assert.deepEqual(t.dates, { out: "2027-05-09", back: "2027-05-16" });
    assert.equal(t.month, 5);
    assert.ok(t.total.perPerson > 0);
    // A few towns sit within reach of each other, and are not one place twice.
    const ds = t.places.map((p) => data.destinations[p.id]);
    for (const d of ds.slice(1)) {
      const km = haversineKm(ds[0].lat, ds[0].lon, d.lat, d.lon);
      assert.ok(km <= CANDIDATES.towns.maxKm && km >= CANDIDATES.towns.minKm, `${ds[0].city} to ${d.city} is ${Math.round(km)} km`);
    }
  }
  assert.equal(new Set(trips.map((t) => t.id)).size, trips.length, "ids are unique");
});

test("the same answers give the same trips, with the same ids", { skip }, () => {
  const a = buildTrips(input(example()));
  const b = buildTrips(input(example()));
  assert.equal(a, b, "built once per answer set");
  const fresh = buildTrips(input(example(), { data: { ...data } }));
  assert.notEqual(fresh, a);
  assert.deepEqual(fresh.map((t) => t.id), a.map((t) => t.id));
  assert.deepEqual(fresh.map((t) => t.total), a.map((t) => t.total));
  assert.equal(tripId(a[0]), a[0].id);
  assert.notEqual(stableHash("a"), stableHash("b"));
});

test("the gateway is the first place's airport with a swept fare", { skip }, () => {
  const none = buildTrips(input(example()));
  const slo = none.find((t) => t.iso2 === "SI");
  assert.ok(slo, "Slovenia is among the trips");
  assert.equal(slo.gateway.swept, false, "May 2027 has no swept fare without a file");
  const withFares = buildTrips(input(example(), { flights: sweptFile(["LJU"]) }));
  const slo2 = withFares.find((t) => t.iso2 === "SI");
  assert.equal(slo2.gateway.iata, "LJU");
  assert.equal(slo2.gateway.swept, true);
});

test("no flying: no gateway, the trip drives from home", { skip }, () => {
  const s = example({ guide: { ...example().guide, reach: "overland", shapes: ["one"] } });
  const trips = buildTrips(input(s));
  assert.ok(trips.length > 0);
  for (const t of trips) {
    assert.equal(t.gateway, null);
    assert.equal(t.transport, "owncar");
  }
});

test("the receipt reads the trip's own slots: its total is the card's", { skip }, () => {
  for (const t of buildTrips(input(example()))) {
    const r = receiptOf(t);
    assert.deepEqual(r.total, t.total);
    assert.deepEqual(r.lines.map((l) => l.id), t.slots.map((s) => s.id));
  }
});

test("a new slot row and adapter reach every trip with no other change", { skip }, () => {
  const rows = [...SLOT_ROWS, { id: "insurance", order: 60, labelKey: "tf.slot.insurance", adapter: "insurance", pickable: true, status: "live" }];
  const adapters = { ...ADAPTERS, insurance: { price: () => ({ eurGroup: 40, pick: null, options: null, because: null, quality: "modelled" }) } };
  const base = buildTrips(input(example()));
  const more = buildTrips(input(example()), { rows, adapters });
  assert.equal(more.length, base.length);
  more.forEach((t, i) => {
    assert.equal(t.slots.at(-1).id, "insurance");
    assert.equal(slotTotals(t.slots).perPerson, base[i].total.perPerson + 20);
  });
});
