// T1042: the deploy's prune step (scripts/r2/push-data.mjs --prune) deletes
// only what the app build owned, never another writer's prefix.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { OTHER_WRITERS, staleEntries } from "../scripts/r2/push-data.mjs";

test("the prune keeps data/flights/, the flight sweep's fares and route list (T1042)", () => {
  const listing = ["dest/", "flights/", "stays-live/", "old-layer/", "gone.json", "coverage.json", ""].join("\n");
  assert.deepEqual(staleEntries(listing), [{ name: "old-layer", dir: true }, { name: "gone.json", dir: false }]);
  assert.ok(OTHER_WRITERS.includes("flights"));
});

test("a prefix stays kept even when a test passes its own tier list (T1042)", () => {
  assert.deepEqual(staleEntries("flights/\ndest/\n", ["poi"]), [{ name: "dest", dir: true }]);
});
