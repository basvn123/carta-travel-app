// The first-run receipt of T099 (docs/FIRST_RUN_RESULT.md). Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarDefaultWindow, windowFits, priceReceipt, receiptFooter, nearestPricedDest,
} from "../src/lib/firstRun.js";

const dest = {
  city: "Trieste",
  accommodation: {
    per_person_night_eur: 32.5, cleaning_per_person_eur: 16.24, entire_home_night_eur: 130,
    typical_capacity: 4, level: "country", price_source: "inside_airbnb_country+pop",
    tiers: { dorm_pp_night_eur: 24, private_room_night_eur: 60 },
  },
  costs: {
    meal_mid_eur: 35, meal_cheap_eur: 17, fastfood_eur: 10, drink_out_eur: 5, cocktail_eur: 12,
    coffee_eur: 1.76, grocery_day_eur: 13, club_entry_eur: 10.37, level: "country",
  },
};
const opts = { from: "2026-11-07", to: "2026-11-14", people: 2, stayTier: "home" };

test("the default window is the first Saturday at least four weeks out", () => {
  // 2026-10-07 is a Wednesday; +28 is Wednesday 4 November; the Saturday is the 7th.
  assert.deepEqual(calendarDefaultWindow("2026-10-07", 7), { start: "2026-11-07", end: "2026-11-14" });
  // A day whose +28 is itself a Saturday keeps it.
  assert.deepEqual(calendarDefaultWindow("2026-10-10", 3), { start: "2026-11-07", end: "2026-11-10" });
});

test("a window fits only inside its bounds", () => {
  const w = { start: "2026-11-07", end: "2026-11-14" };
  assert.equal(windowFits(w, { min: "2026-10-07", max: "2026-12-19" }), true);
  assert.equal(windowFits(w, { min: "2026-10-07", max: "2026-11-10" }), false);
  assert.equal(windowFits(w, null), true);
});

test("the receipt sums its lines to the cent, in trip order, with no flight of Carta's", () => {
  const r = priceReceipt(dest, opts);
  assert.deepEqual(r.lines.map((l) => l.key), ["stay", "ground"]);
  const sum = Math.round(r.lines.reduce((s, l) => s + l.eur, 0) * 100) / 100;
  assert.equal(r.total, sum);
  assert.equal(r.nights, 7);
  assert.equal(r.each, Math.round((r.total / 2) * 100) / 100);
  // National baskets on both lines: the total is an estimate.
  assert.equal(r.est, true);
  // The ground line is exactly days x people x the per-day figure it prints.
  const g = r.lines.find((l) => l.key === "ground");
  assert.equal(g.eur, Math.round(g.perDay * 7 * 2 * 100) / 100);
});

test("a typed fare is the only flight line, first, and never an estimate", () => {
  const r = priceReceipt(dest, { ...opts, ownFare: { costTotal: 117.96, airline: "Ryanair", origin: "CRL" } });
  assert.equal(r.lines[0].key, "flight");
  assert.equal(r.lines[0].eur, 117.96);
  assert.equal(r.lines[0].est, false);
  const without = priceReceipt(dest, opts);
  assert.equal(Math.round((r.total - without.total) * 100) / 100, 117.96);
});

test("more people cost more in total", () => {
  const two = priceReceipt(dest, opts);
  const four = priceReceipt(dest, { ...opts, people: 4 });
  assert.ok(four.total > two.total);
});

test("a destination without a bed or a food figure prices no receipt", () => {
  assert.equal(priceReceipt({ ...dest, costs: null }, opts), null);
  assert.equal(priceReceipt({ ...dest, accommodation: { per_person_night_eur: 0 } }, opts), null);
  assert.equal(priceReceipt(dest, { ...opts, to: opts.from }), null);
});

test("a broken harvest borrows the country median and says it is an estimate", () => {
  const broken = { ...dest, accommodation: { ...dest.accommodation, per_person_night_eur: 0, tiers: null } };
  const r = priceReceipt(broken, { ...opts, costRow: { stayLevel: "region", stayEur: 30 } });
  const s = r.lines.find((l) => l.key === "stay");
  assert.equal(s.level, "region");
  assert.equal(s.eur, 30 * 7 * 2);
  assert.equal(s.est, true);
});

test("the footer names a measured cheaper tier while the dates are Carta's", () => {
  const r = priceReceipt(dest, opts);
  const meta = { stay_tiers_available: ["dorm", "private"] };
  const f = receiptFooter(dest, r, opts, { datesOwn: false, meta });
  assert.equal(f.kind, "tier");
  assert.equal(f.tier, "dorm");
  assert.ok(f.total < r.total);
});

test("the footer names the week after once the dates are the visitor's own", () => {
  const r = priceReceipt(dest, opts);
  const f = receiptFooter(dest, r, opts, { datesOwn: true, meta: null });
  // The global curve is flat from one November week to the next, so the
  // footer reaches four weeks out, into December's rate.
  assert.equal(f.kind, "month");
  assert.ok(Math.abs(f.total - r.total) >= 0.01);
});

test("a trip prices at the nearest catalogue town with a bed and a food figure, within 30 km", () => {
  const dests = {
    A: { ...dest, city_lat: 45.65, city_lon: 13.78 },
    B: { ...dest, city: "Far", city_lat: 46.2, city_lon: 13.78 },
    C: { city: "NoCosts", city_lat: 45.651, city_lon: 13.78, accommodation: dest.accommodation },
  };
  assert.equal(nearestPricedDest(dests, 45.66, 13.78).id, "A");
  assert.equal(nearestPricedDest(dests, 46.0, 13.78, 10), null);
  assert.equal(nearestPricedDest(null, 45.66, 13.78), null);
});

test("a solo traveller in a private room pays for the whole double room (T100)", () => {
  const solo = priceReceipt(dest, { ...opts, people: 1, stayTier: "private" });
  const pair = priceReceipt(dest, { ...opts, people: 2, stayTier: "private" });
  const stay = (r) => r.lines.find((l) => l.key === "stay").eur;
  // Same room, same price: one head pays what two would have shared.
  assert.equal(stay(solo), stay(pair));
  assert.ok(solo.each > pair.each);
});
