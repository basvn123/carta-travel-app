// T534: one bed price for every screen (lib/stayPrice.js). Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { bedPrice, tiersAt, normaliseTier, peakOf, monthRates, cheapestMonths, seasonCurve, bedFromPerPerson } from "../src/lib/stayPrice.js";
import { setStayRecords } from "../src/lib/staysData.js";
import { computeCosts } from "../src/lib/costIndex.js";
import { accommodationPerPerson } from "../src/lib/runtime_pricing.js";
import { quoteStay, tripRequest, priceDay, atDates } from "../src/lib/price/index.js";

// Mallorca-like: August about twice November, a 3-star room at 84 a night.
const SEASON = [0.6, 0.6, 0.7, 0.85, 1, 1.3, 1.6, 1.7, 1.3, 0.9, 0.6, 0.65];
const month = (base) => SEASON.map((f) => Math.round(base * f));
const PMI = {
  id: "PMI", city: "Palma", iso2: "ES",
  accommodation: {
    beds: { dorm: 26, private: 70, bnb_room: 64, bnb_home: { "2": 120, "4": 160, "6": 230, "8": 300 },
      hotel2: 66, hotel3: 84, hotel4: 115, hotel5: 190 },
    q: "measured", captured: "2026-10-20",
    supply: { hostel: true, hotel: true, hotel5: true, bnb: true },
  },
  costs: { meal_mid_eur: 30, meal_cheap_eur: 14, fastfood_eur: 9, drink_out_eur: 4, cocktail_eur: 10,
    coffee_eur: 2, grocery_day_eur: 11, club_entry_eur: 12, level: "city" },
};
const VILLAGE = {
  id: "VIL", city: "Village", iso2: "ES",
  accommodation: { beds: { bnb_home: { "2": 80, "4": 100 }, hotel3: 70 }, q: "nearby",
    supply: { hostel: false, hotel: true, hotel5: false, bnb: true } },
};
setStayRecords({
  PMI: {
    month: { hotel3: month(84), dorm: month(26), bnb_home: month(160), private: month(70) },
    weekend: 1.15, peak: { aug15: 1.3 }, single: { hotel: 0.8 }, season_q: "mmmmmmmmmmmm",
    src: { hotel3: { q: "measured", n: 4 }, bnb_home: { q: "measured", n: 900 } },
  },
  VIL: { src: { hotel3: { q: "nearby", from: "Palma", km: 12 } } },
});

test("tiers: aliases, and a town only offers what it has", () => {
  assert.equal(normaliseTier("hotel"), "hotel3");
  assert.equal(normaliseTier("bnb_home"), "home");
  assert.equal(normaliseTier("castle"), "home");
  assert.deepEqual(tiersAt(VILLAGE), ["home", "hotel3"]);
  assert.equal(tiersAt({}).length, 0);
});

test("a night takes its own month: August is dearer than November", () => {
  const aug = bedPrice({ dest: PMI, tier: "hotel3", adults: 2, nights: 1, start: "2027-08-03" });
  const nov = bedPrice({ dest: PMI, tier: "hotel3", adults: 2, nights: 1, start: "2026-11-10" });
  assert.ok(aug.total > 1.4 * nov.total);
  assert.equal(aug.basis, "dated");
  const byMonth = bedPrice({ dest: PMI, tier: "hotel3", adults: 2, nights: 1, month: 8 });
  assert.equal(byMonth.basis, "month");
  assert.equal(byMonth.rate, month(84)[7]);
  const annual = bedPrice({ dest: PMI, tier: "hotel3", adults: 2, nights: 1 });
  assert.equal(annual.rate, 84);
});

test("a stay across 31 July pays July and August, night by night", () => {
  const span = bedPrice({ dest: PMI, tier: "hotel3", adults: 2, nights: 2, start: "2027-07-31" });
  const jul = month(84)[6] * 1.15;  // 31 July 2027 is a Saturday: the weekend factor
  const aug = month(84)[7];         // 1 August 2027 is a Sunday
  assert.ok(Math.abs(span.total - (jul + aug)) < 0.02);
});

test("weekend and peak factors apply on their nights only", () => {
  const tue = bedPrice({ dest: PMI, tier: "hotel3", adults: 2, nights: 1, start: "2027-05-11" });
  const fri = bedPrice({ dest: PMI, tier: "hotel3", adults: 2, nights: 1, start: "2027-05-14" });
  assert.ok(Math.abs(fri.total / tue.total - 1.15) < 0.01);
  assert.equal(peakOf(Date.UTC(2027, 7, 14)), "aug15");
  assert.equal(peakOf(Date.UTC(2026, 11, 28)), "xmas");
  assert.equal(peakOf(Date.UTC(2027, 2, 27)), "easter");   // Easter 2027 is 28 March
  assert.equal(peakOf(Date.UTC(2027, 4, 11)), null);
});

test("rooms are sized to the party; a dorm is per bed; a solo hotel guest gets the single rate", () => {
  const two = bedPrice({ dest: PMI, tier: "hotel3", adults: 2, nights: 1 });
  const three = bedPrice({ dest: PMI, tier: "hotel3", adults: 3, nights: 1 });
  assert.equal(three.units, 2);
  assert.equal(three.total, 2 * two.total);
  const dorm = bedPrice({ dest: PMI, tier: "dorm", adults: 3, nights: 1 });
  assert.equal(dorm.unit, "bed");
  assert.equal(dorm.total, 3 * 26);
  const solo = bedPrice({ dest: PMI, tier: "hotel3", adults: 1, nights: 1 });
  assert.ok(Math.abs(solo.total - 84 * 0.8) < 0.01);
});

test("an entire place is sized to the group and carries Airbnb's fees; a hotel does not", () => {
  const home = bedPrice({ dest: PMI, tier: "home", adults: 5, nights: 3 });
  assert.equal(home.unit, "place");
  assert.ok(home.cleaning > 0 && home.service > 0);
  assert.ok(Math.abs(home.total - (230 * 3 + 0.5 * 230) * 1.14) < 0.05);
  const week = bedPrice({ dest: PMI, tier: "home", adults: 2, nights: 7 });
  assert.equal(week.weeklyDiscount, true);
  const hotel = bedPrice({ dest: PMI, tier: "hotel4", adults: 2, nights: 3 });
  assert.equal(hotel.cleaning, 0);
  assert.equal(hotel.total, 3 * 115);
});

test("a tier the town cannot price falls back to the entire place and says so", () => {
  const b = bedPrice({ dest: VILLAGE, tier: "dorm", adults: 2, nights: 2 });
  assert.equal(b.tier, "home");
  assert.equal(b.fallback, true);
  const h = bedPrice({ dest: VILLAGE, tier: "hotel3", adults: 2, nights: 1 });
  assert.equal(h.q, "nearby");
  assert.equal(h.from, "Palma");
  assert.equal(bedPrice({ dest: { id: "x" }, tier: "home" }), null);
});

test("one stay, one price: the Explore card times the nights is the planner's Beds line", () => {
  const nights = 7;
  const start = "2027-06-08";
  const card = computeCosts({ PMI }, { group_size: 2, stay_tier: "hotel3", start, nights }).get("PMI");
  // T702: the planner's stop is the engine's day, so the two agree to the cent.
  const stop = quoteStay(PMI, nights, start, tripRequest({ groupSize: 2, stayTier: "hotel3" }));
  // The cost index is within rounding of it; the engine row the card shows
  // (whole cents a day, T662) times the nights is the Beds line to the cent.
  assert.ok(Math.abs(card.stayEur * nights * 2 - stop.accomTotal) < 0.1,
    `card ${card.stayEur * nights * 2} vs planner ${stop.accomTotal}`);
  const shown = priceDay(PMI, atDates(tripRequest({ groupSize: 2, stayTier: "hotel3" }), start, "2027-06-15"));
  assert.equal(Math.round(shown.stayEur * nights * 2 * 100) / 100, stop.accomTotal);
  const pp = accommodationPerPerson(PMI, nights, start, null, 2, "hotel3");
  assert.ok(Math.abs(pp.total * 2 - stop.accomTotal) < 0.1);
});

test("a month in the Explore filter moves the card price", () => {
  const aug = computeCosts({ PMI }, { group_size: 2, stay_tier: "hotel3", month: 8 }).get("PMI");
  const nov = computeCosts({ PMI }, { group_size: 2, stay_tier: "hotel3", month: 11 }).get("PMI");
  assert.ok(aug.stayEur > 1.4 * nov.stayEur);
  assert.equal(aug.stayLevel, "city");
});

test("month rows and the cheapest months come from the measured curve", () => {
  assert.equal(monthRates(PMI, "hotel3")[7], month(84)[7]);
  assert.deepEqual(cheapestMonths(PMI, "hotel3"), [1, 2]);
  const c = seasonCurve(PMI);
  assert.equal(c.length, 12);
  assert.ok(c[7] > c[10]);
  assert.equal(seasonCurve(VILLAGE), null);
});

test("a bed from: the cheapest per person of two", () => {
  assert.equal(bedFromPerPerson(PMI.accommodation.beds), 26);
  assert.equal(bedFromPerPerson({ bnb_home: { "2": 90 }, hotel3: 120 }), 45);
  assert.equal(bedFromPerPerson(null), null);
});
