// T690 to T692 (F3): the one price configuration, continent-app/config/
// pricing.json, and invariant V13 of plan "Carta prijslogica Explore": no
// number that moves a price lives outside it, and every rule says what it
// is, where it comes from and when to look at it again.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRICING_RULES, rule } from "../src/lib/price/config.js";
import { partyOf } from "../src/lib/party.js";
import { getGroundFareCalibration, resolveGroundFare } from "../src/lib/groundFares.js";
import { legCost } from "../src/lib/flights/flights.js";
import { bagFee } from "../src/lib/flights/bagFees.js";
import { interCityGroundEstimate } from "../src/lib/trip_planner_pricing.js";
import { DEFAULT_CAR_MODEL } from "../src/lib/runtime_pricing.js";
import { DEFAULT_PRICE_REQUEST } from "../src/lib/price/index.js";

const APP = fileURLToPath(new URL("..", import.meta.url));
const KINDS = ["measured", "sourced", "estimate"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

test("V13: every rule has a value, unit, kind, source, date, review date and a test that exists", () => {
  for (const [key, r] of Object.entries(PRICING_RULES)) {
    assert.ok(r.value !== undefined, `${key}: value`);
    assert.ok(typeof r.unit === "string" && r.unit, `${key}: unit`);
    assert.ok(KINDS.includes(r.kind), `${key}: kind ${r.kind}`);
    assert.ok(typeof r.source === "string" && r.source.length > 10, `${key}: source`);
    assert.match(r.date, DATE, `${key}: date`);
    assert.match(r.review, DATE, `${key}: review`);
    assert.ok(r.review > r.date, `${key}: review after date`);
    const where = r.test.startsWith("pipeline/") ? join(APP, "..", r.test) : join(APP, r.test);
    // The root repo carries the pipeline tests; a checkout of the app alone does not.
    if (!r.test.startsWith("pipeline/") || existsSync(join(APP, "..", "pipeline"))) {
      assert.ok(existsSync(where), `${key}: test ${r.test}`);
    }
  }
});

test("V13: an unknown rule fails loudly", () => {
  assert.throws(() => rule("no.such.rule"), /not in config\/pricing\.json/);
});

// The price modules: a top-level constant that is a bare number, or a table
// of numbers, is a price rule outside the config unless it is listed here as
// something else (a time, a distance cut, a score). F6 brings the rest of the
// trip-price files in.
const PRICE_MODULES = [
  "src/lib/stayPrice.js", "src/lib/costIndex.js", "src/lib/runtime_pricing.js", "src/lib/party.js",
  "src/lib/countryTransport.js", "src/lib/groundFares.js", "src/lib/flights/flights.js",
  "src/lib/flights/bagFees.js", "src/lib/trip_planner_pricing.js", "src/lib/price/request.js",
  "src/lib/price/priceDay.js", "src/lib/price/flight.js",
  "src/lib/airportReach.js", // T860: the drive to a home airport, from origins.airport_access
];
const NOT_A_PRICE = new Set([
  "DAY", "DAY_MS",        // milliseconds in a day
  "GROUND_LONG_HAUL_KM",  // when a ground leg stops being a recommendation
  "MAX_AGE_MS",           // derived from flights.max_age_days
]);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

test("V13: no price module keeps a number of its own", () => {
  const found = [];
  for (const rel of PRICE_MODULES) {
    const src = strip(readFileSync(join(APP, rel), "utf8"));
    for (const m of src.matchAll(/^(?:export )?const ([A-Z][A-Z0-9_]*) = ([^;\n]+)/gm)) {
      const [, name, rhs] = m;
      if (NOT_A_PRICE.has(name)) continue;
      if (/^-?\d/.test(rhs.trim()) || /^[[{][^a-zA-Z'"`]*\d/.test(rhs.trim())) found.push(`${rel}: ${name} = ${rhs.trim().slice(0, 40)}`);
    }
  }
  assert.deepEqual(found, []);
});

test("T691: one group cap and one baby cap", () => {
  const { max_seats, max_babies, default_seats } = rule("party.limits");
  assert.equal(partyOf({ group_size: 99 }).seats, max_seats);
  assert.equal(partyOf({ group_size: 3, babies: 30 }).babies, max_babies);
  assert.equal(partyOf({}).seats, default_seats);
});

test("T691: one rental fallback and one longest drive", () => {
  assert.equal(DEFAULT_CAR_MODEL.rental_eur_per_day_default, rule("car.model").rental_eur_per_day_default);
  assert.equal(DEFAULT_CAR_MODEL.max_drive_km, rule("car.model").max_drive_km);
});

test("T691: one default bag, priced the same by every flight helper", () => {
  const leg = { airline: "FR", price: 40, checked: Date.now() };
  assert.equal(DEFAULT_PRICE_REQUEST.baggage, rule("request.default_bag"));
  assert.equal(legCost(leg).perSeat, 40 + bagFee("FR", rule("request.default_bag")).eur);
});

test("T691: the ground-fare calibration is loaded, and calibrated cells win over the priors", () => {
  const cal = getGroundFareCalibration();
  assert.ok(cal && cal.countries, "loaded at start");
  const [cc, modes] = Object.entries(cal.countries).find(([, m]) => m.train || m.bus);
  const mode = modes.train ? "train" : "bus";
  const fare = resolveGroundFare({ mode, isoA: cc, isoB: cc, km: 200 });
  assert.equal(fare.src, "cal", `${cc} ${mode}`);
});

test("T691: the intercity estimate is the cheaper of the one model's train and bus fares", () => {
  const a = { iso2: "DE", lat: 52.52, lon: 13.405, city_lat: 52.52, city_lon: 13.405, local_transport: {} };
  const b = { iso2: "DE", lat: 48.137, lon: 11.575, city_lat: 48.137, city_lon: 11.575, local_transport: {} };
  const est = interCityGroundEstimate(a, b, 2);
  const km = est.road_km;
  const best = Math.min(...["train", "bus"].map((mode) => resolveGroundFare({ mode, isoA: "DE", isoB: "DE", km }).eur));
  assert.ok(Math.abs(est.ground_eur_per_person - best) < 0.6, `${est.ground_eur_per_person} vs ${best}`);
});
