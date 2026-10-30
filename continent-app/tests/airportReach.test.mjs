// T860, T861: the airports within reach of home (src/lib/airportReach.js),
// the drive estimate from config/pricing.json origins.airport_access and the
// way to the airport and back. Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { airportsNear, originsWithin, homeAirports, accessCost, driveOf, REACH_HOURS, DEFAULT_REACH } from "../src/lib/airportReach.js";
import { rule } from "../src/lib/price/config.js";

const META = { origins: {
  BRU: { city: "Brussels", lat: 50.9014, lon: 4.4844 },
  CRL: { city: "Charleroi", lat: 50.462, lon: 4.4596 },
  LIL: { city: "Lille", lat: 50.5666, lon: 3.1024 },
  EIN: { city: "Eindhoven", lat: 51.4501, lon: 5.3745 },
  LGG: { city: "Liege", lat: 50.6386, lon: 5.4439 },
  AMS: { city: "Amsterdam", lat: 52.3105, lon: 4.7683 },
  ATH: { city: "Athens", lat: 37.9364, lon: 23.9445 },
} };
const GHENT = { lat: 51.054, lon: 3.717 };
const SWEPT = { BRU: 1345, CRL: 714, LIL: 104, EIN: 587, AMS: 2006, ATH: 1204 };

test("the estimate lives in config and is marked as one", () => {
  const r = rule("origins.airport_access");
  assert.ok(r.road_factor > 1 && r.drive_kmh > 0 && r.parking_eur_per_day > 0);
  assert.deepEqual(REACH_HOURS, [1, 2, 3]);
  assert.equal(DEFAULT_REACH, 2);
  // 100 km straight is 130 road km at 85 km/h: 92 minutes.
  assert.deepEqual(driveOf(100), { roadKm: 130, minutes: 92 });
});

test("from Ghent: airports within three hours, nearest drive first, with prices or not", () => {
  const list = airportsNear(META, GHENT, { covered: SWEPT });
  assert.deepEqual(list.map((a) => a.iata), ["BRU", "LIL", "CRL", "EIN", "LGG", "AMS"]);
  assert.ok(list.every((a, i) => i === 0 || a.minutes >= list[i - 1].minutes));
  assert.equal(list.find((a) => a.iata === "LGG").covered, false, "no file from the sweep: no prices yet");
  assert.ok(!list.some((a) => a.iata === "ATH"));
});

test("a reach ticks every covered airport inside it, never an uncovered one", () => {
  const list = airportsNear(META, GHENT, { covered: SWEPT });
  assert.deepEqual(originsWithin(list, 1), ["BRU"]);
  assert.deepEqual(originsWithin(list, 2), ["BRU", "LIL", "CRL", "EIN"]);
  assert.ok(!originsWithin(list, 3).includes("LGG"));
  assert.ok(originsWithin(list, 3).includes("AMS"));
});

test("a town with no airport inside the reach still gets its nearest covered one", () => {
  const far = { lat: 47.0, lon: 14.0 };
  const list = airportsNear(META, far, { covered: SWEPT });
  // The nearest is Liege, which the sweep does not cover: the list runs on to the nearest priced one.
  assert.equal(list[0].iata, "LGG");
  assert.equal(list.at(-1).covered, true);
  assert.deepEqual(originsWithin(list, 1), [list.at(-1).iata]);
  assert.deepEqual(airportsNear(META, null), []);
});

test("the ticked airports carry their drive; unknown codes are left out", () => {
  const rows = homeAirports(META, GHENT, ["EIN", "BRU", "XXX"]);
  assert.deepEqual(rows.map((r) => r.iata), ["BRU", "EIN"]);
  assert.ok(rows[1].minutes > rows[0].minutes && rows[1].roadKm > rows[0].roadKm);
  assert.equal(homeAirports(META, null, ["EIN"])[0].minutes, null);
});

test("the way to the airport and back: the cheaper of driving and parking, and the train", () => {
  const [bru, , , ein] = airportsNear(META, GHENT, { covered: SWEPT });
  const one = accessCost(bru, { adults: 1, nights: 7 });
  const four = accessCost(ein, { adults: 2, children: 2, nights: 7 });
  assert.ok(one.eur > 0 && four.eur > 0);
  // A family of four on a long drive: one car and its parking beat four tickets each way.
  assert.equal(four.mode, "car");
  const car = rule("car.model");
  const perKm = (car.consumption_l_per_100km / 100) * car.fuel_price_eur_per_l + car.toll_eur_per_100km / 100;
  const parking = rule("origins.airport_access").parking_eur_per_day * 8;
  assert.equal(four.parking, parking);
  assert.equal(four.eur, Math.round((perKm * ein.roadKm * 2 + parking) * 100) / 100);
  // Longer trips park longer.
  assert.ok(accessCost(ein, { adults: 2, children: 2, nights: 14 }).eur > four.eur);
  assert.equal(accessCost({ roadKm: null }, { adults: 1 }), null);
});
