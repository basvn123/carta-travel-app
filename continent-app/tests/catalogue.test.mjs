// The region store of T059: destination records fetched by country file as
// the viewport needs them. Run: npm test  (from continent-app/)
//
// The fixtures pin the rules. The last tests drive the real published boot
// index (public/boot.json, when present) through a pan across Europe at city
// zoom and count the country files each step costs, because "panning
// fetches incrementally" is the promise worth protecting.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { splitCatalogue, mergeCatalogue, shardKey } from "../src/lib/bootIndex.js";
import {
  createCatalogue, indexBoot, shardsInBounds, shardsNear,
} from "../src/lib/catalogue.js";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");

const core = () => ({
  meta: { schema_version: 17 },
  destinations: {
    BRU: { id: "BRU", city: "Brussels", iso2: "BE", lat: 50.9, lon: 4.48 },
    AMS: { id: "AMS", city: "Amsterdam", iso2: "NL", lat: 52.31, lon: 4.76 },
    FCO: { id: "FCO", city: "Rome", iso2: "IT", lat: 41.8, lon: 12.25 },
    "gem:be-dinant": { id: "gem:be-dinant", city: "Dinant", iso2: "BE", lat: 50.26, lon: 4.91 },
    NOPOS: { id: "NOPOS", city: "Nowhere", iso2: "IT", lat: null, lon: null },
    FJI: { id: "FJI", city: "Suva", iso2: "FJ", lat: -18.1, lon: 178.4 },
  },
});

// A store over a split fixture, with a fetch that records what it was asked.
function storeFor(c, { fail = new Set() } = {}) {
  const { boot, chunks } = splitCatalogue(structuredClone(c));
  for (const k of Object.keys(chunks)) boot.chunks[k] = `h-${k}`;
  const calls = [];
  const store = createCatalogue({
    loadBoot: () => Promise.resolve(boot),
    loadCountry: (k, hash) => {
      calls.push([k, hash]);
      if (fail.has(k)) { fail.delete(k); return Promise.reject(new Error(`boom ${k}`)); }
      return Promise.resolve(structuredClone(chunks[k]));
    },
    coalesceMs: 0,
  });
  return { store, calls, boot, chunks };
}

test("an oversized country is cut into grid tiles, and the merge stays exact", () => {
  const c = core();
  // Two Belgian places on different 1-degree rows, plus a big payload each.
  c.destinations.BRU.blurb = "x".repeat(400);
  c.destinations["gem:be-dinant"].blurb = "y".repeat(400);
  c.destinations.NOPOS.blurb = "z".repeat(900);
  const { boot, chunks } = splitCatalogue(structuredClone(c), { shardBytes: 600 });
  // BRU and Dinant share a 1-degree cell, so no grid brings BE under the
  // budget and it falls to the finest. IT is over budget through its
  // position-less row, which keeps the plain country key at any grid.
  assert.deepEqual(boot.tiles, { BE: 1, IT: 1 });
  assert.deepEqual(Object.keys(chunks).sort(), ["BE_1_50_4", "FJ", "IT", "IT_1_41_12", "NL"]);
  assert.ok(chunks.IT.NOPOS, "a row with no position stays in the country shard");
  assert.equal(shardKey(["BRU", 50.9, 4.48, "BE"], boot.tiles), "BE_1_50_4");
  assert.equal(shardKey(["X", -18.1, -0.5, "ES"], { ES: 4 }), "ES_4_-5_-1");
  assert.equal(shardKey(["X", 50.9, 4.48, "BE"], undefined), "BE");
  const { core: merged, missing } = mergeCatalogue(boot, chunks);
  assert.equal(missing, 0);
  assert.deepEqual(Object.keys(merged.destinations), Object.keys(c.destinations));
  for (const [id, rec] of Object.entries(c.destinations)) {
    assert.deepEqual({ ...merged.destinations[id] }, { ...rec }, id);
  }
});

test("cell index answers a viewport with the countries that have a place in it", () => {
  const { boot } = splitCatalogue(core());
  const idx = indexBoot(boot);
  assert.deepEqual([...shardsInBounds(idx, [4, 50, 5, 51])].sort(), ["BE"]);
  assert.deepEqual([...shardsInBounds(idx, [3, 49, 6, 53])].sort(), ["BE", "NL"]);
  assert.deepEqual([...shardsInBounds(idx, [-10, 35, 30, 60])].sort(), ["BE", "IT", "NL"]);
  // Open sea, a malformed box, and a box across the antimeridian.
  assert.equal(shardsInBounds(idx, [-30, 40, -20, 45]).size, 0);
  assert.equal(shardsInBounds(idx, [1, 2, 3]).size, 0);
  assert.deepEqual([...shardsInBounds(idx, [170, -20, -170, -15])], ["FJ"]);
  // A place with no position is in no viewport, but still has a country.
  assert.equal(idx.keyOf.get("NOPOS"), "IT");
});

test("shardsNear takes a radius, not a bounding box", () => {
  const idx = indexBoot(splitCatalogue(core()).boot);
  assert.deepEqual([...shardsNear(idx, 50.9, 4.48, 100)].sort(), ["BE"]);
  assert.deepEqual([...shardsNear(idx, 50.9, 4.48, 300)].sort(), ["BE", "NL"]);
});

test("a store fetches each country once, and only when asked", async () => {
  const { store, calls } = storeFor(core());
  assert.equal(store.snapshot(), null);
  await store.boot();
  assert.deepEqual(Object.keys(store.snapshot().destinations), []);

  await Promise.all([store.ensureViewport([4, 50, 5, 51]), store.ensureIds(["gem:be-dinant"])]);
  assert.deepEqual(calls, [["BE", "h-BE"]]);
  assert.deepEqual(Object.keys(store.snapshot().destinations), ["BRU", "gem:be-dinant"]);
  assert.equal(store.isComplete(), false);

  await store.ensureViewport([3, 49, 6, 53]);
  assert.deepEqual(calls.map(([k]) => k), ["BE", "NL"]);
  await store.ensure(["XX"]);   // unknown key: ignored
  assert.equal(calls.length, 2);

  await store.ensureAll();
  assert.equal(store.isComplete(), true);
  assert.deepEqual(store.stats().requested, ["BE", "NL", "IT", "FJ"]);
});

test("the complete snapshot is the full merge, in the master's order", async () => {
  const { store, boot, chunks } = storeFor(core());
  await store.ensureAll();
  const want = mergeCatalogue(boot, chunks).core;
  assert.deepEqual(store.snapshot(), want);
  assert.deepEqual(Object.keys(store.snapshot().destinations), Object.keys(core().destinations));
  // Stable identity until something new arrives.
  assert.equal(store.snapshot(), store.snapshot());
});

test("a failed country is forgotten, so the next ask retries it", async () => {
  const { store, calls } = storeFor(core(), { fail: new Set(["NL"]) });
  await assert.rejects(store.ensureViewport([4, 52, 5, 53]), /boom NL/);
  await store.ensureViewport([4, 52, 5, 53]);
  assert.deepEqual(calls.map(([k]) => k), ["NL", "NL"]);
  assert.ok(store.snapshot().destinations.AMS);
});

test("subscribers hear of arrivals, coalesced", async () => {
  const { boot, chunks } = splitCatalogue(core());
  for (const k of Object.keys(chunks)) boot.chunks[k] = k;
  const store = createCatalogue({
    loadBoot: () => boot,
    loadCountry: (k) => Promise.resolve(chunks[k]),
    coalesceMs: 5,
  });
  let heard = 0;
  store.subscribe(() => { heard += 1; });
  await store.ensureAll();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(heard, 1);
});

// The real catalogue, when the wire has been built (npm run data).
const bootPath = join(pub, "boot.json");
const real = existsSync(bootPath) ? JSON.parse(readFileSync(bootPath, "utf8")) : null;

// Roughly what a 700 x 600 px map shows at zoom 7, centred on a city.
const cityView = (lat, lon) => [lon - 2.4, lat - 1.4, lon + 2.4, lat + 1.4];

test("real boot index: first paint and a pan across Europe stay small", { skip: !real }, async () => {
  const calls = [];
  const store = createCatalogue({
    loadBoot: () => real,
    loadCountry: (k) => { calls.push(k); return Promise.resolve({}); },
    coalesceMs: 0,
  });
  const bytes = (keys) => keys.reduce((a, k) => a + statSync(join(pub, "dest", `${k}.json`)).size, 0);
  const all = bytes(Object.keys(real.chunks));
  // First paint around Charleroi, the data's default home, as useAppData
  // asks for it: the boot index plus the shards within 300 km.
  const home = real.meta?.origins?.CRL;
  await store.ensureNear(home.lat, home.lon, 300);
  const first = statSync(bootPath).size + bytes(calls);
  assert.ok(first < 2e6, `first paint needs ${first} bytes`);

  let seen = calls.length;
  for (const [name, lat, lon] of [
    ["Amsterdam", 52.37, 4.9], ["Paris", 48.86, 2.35], ["Lyon", 45.76, 4.84],
    ["Milan", 45.46, 9.19], ["Rome", 41.9, 12.5], ["Naples", 40.85, 14.27],
  ]) {
    await store.ensureViewport(cityView(lat, lon));
    const step = bytes(calls.slice(seen));
    seen = calls.length;
    assert.ok(step < 1e6, `${name} fetched ${step} bytes`);
  }
  assert.ok(bytes(calls) < all / 2, `pan fetched ${bytes(calls)} of ${all} bytes`);
  assert.equal(new Set(calls).size, calls.length, "a shard was fetched twice");
  // Going back costs nothing.
  await store.ensureViewport(cityView(52.37, 4.9));
  assert.equal(calls.length, seen);
});

test("real boot index: the index is small enough to boot on", { skip: !real }, () => {
  const bytes = Buffer.byteLength(JSON.stringify(real));
  const perDest = bytes / real.d.length;
  // T059's done condition: under 2 MB, and still under it at 25,000.
  assert.ok(bytes < 2e6, `boot.json is ${bytes} bytes`);
  assert.ok(perDest * 25000 < 2e6, `extrapolates to ${Math.round(perDest * 25000)} bytes`);
});
