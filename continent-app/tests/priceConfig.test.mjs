// T690 to T692 (F3): the one price configuration, continent-app/config/
// pricing.json, and invariant V13 of plan "Carta prijslogica Explore": no
// number that moves a price lives outside it, and every rule says what it
// is, where it comes from and when to look at it again.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
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
  "src/lib/whenGuide.js", // T1022: when to go and stay prices by month
  "src/lib/wayChoice.js", // T1100: the way-there pick, from way.choice
];
const NOT_A_PRICE = new Set([
  "DAY", "DAY_MS",        // milliseconds in a day
  "GROUND_LONG_HAUL_KM",  // when a ground leg stops being a recommendation
  "MAX_AGE_MS",           // derived from flights.max_age_days
  "COST_SLICE", "SLICE_MS", // G12, D10: how much pricing runs before the browser gets a turn
]);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

// The guard's scanner: the top-level constants whose value is a bare number or
// a table of numbers (RC16: the same rule now covers all of lib/).
export function numericConsts(source) {
  const out = [];
  for (const m of strip(source).matchAll(/^(?:export )?const ([A-Z][A-Z0-9_]*) = ([^;\n]+)/gm)) {
    const [, name, rhs] = m;
    if (/^-?\d/.test(rhs.trim()) || /^[[{][^a-zA-Z'"`]*\d/.test(rhs.trim())) out.push([name, rhs.trim().slice(0, 40)]);
  }
  return out;
}

test("V13: no price module keeps a number of its own", () => {
  const found = [];
  for (const rel of PRICE_MODULES) {
    for (const [name, rhs] of numericConsts(readFileSync(join(APP, rel), "utf8"))) {
      if (!NOT_A_PRICE.has(name)) found.push(`${rel}: ${name} = ${rhs}`);
    }
  }
  assert.deepEqual(found, []);
});

// RC16 (A-11): the same rule over all of src/lib/. A number that is not a price
// is listed in tests/fixtures/libNumberAllowlist.json with a reason per file;
// a new one fails here until it moves into config or is listed with a reason.
const libFiles = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? libFiles(p) : p.endsWith(".js") ? [p] : [];
});
const ALLOW = JSON.parse(readFileSync(join(APP, "tests/fixtures/libNumberAllowlist.json"), "utf8")).files;

test("RC16: no number outside config anywhere in lib/ unless the allowlist says why", () => {
  const found = [];
  const seen = {};
  for (const abs of libFiles(join(APP, "src/lib"))) {
    const rel = abs.slice(join(APP, "src/lib").length + 1).replace(/\\/g, "/");
    if (PRICE_MODULES.includes(`src/lib/${rel}`)) continue; // held to the stricter list above
    for (const [name, rhs] of numericConsts(readFileSync(abs, "utf8"))) {
      (seen[rel] ||= []).push(name);
      if (!ALLOW[rel]?.names.includes(name)) found.push(`src/lib/${rel}: ${name} = ${rhs} (move it to config/pricing.json, or list it in tests/fixtures/libNumberAllowlist.json with a reason)`);
    }
  }
  assert.deepEqual(found, []);
  // A stale entry hides nothing today but would let a future constant of that name through.
  const stale = Object.entries(ALLOW).flatMap(([rel, v]) => v.names.filter((n) => !seen[rel]?.includes(n)).map((n) => `${rel}: ${n}`));
  assert.deepEqual(stale, [], "remove the allowlist entries for constants that are gone");
  for (const [rel, v] of Object.entries(ALLOW)) assert.ok(v.why && v.why.length > 20, `${rel}: a reason`);
});

test("RC16: the budget search keeps its numbers in config/pricing.json budget.search (A-11)", () => {
  assert.equal(ALLOW["budgetSearch.js"], undefined);
  assert.deepEqual(numericConsts(readFileSync(join(APP, "src/lib/budgetSearch.js"), "utf8")), []);
  assert.equal(rule("budget.search").days_default, 5);
});

test("RC16: a planted literal fails the guard", () => {
  assert.deepEqual(numericConsts("export const CLEANING_FEE = 25;\n"), [["CLEANING_FEE", "25"]]);
  assert.deepEqual(numericConsts("const RATES = [0.1, 0.2];\n"), [["RATES", "[0.1, 0.2]"]]);
  assert.deepEqual(numericConsts("const A = rule('x.y');\n// const B = 3;\n"), []);
  // and a file the allowlist does not know has no entry, so the loop above would report it:
  assert.equal(ALLOW["plantedNewFile.js"], undefined);
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
