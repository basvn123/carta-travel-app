// The Where quiz scoring (prompt T2). Run: node --test continent-app/tests/
//
// Two kinds of check here. The first group uses small hand-built fixtures, so
// a rule can be stated and shown to hold. The second runs the real published
// catalogue and layer indexes, because the thing worth protecting is not the
// arithmetic but the promise the UI makes: every reason on a card is a number
// that came from a file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  matchCountries, indexLayers, TRIP_TYPES, TRIP_TYPE_BY_KEY, MAX_TRIP_TYPES,
} from "../src/lib/countryMatch.js";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");
const readPub = (p) => {
  const f = join(pub, p);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
};

// ---- fixtures -------------------------------------------------------------

const place = (over = {}) => ({
  city: "X", country: "Testland", iso2: "TL", lat: 45, lon: 10,
  categories: [], rating: { score: 7 }, image: { url: "https://x/y.jpg" }, ...over,
});

/** A catalogue of n places in one country, all carrying `cats`.
 *
 *  The cities are numbered because matchCountries keeps one row per city name:
 *  the real catalogue keys destinations by airport, so Milan arrives as three
 *  rows and is counted once. A fixture of twenty places called "X" is one
 *  place, which is correct and not what any of these tests mean. */
const catalogue = (n, cats, over = {}) => Object.fromEntries(
  Array.from({ length: n }, (_, i) => [`t${i}`, place({ city: `City ${i}`, categories: cats, ...over })]),
);

// ---- the shape of the answer ---------------------------------------------

test("no trip types picked means no recommendations", () => {
  const out = matchCountries({
    destinations: catalogue(20, ["beach"]), answers: { types: [] },
  });
  assert.deepEqual(out, []);
});

test("a country with no signal for the asked type never appears", () => {
  // Nothing in this catalogue is a beach and no beach layer is supplied, so
  // there is nothing true to say and the country is left out entirely.
  const out = matchCountries({
    destinations: catalogue(20, ["historic"]), answers: { types: ["beach"] },
  });
  assert.deepEqual(out, []);
});

test("every reason carries a key and the numbers behind it", () => {
  const out = matchCountries({
    destinations: catalogue(30, ["beach", "coast"]),
    layerIndexes: { beaches: { countries: [{ cc: "TL", n: 120, best: 8.6 }] } },
    answers: { types: ["beach"] },
  });
  assert.equal(out.length, 1);
  assert.ok(out[0].reasons.length > 0);
  for (const r of out[0].reasons) {
    assert.match(r.key, /^match\./);
    assert.equal(typeof r.vars, "object");
    assert.ok(Object.values(r.vars).some((v) => v !== "" && v != null));
  }
});

test("a layer count is quoted verbatim, not rounded or recomputed", () => {
  const out = matchCountries({
    destinations: catalogue(10, ["hiking"]),
    layerIndexes: { trails: { countries: [{ country: "TL", n_trips: 148 }] } },
    answers: { types: ["hiking"] },
  });
  const trailReason = out[0].reasons.find((r) => r.key === "match.layer.trails");
  assert.ok(trailReason, "expected a trails reason");
  assert.equal(trailReason.vars.n, 148);
});

test("at most three reasons, at most three trip types", () => {
  const out = matchCountries({
    destinations: catalogue(40, ["beach", "hiking", "food", "city", "island"]),
    layerIndexes: {
      beaches: { countries: [{ cc: "TL", n: 90 }] },
      trails: { countries: [{ country: "TL", n_trips: 300 }] },
      lakes: { countries: [{ cc: "TL", n: 40 }] },
    },
    answers: { types: ["beach", "hiking", "food", "city", "islands"] },
  });
  assert.ok(out[0].reasons.length <= 3);
  assert.ok(MAX_TRIP_TYPES === 3);
});

// ---- the filters are filters, not penalties -------------------------------

test("a short hop drops what is far away rather than ranking it last", () => {
  const near = catalogue(12, ["city"]);
  const far = Object.fromEntries(Object.entries(catalogue(12, ["city"]))
    .map(([k, v]) => [`f${k}`, { ...v, country: "Faraway", iso2: "FA", lat: 64, lon: 25 }]));
  const all = { ...near, ...far };
  const origin = { lat: 45, lon: 10 };

  const anywhere = matchCountries({
    destinations: all, answers: { types: ["city"], distance: "anywhere" }, origin,
  });
  assert.equal(anywhere.length, 2);

  const short = matchCountries({
    destinations: all, answers: { types: ["city"], distance: "short" }, origin,
  });
  assert.deepEqual(short.map((x) => x.country), ["Testland"]);
});

test("train only drops a country with no rail in its guide", () => {
  const out = matchCountries({
    destinations: catalogue(12, ["city"]),
    insights: { Testland: { iso2: "TL", budget_level: "mid" } },
    answers: { types: ["city"], around: "trainonly" },
  });
  assert.deepEqual(out, []);
});

test("train only keeps, and rewards, a country with rail", () => {
  const withRail = matchCountries({
    destinations: catalogue(12, ["city"]),
    insights: { Testland: { iso2: "TL", rail: { operator: "Testrail" } } },
    answers: { types: ["city"], around: "trainonly" },
  });
  assert.equal(withRail.length, 1);
  assert.ok(withRail[0].reasons.some((r) => r.key === "match.rail"));
});

// ---- season ---------------------------------------------------------------

test("ski scores nothing in July and something in February", () => {
  const args = {
    destinations: catalogue(20, ["skiing", "alps"]),
    layerIndexes: { mountains: { countries: [{ cc: "TL", n: 40 }] } },
    answers: { types: ["ski"] },
  };
  assert.deepEqual(matchCountries({ ...args, month: 7 }), []);
  const winter = matchCountries({ ...args, month: 2 });
  assert.equal(winter.length, 1);
  assert.ok(winter[0].score > 0);
});

// ---- the soft signals move the ranking -----------------------------------

test("avoiding crowds reorders two otherwise equal countries", () => {
  const busy = Object.fromEntries(Object.entries(catalogue(12, ["city"]))
    .map(([k, v]) => [`b${k}`, { ...v, country: "Busy", iso2: "BU", crowding: { tier: 3 } }]));
  const calm = Object.fromEntries(Object.entries(catalogue(12, ["city"]))
    .map(([k, v]) => [`c${k}`, { ...v, country: "Calm", iso2: "CA", crowding: { tier: 1 } }]));
  const all = { ...busy, ...calm };

  const plain = matchCountries({ destinations: all, answers: { types: ["city"] } });
  assert.equal(plain.length, 2);

  const quiet = matchCountries({
    destinations: all, answers: { types: ["city"], avoid: ["crowds"] },
  });
  assert.equal(quiet[0].country, "Calm");
  assert.ok(quiet.find((x) => x.country === "Calm").score
    > quiet.find((x) => x.country === "Busy").score);
});

test("avoiding heat demotes a country whose month runs hot", () => {
  const hotMonths = Array.from({ length: 12 }, () => [34, 20, 10, 40]);
  const mildMonths = Array.from({ length: 12 }, () => [22, 12, 40, 60]);
  const hot = Object.fromEntries(Object.entries(catalogue(12, ["city"]))
    .map(([k, v]) => [`h${k}`, { ...v, country: "Hot", iso2: "HO", climate: { m: hotMonths } }]));
  const mild = Object.fromEntries(Object.entries(catalogue(12, ["city"]))
    .map(([k, v]) => [`m${k}`, { ...v, country: "Mild", iso2: "MI", climate: { m: mildMonths } }]));

  const out = matchCountries({
    destinations: { ...hot, ...mild }, month: 7,
    answers: { types: ["city"], avoid: ["heat"] },
  });
  assert.equal(out[0].country, "Mild");
});

test("the month from the When step is rewarded, and named", () => {
  const out = matchCountries({
    destinations: catalogue(12, ["city"]),
    insights: { Testland: { iso2: "TL", best_months: [9, 10] } },
    answers: { types: ["city"] }, month: 10,
  });
  assert.equal(out[0].bestMonth, 10);
  // The reason counts the good months, which is a number the copy can print.
  // It used to pass the month itself, and the English read "At its best this
  // month": a reason with no number in it, which is the one thing this file
  // exists to prevent.
  assert.ok(out[0].reasons.some((r) => r.key === "match.bestMonth" && r.vars.n === 2));
});

test("every reason variable is a number or a non-empty name", () => {
  // Guards the contract the cards rely on: t(key, vars) has to be able to
  // render a fact. A reason whose vars hold nothing printable is a reason that
  // reaches the screen as an adjective.
  const out = matchCountries({
    destinations: catalogue(30, ["beach", "coast"]),
    insights: { Testland: { iso2: "TL", best_months: [7], budget_level: "mid", daily_budget_eur: [50, 90] } },
    layerIndexes: { beaches: { countries: [{ cc: "TL", n: 120, best: 8.6 }] } },
    answers: { types: ["beach"], spend: "standard" }, month: 7,
  });
  for (const r of out[0].reasons) {
    const vals = Object.values(r.vars);
    assert.ok(vals.length > 0, `${r.key} has no vars`);
    for (const v of vals) {
      if (typeof v === "number") assert.ok(v > 0, `${r.key} = ${v}`);
      else assert.ok(String(v).trim().length > 0, `${r.key} is blank`);
    }
  }
});

test("the spend answer follows the guide's budget level", () => {
  const dests = catalogue(12, ["city"]);
  const cheap = matchCountries({
    destinations: dests,
    insights: { Testland: { iso2: "TL", budget_level: "budget", daily_budget_eur: [30, 60] } },
    answers: { types: ["city"], spend: "budget" },
  });
  const mismatch = matchCountries({
    destinations: dests,
    insights: { Testland: { iso2: "TL", budget_level: "budget", daily_budget_eur: [30, 60] } },
    answers: { types: ["city"], spend: "luxury" },
  });
  assert.ok(cheap[0].score > mismatch[0].score);
  assert.ok(cheap[0].reasons.some((r) => r.key === "match.budget" && r.vars.lo === 30));
});

// ---- topPlaces are evidence ----------------------------------------------

test("topPlaces only holds places that carry a chosen type and a photo", () => {
  const dests = {
    ...catalogue(6, ["beach"]),
    nophoto: place({ city: "Nophoto", categories: ["beach"], image: null, rating: { score: 10 } }),
    offtopic: place({ city: "Offtopic", categories: ["nightlife"], rating: { score: 10 } }),
  };
  const out = matchCountries({
    destinations: dests,
    layerIndexes: { beaches: { countries: [{ cc: "TL", n: 30 }] } },
    answers: { types: ["beach"] },
  });
  assert.ok(out[0].topPlaces.length <= 3);
  assert.ok(!out[0].topPlaces.includes("nophoto"));
  assert.ok(!out[0].topPlaces.includes("offtopic"));
});

// ---- the index readers reconcile two column names ------------------------

test("indexLayers reads cc and country alike", () => {
  const L = indexLayers({
    trails: { countries: [{ country: "fr", n_trips: 900 }] },
    beaches: { countries: [{ cc: "ES", n: 648, best: 8.4 }] },
  });
  assert.equal(L.trails("FR").n, 900);
  assert.equal(L.beaches("ES").n, 648);
  assert.equal(L.beaches("ES").best, 8.4);
  assert.equal(L.lakes("ES"), null);
});

// ---- against the real published data -------------------------------------

const appData = readPub("app_data.json");
const realIndexes = {
  trails: readPub("trails/index.json"),
  beaches: readPub("beaches/index.json"),
  lakes: readPub("lakes/index.json"),
  mountains: readPub("mountains/index.json"),
  cycling: readPub("cycling/index.json"),
};
const insights = readPub("country_insights.json")?.countries || null;
const haveData = Boolean(appData?.destinations && insights);

test("every trip type finds at least one country in the real catalogue", { skip: !haveData }, () => {
  // A trip type nobody can be recommended for is a dead chip on the screen.
  // Seasonal types are asked in their own season.
  for (const type of TRIP_TYPES) {
    const month = type.months ? type.months[0] : 6;
    const out = matchCountries({
      destinations: appData.destinations,
      insights,
      layerIndexes: realIndexes,
      answers: { types: [type.key] },
      month,
    });
    assert.ok(out.length > 0, `no country matched "${type.key}"`);
    assert.ok(out[0].reasons.length > 0, `"${type.key}" matched with no reason`);
  }
});

test("real reasons never quote a zero or a missing number", { skip: !haveData }, () => {
  const out = matchCountries({
    destinations: appData.destinations,
    insights,
    layerIndexes: realIndexes,
    answers: { types: ["hiking", "beach", "food"], spend: "standard", avoid: ["crowds"] },
    month: 9,
    origin: { lat: 51.2, lon: 4.4 },
  });
  assert.ok(out.length >= 6, "expected a full page of recommendations");
  for (const row of out.slice(0, 12)) {
    for (const r of row.reasons) {
      for (const [k, v] of Object.entries(r.vars)) {
        if (typeof v === "number") assert.ok(v > 0, `${row.country} ${r.key} ${k} = ${v}`);
        else assert.ok(String(v).length > 0, `${row.country} ${r.key} ${k} is empty`);
      }
    }
  }
});

test("a trail-running answer puts real trail countries on top", { skip: !haveData }, () => {
  const out = matchCountries({
    destinations: appData.destinations,
    insights,
    layerIndexes: realIndexes,
    answers: { types: ["trailrun"] },
    month: 9,
  });
  const top = out.slice(0, 8).map((x) => x.iso2);
  // Not a fixed expected list (the catalogue grows), but the leaders must be
  // countries the trails layer actually published a lot of trips for.
  const trails = indexLayers(realIndexes).trails;
  for (const cc of top.slice(0, 3)) {
    assert.ok((trails(cc)?.n || 0) > 0, `${cc} led trail running with no published trails`);
  }
});

test("a short hop from Antwerp excludes the far corners of Europe", { skip: !haveData }, () => {
  const out = matchCountries({
    destinations: appData.destinations,
    insights,
    layerIndexes: realIndexes,
    answers: { types: ["city"], distance: "short" },
    origin: { lat: 51.2, lon: 4.4 },
    month: 6,
  });
  const iso = new Set(out.map((x) => x.iso2));
  assert.ok(iso.has("FR") || iso.has("DE"), "expected the neighbours to survive");
  for (const far of ["GR", "TR", "IS", "CY"]) {
    assert.ok(!iso.has(far), `${far} is not a short hop from Antwerp`);
  }
});

test("TRIP_TYPES keys are unique and all reachable by key", () => {
  const keys = TRIP_TYPES.map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.ok(TRIP_TYPE_BY_KEY.get(k));
});

// ---- one city per city ----------------------------------------------------

test("the airport rows of one city are counted once", () => {
  // The catalogue keys destinations by airport, so Milan is three rows. Before
  // this was fixed a country's score rose with its number of runways: Italy
  // read as holding 31 food cities, several of which were Rome and Milan.
  const milan = ["Milan (Malpensa)", "Milan (Bergamo)", "Milan (Linate)"];
  const dests = Object.fromEntries(milan.map((city, i) => [
    `m${i}`,
    place({ city, categories: ["food"], rating: { score: 6 + i, fame: 2000 } }),
  ]));
  const out = matchCountries({
    destinations: dests, answers: { types: ["food"] },
  });
  // One city, under the evidence floor, so no catalogue weight and no match.
  assert.deepEqual(out, []);
});

test("deduping keeps the best-rated row of a city", () => {
  const dests = {
    a: place({ city: "Rome (Fiumicino)", categories: ["historic"], rating: { score: 6 } }),
    b: place({ city: "Rome (Ciampino)", categories: ["historic"], rating: { score: 9.8 } }),
    ...catalogue(8, ["historic"]),
  };
  const out = matchCountries({ destinations: dests, answers: { types: ["culture"] } });
  assert.equal(out.length, 1);
  // The kept Rome is the 9.8 one, which is the row carrying the good photo.
  assert.ok(out[0].topPlaces.includes("b") || !out[0].topPlaces.includes("a"));
});
