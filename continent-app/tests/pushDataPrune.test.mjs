// T1042: the deploy's prune step (scripts/r2/push-data.mjs --prune) deletes
// only what the app build owned, never another writer's prefix.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { OTHER_WRITERS, OWNER_FILES, staleEntries, confirmDeletes } from "../scripts/r2/push-data.mjs";

test("the prune keeps data/flights/, the flight sweep's fares and route list (T1042)", () => {
  const listing = ["dest/", "flights/", "stays-live/", "old-layer/", "gone.json", "coverage.json", ""].join("\n");
  assert.deepEqual(staleEntries(listing), [{ name: "old-layer", dir: true }, { name: "gone.json", dir: false }]);
  assert.ok(OTHER_WRITERS.includes("flights"));
});

test("a prefix stays kept even when a test passes its own tier list (T1042)", () => {
  assert.deepEqual(staleEntries("flights/\ndest/\n", ["poi"]), [{ name: "dest", dir: true }]);
});

test("the prune keeps the owner's status.json and the .keep and _test markers (T1056)", () => {
  const listing = ["status.json", ".keep", "_test", "dest/", "stray.json", ""].join("\n");
  assert.deepEqual(staleEntries(listing), [{ name: "stray.json", dir: false }]);
  assert.deepEqual([...OWNER_FILES].sort(), [".keep", "_test", "status.json"]);
});

test("a live prune lists the names first and deletes only on a typed delete or --yes (T1056)", async () => {
  const lines = [];
  const log = (l) => lines.push(l);
  const names = ["r2:carta/data/old-layer/", "r2:carta/data/gone.json"];
  assert.equal(await confirmDeletes(names, { dry: false, yes: false, tty: true, ask: async () => "delete", log }), true);
  assert.ok(lines.some((l) => l.includes("old-layer")) && lines.some((l) => l.includes("gone.json")));
  assert.equal(await confirmDeletes(names, { dry: false, yes: false, tty: true, ask: async () => "y", log }), false);
  assert.equal(await confirmDeletes(names, { dry: false, yes: false, tty: false, log }), false);
  assert.equal(await confirmDeletes(names, { dry: false, yes: true, tty: false, log }), true);
});

test("a dry run and an empty list need no answer (T1056)", async () => {
  const log = () => {};
  const never = async () => { throw new Error("asked"); };
  assert.equal(await confirmDeletes(["r2:carta/data/x"], { dry: true, yes: false, tty: true, ask: never, log }), true);
  assert.equal(await confirmDeletes([], { dry: false, yes: false, tty: true, ask: never, log }), true);
});
