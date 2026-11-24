// G12 plan rethink B7a: source checks on Trips for you, where a render test
// (vite SSR) cannot run on every machine (progress.md, orchestrator note
// 2026-11-24). Run: npm test (continent-app/). Pure: reads the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/planner/finder/TripsForYou.jsx", import.meta.url), "utf8");

test("Search more shows under the list with rows and without (B6 deferral)", () => {
  assert.equal(src.split("{searchMoreSection}").length - 1, 2, "both list branches draw it");
  assert.match(src, /const searchMoreSection = input && trips\.length > 0 &&/, "only with a list, never on its own");
  assert.doesNotMatch(src, /const searchMoreSection = [^\n]*rows\.length/, "not tied to the themed rows");
});
