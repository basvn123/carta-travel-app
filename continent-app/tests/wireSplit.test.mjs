// The wire split of T054: boot index plus per-country records, and which
// host each data path is fetched from. Run: npm test  (from continent-app/)
//
// The fixtures pin the rules. The last test runs the real published split
// when public/boot.json exists, because the promise worth protecting is that
// the browser's merge rebuilds public/app_data.json exactly.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  splitCatalogue, mergeCatalogue, decodeBootIndex, chunkList, FLAG, NO_COUNTRY, BOOT_COLS,
} from "../src/lib/bootIndex.js";
import { dataUrl, isDataPath, normaliseBase, R2_TIER, DATA_BASE } from "../src/lib/dataHost.js";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");

const core = () => ({
  meta: { schema_version: 17, defaults: { trip_length_days: 7 } },
  destinations: {
    BRU: {
      id: "BRU", tier: "airport", city: "Brussels", iso2: "BE", lat: 50.9014, lon: 4.4844,
      categories: ["city", "unesco"], rating: { tier: 1, hidden_gem: false },
    },
    "gem:be-dinant": {
      id: "gem:be-dinant", tier: "gem", iso2: "BE", lat: 50.26, lon: 4.91,
      rating: { tier: 2, hidden_gem: true },
    },
    ODD: { id: "ODD", tier: "gem", iso2: "Belgium", lat: null, lon: "4.1", rating: {} },
    "gem:fr-x": { id: "not-the-key", tier: "gem", iso2: "FR", lat: 45, lon: 3 },
  },
});

const roundTrip = (c) => {
  const { boot, chunks } = splitCatalogue(structuredClone(c));
  const wire = JSON.parse(JSON.stringify(boot));
  const files = JSON.parse(JSON.stringify(chunks));
  return { boot: wire, chunks: files, ...mergeCatalogue(wire, files) };
};

test("split then merge rebuilds every record, field for field, in order", () => {
  const c = core();
  const { core: merged, missing } = roundTrip(c);
  assert.equal(missing, 0);
  assert.deepEqual(Object.keys(merged.destinations), Object.keys(c.destinations));
  assert.deepEqual(merged, c);
});

test("boot rows carry only id, lat, lon, country, flags and rating band", () => {
  const { boot } = roundTrip(core());
  assert.deepEqual(boot.cols, [...BOOT_COLS]);
  assert.deepEqual(boot.d[0], ["BRU", 50.9014, 4.4844, "BE", FLAG.AIRPORT | FLAG.UNESCO, 1]);
  assert.deepEqual(boot.d[1], ["gem:be-dinant", 50.26, 4.91, "BE", FLAG.HIDDEN_GEM, 2]);
  const rows = decodeBootIndex(boot);
  assert.equal(rows[0].airport, true);
  assert.equal(rows[1].hiddenGem, true);
  assert.equal(rows[1].band, 2);
});

test("irregular fields stay in the record and still round-trip", () => {
  const { boot, chunks } = roundTrip(core());
  const odd = boot.d[2];
  assert.deepEqual(odd, ["ODD", null, null, null, 0, 0]);
  assert.equal(chunks[NO_COUNTRY].ODD.iso2, "Belgium");
  assert.equal(chunks[NO_COUNTRY].ODD.lon, "4.1");
  // An id field that disagrees with its key is kept, not overwritten.
  assert.equal(chunks.FR["gem:fr-x"].id, "not-the-key");
});

test("records move out of the country files, not duplicated into the index", () => {
  const { chunks } = roundTrip(core());
  const bru = chunks.BE.BRU;
  for (const k of ["id", "lat", "lon", "iso2"]) assert.equal(k in bru, false, k);
  assert.equal(bru.city, "Brussels");
});

test("a missing record is skipped and counted, not thrown", () => {
  const { boot, chunks } = roundTrip(core());
  delete chunks.BE.BRU;
  const { core: merged, missing } = mergeCatalogue(boot, chunks);
  assert.equal(missing, 1);
  assert.equal("BRU" in merged.destinations, false);
  assert.throws(() => mergeCatalogue({ v: 99, d: [] }, {}));
});

test("dataUrl sends shard paths to the data host and nothing else", () => {
  const base = "https://data.carta-europetravel.com/data";
  assert.equal(dataUrl("/poi/BRU.json", base), `${base}/poi/BRU.json`);
  assert.equal(dataUrl("/dest/BE.json?v=abc", base), `${base}/dest/BE.json?v=abc`);
  assert.equal(dataUrl("/search_index.json", base), `${base}/search_index.json`);
  assert.equal(dataUrl("/boot.json", base), "/boot.json");
  assert.equal(dataUrl("/country_insights.json", base), "/country_insights.json");
  assert.equal(dataUrl("/fonts/x.woff2", base), "/fonts/x.woff2");
  assert.equal(dataUrl("/poisoned/x.json", base), "/poisoned/x.json");
  assert.equal(dataUrl("/poi/BRU.json", ""), "/poi/BRU.json");
  // Under node there is no import.meta.env, so the app's own base is unset.
  assert.equal(DATA_BASE, "");
  assert.equal(isDataPath("/trails/AT.json"), true);
  assert.equal(R2_TIER.includes("boot.json"), false);
});

test("normaliseBase accepts https and loopback http only", () => {
  assert.equal(normaliseBase("https://data.carta-europetravel.com/data/"), "https://data.carta-europetravel.com/data");
  assert.equal(normaliseBase("http://127.0.0.1:4391/data"), "http://127.0.0.1:4391/data");
  assert.equal(normaliseBase("http://data.carta-europetravel.com/data"), "");
  assert.equal(normaliseBase("https://x.example/data?y=1"), "");
  assert.equal(normaliseBase("not a url"), "");
  assert.equal(normaliseBase(undefined), "");
});

test("the published split rebuilds public/app_data.json exactly", { skip: !existsSync(join(pub, "boot.json")) }, () => {
  const boot = JSON.parse(readFileSync(join(pub, "boot.json"), "utf8"));
  const chunks = {};
  for (const [cc] of chunkList(boot)) chunks[cc] = JSON.parse(readFileSync(join(pub, "dest", `${cc}.json`), "utf8"));
  const { core: merged, missing } = mergeCatalogue(boot, chunks);
  const want = JSON.parse(readFileSync(join(pub, "app_data.json"), "utf8"));
  assert.equal(missing, 0);
  assert.deepEqual(Object.keys(merged.destinations), Object.keys(want.destinations));
  assert.deepEqual(merged, want);
});
