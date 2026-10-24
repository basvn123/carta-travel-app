// T661 (F1): the price baseline. Six destinations x four requests, every
// day-price screen of doc section 4.3, in cents (tests/fixtures/price/).
// The snapshot is the referee (invariant V10): a changed cell needs a reason
// in the task report. To accept a change on purpose:
//   UPDATE_GOLDEN=1 node --test tests/priceGolden.test.mjs
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import { DEFAULT_LIFESTYLE } from "../src/lib/runtime_pricing.js";
import { PROFILES } from "../src/lib/lifestyleProfiles.js";
import { calendarDefaultWindow } from "../src/lib/firstRun.js";
import { SCREENS, DAY_SCREENS } from "./fixtures/price/screens.mjs";

const DIR = new URL("./fixtures/price/", import.meta.url);
const FX = JSON.parse(readFileSync(new URL("destinations.json", DIR), "utf8"));
const GOLDEN = new URL("golden.json", DIR);
setStayRecords(FX.stays);
const ALL = FX.destinations;

// Carta's own week, as useAppData picks it on 2026-10-24 (the baseline day).
const DEFAULT_DATES = calendarDefaultWindow("2026-10-24", 7);
const base = {
  group_size: 2, children: 0, babies: 0, stay_tier: "home",
  lifestyle: { ...DEFAULT_LIFESTYLE }, transport_mode: "any", baggage_key: "priority_10kg",
};
const req = (over) => ({
  choices: base, departDate: DEFAULT_DATES.start, returnDate: DEFAULT_DATES.end,
  dateFlex: null, defaultDates: DEFAULT_DATES, xm: null, ...over,
});

// The four requests of the PB1 prompt.
export const REQUESTS = {
  // Nothing chosen: two people, an entire place, Easygoing, Carta's week.
  default: req({}),
  // Seven people, a 3-star hotel, Nightlife, their own dates 21 to 28 November.
  group7: req({
    choices: { ...base, group_size: 7, stay_tier: "hotel3", lifestyle: { ...PROFILES.Nightlife } },
    // Carta's own week on the baseline day is also 21 to 28 November, so the
    // app could not tell these apart by the dates alone (T663-c): the
    // request says they are the traveller's own.
    departDate: "2026-11-21", returnDate: "2026-11-28", ownDates: true,
  }),
  // A month: November, any days (the settings line), and the same month as the
  // Explore month filter (xm), which the Explore card reads.
  month: req({ departDate: "2026-11-21", returnDate: "2026-11-28", dateFlex: "month", xm: 11 }),
  // Any time.
  any: req({ dateFlex: "any" }),
};

function snapshot() {
  const out = {};
  for (const [rk, r] of Object.entries(REQUESTS)) {
    out[rk] = {};
    for (const id of Object.keys(ALL)) {
      out[rk][id] = {};
      for (const [sk, fn] of Object.entries(SCREENS)) out[rk][id][sk] = fn(ALL, id, r);
    }
  }
  return out;
}

test("the baseline: every screen, every request, in cents (V10)", () => {
  const now = snapshot();
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(GOLDEN, `${JSON.stringify(now, null, 1)}\n`);
    return;
  }
  const want = JSON.parse(readFileSync(GOLDEN, "utf8"));
  assert.deepEqual(now, want);
});

test("the baseline prices every destination on every screen", () => {
  const now = snapshot();
  for (const [rk, byId] of Object.entries(now)) {
    for (const [id, bySc] of Object.entries(byId)) {
      for (const [sk, v] of Object.entries(bySc)) assert.ok(v > 0, `${rk} ${id} ${sk}: ${v}`);
    }
  }
});

// Screens built before any traveller choice (prerendered pages, the OG card).
const STATIC = ["prerender", "prerenderWeek", "og"];

/** The spread between day-price screens per request and destination, in
 *  cents. Prerendered pages and the OG card know no choices, so they count
 *  only for the default request. */
export function deviations(now = snapshot()) {
  const out = {};
  for (const [rk, byId] of Object.entries(now)) {
    for (const [id, bySc] of Object.entries(byId)) {
      // The day planner prices a stop at its own exact dates (T666): it meets
      // the card when the request is exact.
      const keys = DAY_SCREENS.filter((k) => (rk === "default" || !STATIC.includes(k))
        && (k !== "dayPlanner" || REQUESTS[rk].ownDates));
      const vals = keys.map((k) => bySc[k]).filter((v) => v != null);
      out[`${rk} ${id}`] = Math.max(...vals) - Math.min(...vals);
    }
  }
  return out;
}

test("V1 (day price, T665): the same request gives every day-price screen the same cents", () => {
  for (const [k, spread] of Object.entries(deviations())) assert.equal(spread, 0, k);
});

test("V1: the calculator total is the day times the nights and the party, to the cent", () => {
  const now = snapshot();
  for (const [rk, r] of Object.entries(REQUESTS)) {
    const seats = Math.min(12, r.choices.group_size);
    const nights = Math.round((Date.parse(r.returnDate) - Date.parse(r.departDate)) / 864e5);
    for (const [id, v] of Object.entries(now[rk])) assert.equal(v.calculatorTotal, v.calculatorDay * seats * nights, `${rk} ${id}`);
  }
});

test("report: the spread between day-price screens", () => {
  const d = deviations();
  if (process.env.PRICE_REPORT) console.log(JSON.stringify(d, null, 1));
  assert.ok(Object.keys(d).length === 24);
});
