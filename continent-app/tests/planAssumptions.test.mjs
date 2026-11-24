// G12 plan rethink B3 (decision §1.4, §3.3): the shared assumption bar's
// chips. Solid when the traveller (or their style, Explore or the source
// page) gave the answer, dashed when Carta assumed it.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, markAnswered } from "../src/planner/flow/tripSettings.js";
import { assumptionChips, assumed, ASSUMPTION_IDS } from "../src/planner/flow/assumptions.js";
import { seedToSettings } from "../src/lib/plan/seed.js";
import { en } from "../src/i18n/en.js";

const t = (k, v = {}) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? "");

test("a fresh trip: every chip dashed, with honest default words", () => {
  const chips = assumptionChips(normalizeSettings({}), { t, fromName: "Brussels" });
  assert.deepEqual(chips.map((c) => c.id), [...ASSUMPTION_IDS]);
  assert.ok(chips.every((c) => c.assumed));
  assert.equal(chips[1].label, "Brussels");
  assert.match(chips[2].label, /7/);
});

test("given answers are solid, whoever gave them", () => {
  let s = normalizeSettings({});
  s = markAnswered(s, "who");
  s = markAnswered(s, "when", "explore");
  assert.equal(assumed(s, "who"), false);
  assert.equal(assumed(s, "when"), false);
  assert.equal(assumed(s, "from"), true);
  // A seed pin is the source page's answer: solid.
  const seeded = seedToSettings({ party: { kind: "solo", adults: 1 }, pins: ["party"] });
  assert.equal(assumptionChips(seeded, { t })[0].assumed, false);
});

test("exact dates read as a range and their nights", () => {
  const s = markAnswered(normalizeSettings({ when: { mode: "exact", start: "2027-05-03", end: "2027-05-10" } }), "when");
  const c = assumptionChips(s, { t, when: { start: "3 May", end: "10 May" } })[2];
  assert.equal(c.assumed, false);
  assert.match(c.label, /3 May/);
  assert.match(c.label, /7/);
});
