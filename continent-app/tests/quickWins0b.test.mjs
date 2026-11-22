// Logic wave 0b quick wins (fix programs 2026-11-19, ROADMAP G4, D10, G12): one test per
// audit row that fails on the code before its fix. The row ids are the audit's
// (.work/2026-11-19-fix-logic/backlog.md). Run: node --test tests/quickWins0b.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadStays, stayRecord } from "../src/lib/staysData.js";
import { formatMoney, receiptRounding } from "../src/lib/money.js";
import { computeCosts } from "../src/lib/costIndex.js";
import { matchBookingRow } from "../src/planner/bookingImportLogic.js";
import { FINDER_INPUTS } from "../src/lib/recommend/candidates.js";
import { answerKey } from "../src/lib/recommend/trips.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { groupTripVariants, variantKey } from "../src/lib/trips.js";
import { guideScreens } from "../src/planner/flow/flowGraph.js";
import { withOriginRoutes } from "../src/lib/origins.js";
import { matchAll } from "../src/lib/guidedSearch.js";
import { byRating } from "../src/lib/rating.js";
import { monthsOf, whenVerdict } from "../src/lib/whenGuide.js";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

test("B-17: a country whose two stays fetches both failed is asked again, a loaded one is not", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw new Error("offline"); };
    assert.equal(await loadStays("ZB"), 0);
    const afterFirst = calls;
    assert.ok(afterFirst >= 1);
    assert.equal(await loadStays("ZB"), 0);
    assert.ok(calls > afterFirst, "the second ask made new requests");
    globalThis.fetch = async () => {
      calls++;
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ built: "b1", dests: { ZB_a: { n: 1 } } }) };
    };
    assert.equal(await loadStays("ZB"), 1);
    const settled = calls;
    assert.equal(await loadStays("ZB"), 1);
    assert.equal(calls, settled, "a loaded country is not fetched again");
    assert.ok(stayRecord("ZB_a") === null || typeof stayRecord("ZB_a") === "object");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("B-16: the dead fields are gone, and a destination keeps one route key for pickAirRoute", () => {
  for (const rel of ["src/App.jsx", "src/hooks/useAppData.js"]) assert.ok(!read(rel).includes("baggage_per_direction_eur"), rel);
  assert.ok(!read("src/lib/price/compose.js").includes("accom_entire_home_night_eur"));
  // pickAirRoute(dest, 'auto') takes the first route key: it is unambiguous only while there is one.
  const data = { destinations: { A: { routes: { BRU: { eur: 10 }, CRL: { eur: 12 } } } }, meta: {} };
  const out = withOriginRoutes(data, "BRU");
  assert.ok(Object.keys(out.destinations.A.routes).length <= 1);
});

test("A-18: a rounded-away amount never prints a minus zero", () => {
  for (const v of [-0.4, -0, -0.001]) {
    assert.equal(formatMoney(v), formatMoney(0), String(v));
    if (Math.abs(v) < 0.005) assert.equal(formatMoney(v, { precision: "cents" }), formatMoney(0, { precision: "cents" }), `${v} cents`);
    assert.equal(formatMoney(v, { locale: "nl-NL" }), formatMoney(0, { locale: "nl-NL" }), `${v} nl`);
  }
  assert.ok(formatMoney(-3).includes("-"), "a real negative keeps its sign");
});

test("A-21: a food level the pipeline calls region reads as region, not country", () => {
  const dest = (level) => ({ X: { iso2: "XX", country: "X", costs: { level, meal_mid_eur: 20, meal_cheap_eur: 10, fastfood_eur: 8, drink_out_eur: 5, coffee_eur: 3 } } });
  assert.equal(computeCosts(dest("region"), {}).get("X").foodLevel, "region");
  assert.equal(computeCosts(dest("nearby"), {}).get("X").foodLevel, "region");
  assert.equal(computeCosts(dest("country"), {}).get("X").foodLevel, "country");
});

test("A-8: the printed whole-euro lines plus the Rounding line equal the printed total (Valletta, 3 people, 7 nights)", () => {
  const lines = [{ eur: 1293.6 }, { eur: 921.69 }];
  const total = 2215.29;
  const printed = lines.reduce((s, l) => s + Math.round(l.eur), 0);
  assert.equal(printed + receiptRounding(lines, total), Math.round(total));
  assert.equal(receiptRounding([{ eur: 10 }, { eur: 20 }], 30), 0);
  assert.equal(receiptRounding([{ eur: 10.4 }, { eur: 10.4 }], 20.8), 1);
});

test("H-11: a booking matches a stop by its whole folded name, not by a substring", () => {
  const keys = ["stay-0", "stay-1"];
  const stay = (city) => ({ kind: "stay", city });
  assert.equal(matchBookingRow(stay("Nice"), keys, ["Venice", "Nice"]), "stay-1");
  assert.equal(matchBookingRow(stay("Porto"), keys, ["Porto Cervo", "Porto"]), "stay-1");
  assert.equal(matchBookingRow(stay("heraklion"), keys, ["Heraklion (Crete)", "Chania"]), "stay-0");
  assert.equal(matchBookingRow(stay("Nimes"), keys, ["Lyon", "Nîmes"]), "stay-1");
  assert.equal(matchBookingRow(stay("Oslo"), keys, ["Lyon", "Nîmes"]), null);
});

test("H-3: the finder memo key changes with every field the build reads", () => {
  const base = { settings: normalizeSettings({}), origin: { iata: "BRU", lat: 50.9, lon: 4.5 }, today: "2026-11-23" };
  const keyOf = (patch) => answerKey({ ...base, settings: { ...base.settings, ...patch } });
  const k0 = answerKey(base);
  const changes = {
    way: "car", places: [{ kind: "country", id: "PT" }], booked: { flights: true }, answered: ["when"],
    kind: "now", now: { day: 1 },
  };
  for (const [field, value] of Object.entries(changes)) {
    assert.ok(FINDER_INPUTS.includes(field), `${field} is a finder input`);
    assert.notEqual(keyOf({ [field]: value }), k0, field);
  }
});

test("H-3: every settings field candidates.js reads is a FINDER_INPUTS entry", () => {
  const src = read("src/lib/recommend/candidates.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const read_ = new Set([...src.matchAll(/\bsettings\??\.([a-zA-Z]+)/g)].map((m) => m[1]));
  for (const f of read_) assert.ok(FINDER_INPUTS.includes(f), `settings.${f} is read but not in FINDER_INPUTS`);
});

test("H-14: a rail chain and a car loop through the same cities are two cards; lengths still fold", () => {
  const trip = (days, extra) => ({ days, cities: [{ city: "Bruges" }, { city: "Paris" }], archetype: "chain", transport: "rail", ...extra });
  const two = groupTripVariants([trip(5), trip(5, { archetype: "loop", transport: "car" })]);
  assert.equal(two.length, 2);
  const one = groupTripVariants([trip(5), trip(6), trip(7)]);
  assert.equal(one.length, 1);
  assert.equal(one[0].variants.length, 3);
  assert.notEqual(variantKey(trip(5)), variantKey(trip(5, { transport: "car" })));
});

test("H-9: with flights booked the whole-trip-or-flights-first question is not asked", () => {
  const s = normalizeSettings({});
  assert.ok(guideScreens(s).includes("g:how"), "asked when nothing is booked");
  const booked = { ...s, booked: { ...s.booked, flights: true } };
  assert.ok(!guideScreens(booked).includes("g:how"));
});

test("E-10: For you is offered only to a taste the match can score", async () => {
  const { forYouOffered } = await import("../src/lib/taste.js");
  const { sortOptionsFor } = await import("../src/browse/filters/filterModel.js");
  for (const taste of [{ party: "couple" }, { lifestyle: "foodie" }, { noCar: true }, null]) assert.equal(forYouOffered(taste), false, JSON.stringify(taste));
  for (const taste of [{ likes: ["beach"] }, { quiet: "quiet" }, { size: "village" }]) assert.equal(forYouOffered(taste), true, JSON.stringify(taste));
  const offers = (taste) => sortOptionsFor(forYouOffered(taste)).some((o) => o["key"] === "foryou");
  assert.equal(offers({ party: "couple" }), false);
  assert.equal(offers({ likes: ["beach"] }), true);
});

test("E-12: the guided example counts judge quiet by the example's own month", () => {
  const tier = Array(12).fill(3); tier[0] = 0; // quiet in January only
  const place = { id: "x", iso2: "AT", climate: { best: [1, 8] }, crowding: { tier: 3, monthly: { tier } } };
  assert.equal(matchAll(place, { quiet: true, month: 8 }, { guided: null }), false);
  assert.equal(matchAll(place, { quiet: true, month: 1 }, { guided: null }), true);
});

test("E-6: equal ratings go by fame, then id, whatever the input order", () => {
  const p = (id, score, fame) => ({ id, rating: { score, fame } });
  const four = [p("gem:taormina", 9.6, 335), p("gem:hallstatt", 9.6, 621), p("DBV", 9.6, 1106), p("SZG", 9.6, 1284)];
  const want = ["SZG", "DBV", "gem:hallstatt", "gem:taormina"];
  assert.deepEqual([...four].sort(byRating).map((x) => x.id), want);
  assert.deepEqual([...four].reverse().sort(byRating).map((x) => x.id), want);
  assert.deepEqual([p("b", 9, 5), p("a", 9, 5), p("c", 9.5, 0)].sort(byRating).map((x) => x.id), ["c", "a", "b"]);
});

test("F-6 and F-9: the place page reads one month and guards the dossier's best months", () => {
  const src = read("src/browse/DestinationPage.jsx");
  assert.ok(!/monthOf\(firstRun\?\.departDate/.test(src), "no month from the departure date");
  assert.ok(/const tripMonth = statMonth/.test(src));
  assert.ok(/bestMonthsFor\(\{ \.\.\.destination\.climate, best: d\?\.when\?\.best/.test(src), "the dossier best passes the heat guard");
});

test("F-10: a hot month with unknown crowds is hot, not hot and busy", () => {
  const m = (month, hi, crowd) => ({ month, hi, lo: 20, rain: 5, tier: "good", crowd });
  const v = whenVerdict([m(7, 33, null), m(8, 33, 3), m(9, 22, null)], [9]);
  assert.deepEqual(v.hot, [7, 8]);
  assert.deepEqual(v.hotUnknown, [7]);
  assert.ok(monthsOf === monthsOf);
});

test("F-16: the priced month and the When default read the local day, not UTC", () => {
  for (const rel of ["src/lib/settings/model.js", "src/lib/settings/setters.js", "src/browse/settings/WhenStep.jsx"]) {
    assert.ok(!read(rel).includes("new Date().toISOString().slice(0"), rel);
  }
});
