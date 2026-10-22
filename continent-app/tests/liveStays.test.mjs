// T540: live bed prices for the traveller's own nights (lib/liveStays.js). Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { sampleNights, liveStay, setLiveResult, nearestLiveDest } from "../src/lib/liveStays.js";
import { setStayRecords } from "../src/lib/staysData.js";
import { bedPrice, liveStayRatio } from "../src/lib/stayPrice.js";
import { computeCosts } from "../src/lib/costIndex.js";

const VIE = {
  id: "VIE", city: "Vienna", iso2: "AT",
  accommodation: { beds: { hotel2: 90, hotel3: 120, hotel4: 160, hotel5: 260, bnb_room: 70,
    bnb_home: { "2": 110, "4": 150 } }, q: "measured",
    supply: { hostel: false, hotel: true, hotel5: true, bnb: true } },
  costs: { meal_mid_eur: 25, meal_cheap_eur: 12, fastfood_eur: 9, drink_out_eur: 4, cocktail_eur: 11,
    coffee_eur: 3, grocery_day_eur: 10, club_entry_eur: 12, level: "city" },
};
// Four hotels by price quartile (one with a known 4 stars), two guesthouses,
// each with its typical night.
const XK = [["g1-d1", "g", 0, -1, 80], ["g1-d2", "g", 0, -1, 90], ["g1-d3", "h", 0, 0, 100],
  ["g1-d4", "h", 0, 1, 120], ["g1-d5", "h", 4, 2, 160], ["g1-d6", "h", 0, 3, 250]];
setStayRecords({ VIE: { xk: XK, src: {} } });

const START = "2027-03-10";
// Prices at a factor f of each property's typical night (h3 at its own factor).
const night = (f, h3 = f) => ({ "g1-d1": 80 * f, "g1-d2": 90 * f, "g1-d3": 100 * f, "g1-d4": 120 * h3,
  "g1-d5": 160 * f, "g1-d6": 250 * f });

test("sampleNights: the first and the middle night", () => {
  assert.deepEqual(sampleNights("2027-03-10", 7), ["2027-03-10", "2027-03-13"]);
  assert.deepEqual(sampleNights("2027-03-10", 2), ["2027-03-10", "2027-03-11"]);
  assert.deepEqual(sampleNights("2027-03-10", 1), ["2027-03-10"]);
});

test("liveStay: tonight against typical; stars first, then the price quartile", () => {
  setLiveResult("VIE", START, 4, 2, { checked: "2027-01-01T10:00:00Z", nights: {
    "2027-03-10": night(1.2, 1.25),
    "2027-03-12": night(1.4, 1.45),
  } });
  const f = (tier) => Math.round(liveStay("VIE", tier, START, 4, 2).factor * 100) / 100;
  assert.equal(f("hotel4"), 1.3);     // the 4-star
  assert.equal(f("hotel3"), 1.35);    // quartile 1
  assert.equal(f("room"), 1.3);       // the guesthouses
  assert.equal(liveStay("VIE", "home", START, 4, 2), null);     // not live
  assert.equal(liveStay("VIE", "hotel3", START, 5, 2), null);   // another stay
});

test("bedPrice takes the live night for a dated stay, marked live", () => {
  const b = bedPrice({ dest: VIE, tier: "hotel3", adults: 2, nights: 4, start: START });
  assert.equal(b.q, "live");
  assert.equal(b.basis, "live");
  // No month curve here, so the model's season is 1: the stay moves by 1.35 ^ 0.6.
  assert.equal(Math.round(b.total), Math.round(120 * 4 * 1.35 ** 0.6));
  const undated = bedPrice({ dest: VIE, tier: "hotel3", adults: 2, nights: 4 });
  assert.notEqual(undated.q, "live");
});

test("a ratio outside 0.4 to 3 is a broken answer and is ignored", () => {
  setLiveResult("VIE", START, 4, 2, { checked: "x", nights: {
    "2027-03-10": night(1.2, 7.5),
  } });
  assert.notEqual(bedPrice({ dest: VIE, tier: "hotel3", adults: 2, nights: 4, start: START }).q, "live");
  setLiveResult();
});

test("the cost index counts a live bed as measured in town", () => {
  setLiveResult("VIE", START, 4, 2, { checked: "2027-01-01T10:00:00Z", nights: {
    "2027-03-10": night(1.2),
  } });
  const row = computeCosts({ VIE }, { stay_tier: "hotel3", group_size: 2, start: START, nights: 4 }).get("VIE");
  assert.equal(row.stayLevel, "city");
  assert.equal(row.stayLive, "2027-01-01T10:00:00Z");
  setLiveResult();
});

test("liveStayRatio: live total over model total, null when not live (T559)", () => {
  setLiveResult("VIE", START, 4, 2, { checked: "c", nights: { "2027-03-10": night(1.2, 1.35) } });
  const r = liveStayRatio({ dest: VIE, tier: "hotel3", adults: 2, nights: 4, start: START });
  assert.equal(Math.round(r.ratio * 1000) / 1000, Math.round(1.35 ** 0.6 * 1000) / 1000);
  assert.equal(liveStayRatio({ dest: VIE, tier: "home", adults: 2, nights: 4, start: START }), null);
  setLiveResult();
});

test("nearestLiveDest: the closest town with live keys, within the radius (T559)", () => {
  const dests = {
    VIE: { ...VIE, lat: 48.2085, lon: 16.3721 },
    FAR: { id: "FAR", lat: 47.0, lon: 15.4 },          // no keys
  };
  assert.equal(nearestLiveDest(dests, 48.25, 16.4)?.id, "VIE");        // about 5 km
  assert.equal(nearestLiveDest(dests, 47.0, 15.4), null);              // 150 km away
  assert.equal(nearestLiveDest(dests, NaN, 16.4), null);
});
