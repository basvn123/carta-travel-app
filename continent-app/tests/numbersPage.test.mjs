// The Where the numbers come from page (T318). Run: npm test (from continent-app/).
// Pins that the page is built from the files, holds every credit and every
// layer, carries no script, and obeys the no em dash and no middot rule.
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNumbersPage, readFacts } from "../scripts/explainer/numbers.mjs";
import { isReservedSegment } from "../src/lib/urlScheme.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("about is a reserved top-level word, so no country can take it", () => {
  assert.equal(isReservedSegment("about"), true);
});

test("the page carries every credit, every layer, the count and no script", async () => {
  const f = await readFacts(root);
  const html = await buildNumbersPage(root);
  for (const a of f.credits) assert.ok(html.includes(a.source.replace(/&/g, "&amp;")), `credit ${a.source}`);
  for (const l of f.layers) assert.ok(html.includes(l.label), l.label);
  assert.ok(html.includes(f.destinations.toLocaleString("en-GB")));
  assert.ok(html.includes(`The ${f.credits.length} sources Carta credits`));
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes("{n}") && !html.includes("{pct}"), "no unfilled template slot");
});

test("no em dash, no middot, no unfilled slot in the output", async () => {
  const html = await buildNumbersPage(root);
  assert.ok(!html.includes(String.fromCharCode(0x2014)));
  assert.ok(!html.includes(String.fromCharCode(0xb7)));
  assert.ok(!html.includes(String.fromCharCode(0x2022)));
});

test("the layer statuses add up to the regions", async () => {
  const f = await readFacts(root);
  for (const l of f.layers) assert.equal(l.ok + l.thin + l.empty + l.na, f.regions, l.key);
});
