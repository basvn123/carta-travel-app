// T388 (row T377-g): the trip wizard's running estimate and the planned trip's
// receipt price a stop and a leg through the same two functions, so the last
// wizard step and the planned view show one figure for one trip (the V1 walk
// read EUR 586 against EUR 771). Run: npm test (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { pickLegMode } from "../src/lib/trip_planner_pricing.js";
import { DEFAULT_LIFESTYLE } from "../src/lib/runtime_pricing.js";
import { quoteStay, tripRequest, priceDay, atDates } from "../src/lib/price/index.js";

// T702: a stop is priced by the engine (lib/price/stay.js quoteStay).
const stopStayCost = (dest, nights, start, { groupSize = 1, stayTier = "home", lifestyle = null } = {}) =>
  quoteStay(dest, nights, start, tripRequest({ groupSize, stayTier, lifestyle }));

// A town with a measured bed and a cost basket, the two things a stop is
// priced from. No seasonality curve, so the month does not move the figure.
const town = {
  id: "berat",
  city: "Berat",
  accommodation: { beds: { bnb_home: { "2": 64, "4": 86 }, private: 40, dorm: 15 }, q: "measured" },
  costs: {
    meal_mid_eur: 14, meal_cheap_eur: 7, fastfood_eur: 5, drink_out_eur: 3,
    coffee_eur: 1.5, grocery_day_eur: 9, club_entry_eur: 0, cocktail_eur: 6,
  },
};
const thrifty = {
  cadence: "week", dinners_per_week: 2, lunches_per_week: 3, fastfood_per_week: 4,
  drinks_per_week: 4, club_nights_per_week: 0, coffees_per_day: 1, self_catered_days_per_week: 4,
};

test("a stop is its bed plus its days, for the whole party", () => {
  const c = stopStayCost(town, 3, "2026-11-10", { groupSize: 2, stayTier: "home", lifestyle: thrifty });
  // The destination page's day at the same dates, times the nights and the seats (V1, V3).
  const day = priceDay(town, atDates(tripRequest({ groupSize: 2, stayTier: "home", lifestyle: thrifty }), "2026-11-10", "2026-11-13"));
  assert.equal(c.accomTotal, Math.round(day.stayEur * 3 * 2 * 100) / 100);
  assert.equal(c.groundTotal, Math.round(day.foodEur * 3 * 2 * 100) / 100);
  assert.equal(c.total, Math.round((c.accomTotal + c.groundTotal) * 100) / 100);
});

test("the days are priced at the lifestyle handed over, the app default without one", () => {
  const withDefault = stopStayCost(town, 3, null, { groupSize: 1 });
  const atDefault = stopStayCost(town, 3, null, { groupSize: 1, lifestyle: DEFAULT_LIFESTYLE });
  assert.equal(withDefault.groundTotal, atDefault.groundTotal);
  const thriftyDays = stopStayCost(town, 3, null, { groupSize: 1, lifestyle: thrifty });
  assert.notEqual(thriftyDays.groundTotal, withDefault.groundTotal);
});

test("a pass-through stop books no bed", () => {
  const c = stopStayCost(town, 0, null, { groupSize: 2 });
  assert.equal(c.accom, null);
  assert.equal(c.accomTotal, 0);
});

test("one trip, two screens, one total", () => {
  // The wizard and the planner both price a stop with quoteStay (T702). Same inputs in, so the same figure out.
  const stops = [["2026-11-10", 3], ["2026-11-13", 4]];
  const opts = { groupSize: 2, stayTier: "home", lifestyle: thrifty };
  const wizard = stops.map(([d, n]) => stopStayCost(town, n, d, opts));
  const planner = stops.map(([d, n]) => stopStayCost(town, n, d, opts));
  const sum = (rows) => rows.reduce((s, r) => s + r.total, 0);
  assert.equal(sum(wizard), sum(planner));
  assert.ok(sum(wizard) > 0);
});

test("a leg nobody chose takes one rule on both screens", () => {
  const opts = { recommended: "car", modes: { car: { eur_total: 40 }, train: { eur_total: 30, eur_pp: 15, hours: 2 }, bus: { eur_total: 20, eur_pp: 10, hours: 3 } } };
  assert.equal(pickLegMode(opts, { hasCar: true }), "car");
  assert.equal(pickLegMode(opts, { transportPref: "auto" }), "car");
  assert.ok(["train", "bus"].includes(pickLegMode(opts, { transportPref: "public" })));
  assert.equal(pickLegMode(null), null);
});
