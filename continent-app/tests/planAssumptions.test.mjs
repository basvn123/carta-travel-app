// G12 plan rethink B3 (decision §1.4, §3.3): the shared assumption bar's
// chips. Solid when the traveller (or their style, Explore or the source
// page) gave the answer, dashed when Viantra assumed it.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, markAnswered } from "../src/planner/flow/tripSettings.js";
import { assumptionChips, assumed, pricedFromName, ASSUMPTION_IDS } from "../src/planner/flow/assumptions.js";
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

test("with no From the chip names the airport the finder prices from (G12)", () => {
  const data = { meta: { selected_origin: "BRU", origins: { BRU: { city: "Brussels" } } } };
  assert.equal(pricedFromName(data), "Brussels");
  assert.equal(pricedFromName({ meta: { selected_origin: "XYZ" } }), "XYZ");
  assert.equal(pricedFromName(null), "");
  const chips = assumptionChips(normalizeSettings({}), { t, fromName: pricedFromName(data) });
  assert.equal(chips[1].label, "Brussels");
  assert.equal(chips[1].assumed, true);
});

test("months and any time read as the name and the nights once, never a range (G12)", () => {
  const months = markAnswered(normalizeSettings({ when: { mode: "months", months: [5], nights: 7 } }), "when");
  const m = assumptionChips(months, { t, when: { start: "May", end: "7 nights" } })[2];
  assert.equal(m.label, `May, ${t("tf.keep.nights", { n: 7 })}`);
  const any = normalizeSettings({ when: { mode: "any", nights: 5 } });
  const a = assumptionChips(any, { t, when: { start: "Any time", end: "5 nights" } })[2];
  assert.equal(a.label, `Any time, ${t("tf.keep.nights", { n: 5 })}`);
});

test("exact dates read as a range and their nights", () => {
  const s = markAnswered(normalizeSettings({ when: { mode: "exact", start: "2027-05-03", end: "2027-05-10" } }), "when");
  const c = assumptionChips(s, { t, when: { start: "3 May", end: "10 May" } })[2];
  assert.equal(c.assumed, false);
  assert.match(c.label, /3 May/);
  assert.match(c.label, /7/);
});
