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

test("R7: below 820 px List and Map are tabs; the pill only from 820 to 1023 px; the side map from 1024 px", () => {
  assert.match(src, /const PHONE = '\(max-width: 819\.98px\)'/);
  assert.match(src, /\{phone && trips\.length > 0 && \(\s*<Segmented[^>]*className="tff-viewtabs"/);
  assert.match(src, /\{!wide && !phone && trips\.length > 0 && \(\s*<div className="tff-fab-slot">/, "no floating pill on a phone");
  assert.match(src, /const WIDE = '\(min-width: 1024px\)'/, "desktop keeps its layout");
});
