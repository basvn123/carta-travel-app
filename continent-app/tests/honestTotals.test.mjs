// PT-E1 (ROADMAP G4, D10, G9; logic audit E1): one "missing value" rule. No path prints a
// lower total for a missing part. The rule is lib/price/gaps.js; each site reads flag E1
// (config/flags.json, default old), so every test that needs the new answer forces it with
// withFlags, and the "old" tests pin that the flag off keeps today's numbers.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E1).
// Run: node --test tests/honestTotals.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { withFlags } from "../src/lib/flags.js";
import { toEur, isConverted } from "../src/lib/currency.js";
import { groundSpendPerPerson } from "../src/lib/runtime_pricing.js";
import { sumParts, budgetStanding, standingOf, comparePartialLast, orderByTotal, budgetCompared, budgetPartial } from "../src/lib/price/gaps.js";
import { quoteTrip, tripLines } from "../src/lib/tripTotal.js";
import { costTiles } from "../src/lib/price/tiles.js";
import { quoteNights } from "../src/lib/price/nights.js";
import { budgetSearch, normalizeQuery } from "../src/lib/budgetSearch.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { synth, CATALOGUE, TODAY } from "../scripts/eval/lib/totals-engine.mjs";

const NEW = (fn) => withFlags({ E1: "new" }, fn);
const OLD = (fn) => withFlags({ E1: "old" }, fn);

test("E1: an unknown currency is not converted at par (A-20)", () => {
  assert.equal(NEW(() => toEur(100, "XXX")), null);
  assert.equal(NEW(() => toEur(100, "GBP")), 117);
  assert.equal(isConverted("XXX"), false);
  assert.equal(OLD(() => toEur(100, "XXX")), 100, "flag old keeps today's par");
});

test("E1: a basket with a missing food item is unknown, not cheaper (A-13)", () => {
  const dest = { costs: { meal_mid_eur: 20, meal_cheap_eur: 10, fastfood_eur: null, drink_out_eur: 5 } };
  assert.equal(NEW(() => groundSpendPerPerson(dest, 7, {})), null);
  assert.ok(OLD(() => groundSpendPerPerson(dest, 7, {})).total > 0, "flag old keeps the lower figure");
  const whole = { costs: { meal_mid_eur: 20, meal_cheap_eur: 10, fastfood_eur: 8, drink_out_eur: 5, coffee_eur: 2, grocery_day_eur: 11, club_entry_eur: 10, cocktail_eur: 9 } };
  assert.equal(NEW(() => groundSpendPerPerson(whole, 7, {}).total), OLD(() => groundSpendPerPerson(whole, 7, {}).total));
});

test("E1: Barcelona 3 nights + Reus 4 nights, Reus without a bed price: the total is partial and says what it leaves out (A-1)", () => {
  const r = sumParts([{ kind: "bed", stop: 0, eur: 300 }, { kind: "bed", stop: 1, eur: null }]);
  assert.equal(r.complete, false);
  assert.equal(r.eur, 300);
  assert.deepEqual(r.leftOut, [{ kind: "bed", stop: 1 }]);
  assert.equal(sumParts([{ kind: "bed", eur: 5 }, { kind: "food", eur: 0 }]).complete, true, "a zero price is a price");
});

test("E1: the trip names the stop with no bed price, on the quote, the receipt and the stay tile (A-1)", () => {
  const state = {
    stops: [{ destinationId: "BCN", nights: 3, activities: [] }, { destinationId: "NOBED", nights: 4, activities: [] }],
    tripStart: "2027-03-06", tripEnd: "2027-03-13", groupSize: 2, children: 0, babies: 0, transportPref: "owncar",
    baggage: "priority_10kg", ownFlight: null, carHome: null, stayTier: "home", lifestyle: null,
  };
  const q = quoteTrip(state, { data: { destinations: CATALOGUE } });
  assert.deepEqual(q.missing.filter((m) => m.kind === "bed"), [{ kind: "bed", stop: 1 }]);
  assert.equal(q.complete, false);
  assert.equal(q.stayCosts[1].accomMissing, true);
  const oldLines = OLD(() => tripLines(q));
  assert.ok(!oldLines.some((l) => l.key === "bedsMissing"), "flag old prints today's receipt");
  const line = NEW(() => tripLines(q)).find((l) => l.key === "bedsMissing");
  assert.equal(line.kind, "missing");
  assert.deepEqual(line.cities, ["NOBED"]);
  assert.deepEqual(NEW(() => costTiles(q)).find((x) => x.key === "stay").leftOut, ["NOBED"]);
  assert.equal(OLD(() => costTiles(q)).find((x) => x.key === "stay").leftOut.length, 0);
  // V1: the figure stays the engine's; only the label is new.
  assert.equal(NEW(() => quoteTrip(state, { data: { destinations: CATALOGUE } }).grandTotal), q.grandTotal);
  // A bed the traveller typed is a price: nothing is left out.
  const own = quoteTrip({ ...state, ownStays: { NOBED: "400" } }, { data: { destinations: CATALOGUE } });
  assert.equal(own.stayCosts[1].ownAccom, true);
  assert.deepEqual(own.missing.filter((m) => m.kind === "bed"), []);
});

test("E1: Palma with no fare is never cheapest and a partial total is never fits (B-4, H-2, A-10)", () => {
  assert.equal(budgetStanding({ eur: 400, complete: false }, 1500, { adults: 2 }).state, "partial");
  assert.ok(comparePartialLast({ eur: 400, complete: false }, { eur: 900, complete: true }) > 0);
  assert.ok(comparePartialLast({ eur: 900, complete: true }, { eur: 400, complete: false }) < 0);
  assert.equal(comparePartialLast({ eur: 5, complete: true }, { eur: 5, complete: true }), 0);
  // Already over: more parts only add, so it is over, and keeps its over-by figure.
  const over = budgetStanding({ eur: 1600, complete: false }, 1500, { adults: 2 });
  assert.equal(over.state, "over");
  assert.equal(over.delta, 100);
  assert.equal(budgetStanding({ eur: 1200, complete: true }, 1500).state, "fits");
  assert.equal(budgetStanding({ eur: 1200, complete: true }, null).state, null);
  const rows = [{ id: "palma", eur: 420, noFare: true }, { id: "bcn", eur: 900 }, { id: "lisb", eur: 700 }];
  assert.deepEqual(NEW(() => orderByTotal(rows)).map((r) => r.id), ["lisb", "bcn", "palma"]);
  assert.deepEqual(OLD(() => orderByTotal(rows)).map((r) => r.id), ["palma", "lisb", "bcn"], "flag old keeps today's order");
  assert.equal(OLD(() => standingOf({ eur: 400, complete: false }, 1500).state), "fits");
  assert.equal(NEW(() => standingOf({ eur: 400, complete: false }, 1500).state), "partial");
  assert.equal(NEW(() => standingOf({ eur: 1600, core: 1450, complete: true }, 1500).state), "tight");
});

test("E1: the day budget is held against bed plus food, not the flights too (H-8)", () => {
  const trip = { slots: [{ id: "flight", eur: 400 }, { id: "stay", eur: 300 }, { id: "food", eur: 200 }], total: { perPerson: 900 } };
  assert.equal(NEW(() => budgetCompared(trip, "day")), 500);
  assert.equal(OLD(() => budgetCompared(trip, "day")), 900);
  assert.equal(NEW(() => budgetCompared(trip, "trip")), 900);
  const noFlight = { slots: [{ id: "flight", eur: null }, { id: "stay", eur: 300 }, { id: "food", eur: 200 }], total: { perPerson: 500 } };
  assert.equal(NEW(() => budgetPartial(noFlight, "day")), false, "a day budget does not care about the flight");
  assert.equal(NEW(() => budgetPartial(noFlight, "trip")), true);
  assert.equal(OLD(() => budgetPartial(noFlight, "trip")), false);
});

test("E1: the budget search counts a repaired bed and says getting there is not in the total (A-9, A-10)", () => {
  const dests = ["BCN", "REUS", "P", "Q", "R"].map((id) => CATALOGUE[id]);
  const q = normalizeQuery({ budget: 2200, days: 5, month: 10, adults: 2, mode: "public" }, TODAY);
  const run = () => budgetSearch(dests, q, { destinations: CATALOGUE }, TODAY);
  const on = NEW(run);
  assert.ok(on.fits.some((r) => r.id === "REUS"), "REUS has a bed once the country median repairs it");
  assert.equal(on.there, "before");
  const off = OLD(run);
  assert.ok(!off.fits.some((r) => r.id === "REUS"), "flag old prices the place alone, as before");
  assert.equal(off.there, undefined);
});

test("E1: a plane card with no flight in the total says so (A-17)", () => {
  const row = { stayEur: 50, foodEur: 30, stayLevel: "city", foodLevel: "city", lines: [] };
  assert.equal(quoteNights(row, 3, 2, null, null).noWay, true);
  assert.equal(quoteNights(row, 3, 2, { costTotal: 200 }, null).noWay, false);
  assert.equal(quoteNights(row, 3, 2, null, null, [], { mode: "train", total: 120 }).noWay, false);
});

test("E1: the old path is untouched with the flag off (today's totals)", () => {
  const d = synth("X", { night: 60 });
  const q = quoteTrip({ stops: [{ destinationId: "X", nights: 3, activities: [] }], tripStart: "2027-03-06", tripEnd: "2027-03-09", groupSize: 2, children: 0, babies: 0, transportPref: "owncar", baggage: "priority_10kg", ownFlight: null, carHome: null, stayTier: "home", lifestyle: null }, { data: { destinations: { X: d } } });
  assert.equal(q.complete, true);
  assert.equal(OLD(() => tripLines(q)).some((l) => l.key === "bedsMissing"), false);
});

test("E1: one decider: no fits or tight verdict is assigned anywhere in src/ but lib/price/gaps.js", () => {
  const root = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const hits = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { if (f !== "i18n") walk(p); continue; }
      if (!/\.(js|jsx)$/.test(f)) continue;
      const rel = relative(root, p).split("\\").join("/");
      // gaps.js decides; budgetSearch.verdictOf only maps its answer onto the search's three groups.
      if (rel === "lib/price/gaps.js") continue;
      const src = readFileSync(p, "utf8");
      src.split(/\r?\n/).forEach((line, i) => {
        if (/(group|state)\s*[:=]\s*['"](fits|tight)['"]/.test(line) || /(?:<=?|>=?)\s*budget\b.*['"](fits|tight)['"]/.test(line)) hits.push(`${rel}:${i + 1}`);
      });
    }
  };
  walk(root);
  assert.deepEqual(hits, [], "a fits or tight decision outside lib/price/gaps.js");
});
