// The rank tier of T271: the part of each record the default screens rank,
// filter and price on, shipped as /dest/_rank.json so the Destinations and
// Explore screens paint before the 238 shards. Run: npm test (continent-app/)
//
// The fixtures pin the format. The real-data tests run when public/ holds a
// split (npm run data, or sync-data.mjs --split-only): they price every
// destination from its lite record and from its full record, under several
// choices, and require the same answer. That is the promise worth
// protecting: a first paint from the rank tier ranks Europe exactly as the
// full catalogue does, so the swap to the full records moves nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  splitCatalogue, mergeCatalogue, buildRankTier, decodeRankTier, RANK_FIELDS, RANK_PATH,
} from "../src/lib/bootIndex.js";
import { createCatalogue } from "../src/lib/catalogue.js";
import { hydrateForOrigin, defaultOrigin } from "../src/lib/origins.js";
import { composeTrip } from "../src/lib/runtime_pricing.js";
import { computeCosts } from "../src/lib/costIndex.js";
import { fareFileBase } from "../src/lib/fareFile.js";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");

const core = () => ({
  meta: { schema_version: 17 },
  destinations: {
    BRU: {
      id: "BRU", tier: "airport", city: "Brussels", iso2: "BE", lat: 50.9, lon: 4.48,
      costs: { meal_mid_eur: 20, level: "country" },
      accommodation: { entire_home_night_eur: 120, neighbourhoods: [{ name: "Ixelles" }] },
      bathing_water: { rating: "excellent", nearest: [{ name: "x" }] },
      climate: { m: [[1, 2]], best: [5, 6] },
      activities: { items: [{ name: "Grand Place" }] },
    },
    "gem:be-dinant": {
      id: "gem:be-dinant", tier: "gem", city: "Dinant", iso2: "BE", lat: 50.26, lon: 4.91,
      costs: { meal_mid_eur: 20, level: "country" },
      rating: { score: 7.1, tier: 2, components: { a: 1 } },
    },
    FCO: { id: "FCO", tier: "airport", city: "Rome", iso2: "IT", lat: 41.8, lon: 12.25 },
  },
});

function splitWithRank(c, key = "k1") {
  const { boot, chunks } = splitCatalogue(structuredClone(c));
  for (const k of Object.keys(chunks)) boot.chunks[k] = `h-${k}`;
  const rank = buildRankTier(boot, Object.assign({}, ...Object.values(chunks)), key);
  boot.rank = { key, hash: "r1" };
  return { boot: JSON.parse(JSON.stringify(boot)), chunks, rank: JSON.parse(JSON.stringify(rank)) };
}

test("the rank tier pools repeated values and keeps only the listed fields", () => {
  const { boot, rank } = splitWithRank(core());
  const costs = rank.fields.indexOf("costs");
  assert.equal(rank.pools[costs].length, 1, "the two Belgian baskets are one pooled value");
  const lite = decodeRankTier(boot, rank);
  assert.deepEqual(lite.BRU.bathing_water, { rating: "excellent" }, "nearest sites omitted");
  assert.deepEqual(lite.BRU.climate, { best: [5, 6] }, "only climate.best");
  assert.equal("activities" in lite.BRU, false, "the POI list arrives with the shard");
  assert.deepEqual(lite["gem:be-dinant"].rating, { score: 7.1, tier: 2 }, "no rating components");
  assert.equal("costs" in lite.FCO, false, "an absent field stays absent, not null");
  for (const rec of Object.values(lite)) {
    for (const k of Object.keys(rec)) assert.ok(k === "_lite" || k in RANK_FIELDS, `${k} is listed`);
  }
});

test("a rank file from another boot index is refused", () => {
  const { boot, rank } = splitWithRank(core());
  assert.ok(decodeRankTier(boot, rank));
  assert.equal(decodeRankTier(boot, { ...rank, key: "other" }), null);
  assert.equal(decodeRankTier(boot, { ...rank, rows: rank.rows.slice(1) }), null);
  assert.equal(decodeRankTier({ ...boot, rank: undefined }, rank), null);
  assert.equal(decodeRankTier(boot, null), null);
});

test("the merge fills missing shards with lite records and says it is partial", () => {
  const { boot, chunks, rank } = splitWithRank(core());
  const lite = decodeRankTier(boot, rank);
  const { core: none, lite: n0 } = mergeCatalogue(boot, {}, lite);
  assert.equal(n0, 3);
  assert.equal(none.partial, true);
  assert.equal(none.destinations.BRU._lite, true);
  assert.equal(none.destinations.BRU.lat, 50.9, "position from the boot row");
  const { core: full, lite: n1 } = mergeCatalogue(boot, chunks, lite);
  assert.equal(n1, 0);
  assert.equal(full.partial, undefined, "a complete merge carries no partial flag");
  assert.equal(full.destinations.BRU._lite, undefined);
  assert.deepEqual(Object.keys(none.destinations), Object.keys(full.destinations), "same order");
});

test("the store paints from the rank tier, then fills in shard by shard", async () => {
  const { boot, chunks, rank } = splitWithRank(core());
  const calls = [];
  const store = createCatalogue({
    loadBoot: () => Promise.resolve(boot),
    loadCountry: (k) => { calls.push(k); return Promise.resolve(structuredClone(chunks[k])); },
    loadRank: (hash) => { calls.push(`rank:${hash}`); return Promise.resolve(rank); },
    coalesceMs: 0,
  });
  assert.equal(await store.ensureRank(), true);
  assert.deepEqual(calls, ["rank:r1"], "no shard fetched for the first paint");
  const first = store.snapshot();
  assert.equal(first.partial, true);
  assert.equal(Object.keys(first.destinations).length, 3);
  await store.ensureIds(["FCO"]);
  const mid = store.snapshot();
  assert.equal(mid.destinations.FCO._lite, undefined, "the asked-for place is full");
  assert.equal(mid.destinations.BRU._lite, true);
  await store.ensureAll();
  assert.equal(store.isComplete(), true);
  assert.equal(store.snapshot().partial, undefined);
});

test("a store without a rank tier says so, so the caller loads everything", async () => {
  const { boot, chunks } = splitWithRank(core());
  delete boot.rank;
  const store = createCatalogue({
    loadBoot: () => Promise.resolve(boot),
    loadCountry: (k) => Promise.resolve(structuredClone(chunks[k])),
    loadRank: () => { throw new Error("must not be fetched"); },
    coalesceMs: 0,
  });
  assert.equal(await store.ensureRank(), false);
  const failing = createCatalogue({
    loadBoot: () => Promise.resolve(splitWithRank(core()).boot),
    loadCountry: () => Promise.resolve({}),
    loadRank: () => Promise.reject(new Error("offline")),
    coalesceMs: 0,
  });
  assert.equal(await failing.ensureRank(), false, "a failed fetch is false, not a throw");
});

// ── the real split ───────────────────────────────────────────────────────

const REAL = ["app_data.json", "boot.json", RANK_PATH.slice(1)].every((f) => existsSync(join(pub, f)));

function realCatalogues() {
  const want = JSON.parse(readFileSync(join(pub, "app_data.json"), "utf8"));
  const boot = JSON.parse(readFileSync(join(pub, "boot.json"), "utf8"));
  const rank = JSON.parse(readFileSync(join(pub, RANK_PATH.slice(1)), "utf8"));
  const lite = decodeRankTier(boot, rank);
  assert.ok(lite, "the published rank tier belongs to the published boot index");
  const { core: liteCore, missing } = mergeCatalogue(boot, {}, lite);
  assert.equal(missing, 0);
  return { want, liteCore, boot };
}

test("the published rank tier matches its boot index and the core", { skip: !REAL }, () => {
  const { want, liteCore } = realCatalogues();
  assert.deepEqual(Object.keys(liteCore.destinations), Object.keys(want.destinations), "same ids, same order");
  assert.equal(liteCore.partial, true);
});

test("every destination prices the same from its lite record as from its full one", { skip: !REAL }, () => {
  const { want, liteCore } = realCatalogues();
  const origin = defaultOrigin(want);
  const fares = join(pub, "fares", `${fareFileBase(origin)}.json`);
  const slice = existsSync(fares) ? JSON.parse(readFileSync(fares, "utf8")) : {};
  const full = hydrateForOrigin(want, origin, slice);
  const lite = hydrateForOrigin(liteCore, origin, slice);
  const window = slice.__window || {};
  const depart = window.min_out || want.meta.start_date;
  const ret = new Date(Date.parse(depart) + 7 * 864e5).toISOString().slice(0, 10);
  const base = {
    group_size: 2, baggage_per_direction_eur: 0, origin, transport_mode: "plane",
    lifestyle: want.meta.defaults?.lifestyle, accommodation_model: want.meta.accommodation_model,
    car_model: want.meta.car_model, home: want.meta.home, stay_tier: "home",
  };
  const variants = [
    base,
    { ...base, group_size: 5, stay_tier: "hotel" },
    { ...base, transport_mode: "car", drive_home: { name: "Brussels", lat: 50.85, lon: 4.35 } },
    { ...base, group_size: 1, stay_tier: "dorm", lifestyle: { dinners_per_week: 0, coffees_per_day: 3 } },
  ];
  let priced = 0;
  for (const choices of variants) {
    for (const id of Object.keys(full.destinations)) {
      const a = composeTrip(full.destinations[id], depart, ret, choices, full.destinations);
      const b = composeTrip(lite.destinations[id], depart, ret, choices, lite.destinations);
      assert.equal(JSON.stringify(b), JSON.stringify(a), `${id} prices the same (${JSON.stringify(choices).slice(0, 60)})`);
      if (a) priced += 1;
    }
    const ca = computeCosts(full.destinations, choices);
    const cb = computeCosts(lite.destinations, choices);
    for (const [id, row] of ca) assert.deepEqual(cb.get(id), row, `${id} costs the same`);
  }
  assert.ok(priced > 1000, `a vacuous comparison prices nothing (${priced} priced)`);
});

test("every field a list row projects reads the same from the lite record", { skip: !REAL }, () => {
  const { want, liteCore } = realCatalogues();
  // The fields useDestinationSearch and useExploreCatalog copy into their
  // rows, and the card face reads (image, climate.best, rating, beauty).
  const rowFields = ["tier", "city", "country", "iso2", "lat", "lon", "iata", "anchor_airport",
    "categories", "rating", "beauty", "place", "bathing_water", "crowding", "local_transport",
    "country_rank", "country_n", "country_badge", "blurb", "city_lat", "city_lon"];
  for (const [id, a] of Object.entries(want.destinations)) {
    const b = liteCore.destinations[id];
    for (const f of rowFields) {
      const how = RANK_FIELDS[f];
      if (how && how !== true && a[f] && typeof a[f] === "object") {
        for (const [k, v] of Object.entries(a[f])) {
          if ((how.pick && !how.pick.includes(k)) || (how.omit && how.omit.includes(k))) continue;
          assert.deepEqual(b[f][k], v, `${id}.${f}.${k}`);
        }
      } else {
        assert.deepEqual(b[f], a[f], `${id}.${f}`);
      }
    }
    assert.equal(b.image?.url ?? null, a.image?.url ?? null, `${id}.image.url`);
    assert.deepEqual(b.climate?.best ?? null, a.climate?.best ?? null, `${id}.climate.best`);
  }
});
