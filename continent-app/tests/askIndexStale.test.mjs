// T1206 (T1141-d, ROADMAP E2 item 4): the Ask index staleness check fails
// when the index was read from an older catalogue than the one on the wire,
// and build-ask-bm25.mjs refuses to build over such an index. Fixtures only.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { askIndexStaleness, checkAskIndex } from "../scripts/check-ask-index.mjs";

const app = resolve(fileURLToPath(new URL("..", import.meta.url)));
const META = { generated_at: "2026-06-07T13:21:17.357184+00:00", schema_version: 20 };

test("an index read from the current catalogue is fresh, an older one is stale", () => {
  assert.equal(askIndexStaleness({ built: "2026-06-08T00:00:00Z", catalogue: { generated_at: META.generated_at } }, META).ok, true);
  const old = askIndexStaleness({ built: "2026-06-08T00:00:00Z", catalogue: { generated_at: "2026-05-01T10:00:00+00:00" } }, META);
  assert.equal(old.ok, false);
  assert.match(old.reason, /catalogue of 2026-05-01.*now 2026-06-07/);
  // Built after the catalogue changed, but from the old one: still stale.
  assert.equal(askIndexStaleness({ built: "2026-07-01T00:00:00Z", catalogue: { generated_at: "2026-05-01T10:00:00Z" } }, META).ok, false);
});

test("a manifest from before the stamp falls back on its build time", () => {
  assert.equal(askIndexStaleness({ built: "2026-06-01T00:00:00Z" }, META).ok, false);
  assert.equal(askIndexStaleness({ built: "2026-06-09T00:00:00Z" }, META).ok, true);
  assert.equal(askIndexStaleness({}, META).ok, false, "no stamp at all cannot be shown fresh");
  assert.equal(askIndexStaleness({ catalogue: { generated_at: "soon" } }, META).ok, false);
});

test("no index, or no catalogue stamp, is not a failure", () => {
  assert.equal(askIndexStaleness(null, META).ok, true);
  assert.equal(askIndexStaleness({ built: "2020-01-01T00:00:00Z" }, {}).ok, true);
});

function fixture(catalogueAt) {
  const dir = mkdtempSync(join(tmpdir(), "carta-ask-stale-"));
  const ask = join(dir, "ask");
  mkdirSync(ask);
  writeFileSync(join(dir, "app_data.json"), JSON.stringify({ meta: META, destinations: {} }));
  writeFileSync(join(ask, "manifest.json"), JSON.stringify({
    version: 1, built: "2026-06-08T00:00:00Z", catalogue: { file: "app_data.json", generated_at: catalogueAt },
    sources: { dest: { n: 1, passages: "passages-dest.json" } },
  }));
  writeFileSync(join(ask, "passages-dest.json"), JSON.stringify({ source: "dest", rows: [["dest:LIS", "LIS", "Lisbon, Portugal.", { cc: "PT", tags: [], name: "Lisbon" }]] }));
  return { dir, ask, appData: join(dir, "app_data.json") };
}

test("the CLI and build-ask-bm25 stop on a stale index and build on a fresh one", () => {
  const stale = fixture("2026-05-01T10:00:00Z");
  const fresh = fixture(META.generated_at);
  try {
    assert.equal(checkAskIndex({ dir: stale.ask, appData: stale.appData }).ok, false);
    const cli = spawnSync(process.execPath, ["scripts/check-ask-index.mjs", "--dir", stale.ask, "--app-data", stale.appData], { cwd: app, encoding: "utf8" });
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /STALE/);
    const b1 = spawnSync(process.execPath, ["scripts/build-ask-bm25.mjs", "--dir", stale.ask, "--app-data", stale.appData], { cwd: app, encoding: "utf8" });
    assert.equal(b1.status, 1);
    assert.match(b1.stderr, /stale/);
    assert.equal(existsSync(join(stale.ask, "bm25.json")), false, "nothing built over a stale index");
    const b2 = spawnSync(process.execPath, ["scripts/build-ask-bm25.mjs", "--dir", fresh.ask, "--app-data", fresh.appData], { cwd: app, encoding: "utf8" });
    assert.equal(b2.status, 0, b2.stderr);
    assert.equal(existsSync(join(fresh.ask, "bm25.json")), true);
  } finally {
    rmSync(stale.dir, { recursive: true, force: true });
    rmSync(fresh.dir, { recursive: true, force: true });
  }
});
