// G12 plan rethink B5 (lane L7, decision §12, the question rule): Plan your
// days shows mornings and pace from the style as chips, asks detail, the goal
// and food with the goal and food prefilled; "Check my assumptions" walks the
// dashed chips, biggest price effect first.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, markAnswered } from "../src/planner/flow/tripSettings.js";
import { daysPrefill, foodOfLifestyle } from "../src/planner/flow/daysPrefill.js";
import { checkWalk, CHECK_ORDER } from "../src/planner/flow/assumptions.js";

test("food is a first pick from the style's table, never fine dining", () => {
  assert.equal(foodOfLifestyle({ self_catered_days_per_week: 5, fastfood_per_week: 4, dinners_per_week: 1 }), "cook");
  assert.equal(foodOfLifestyle({ self_catered_days_per_week: 0, fastfood_per_week: 4, dinners_per_week: 1 }), "street");
  assert.equal(foodOfLifestyle({ self_catered_days_per_week: 0, fastfood_per_week: 0, dinners_per_week: 7 }), "local");
  assert.equal(foodOfLifestyle(null), "");
});

test("pace and mornings from the style show as the style's; goal from the likes", () => {
  let s = normalizeSettings({ rhythm: { pace: "slow", mornings: "early" }, guide: { likes: ["hiking", "food"] } });
  s = markAnswered(s, "r:pace", "style");
  s = markAnswered(s, "r:mornings", "style");
  const p = daysPrefill(s, { lifestyle: { self_catered_days_per_week: 5 } });
  assert.equal(p.pace, "slow");
  assert.equal(p.mornings, "early");
  assert.equal(p.from.pace, "style");
  assert.equal(p.from.mornings, "style");
  assert.deepEqual(p.goals, ["nature", "food"]);
  assert.equal(p.from.goals, "likes");
  assert.equal(p.food, "cook");
  assert.equal(p.from.food, "style");
  assert.equal(p.detail, "parts");
});

test("the traveller's own answers win over the style", () => {
  let s = normalizeSettings({ rhythm: { pace: "packed", food: "fine", goals: ["museums"] } });
  s = markAnswered(s, "r:pace");
  s = markAnswered(s, "r:food");
  const p = daysPrefill(s, { lifestyle: { self_catered_days_per_week: 5 } });
  assert.equal(p.from.pace, "trip");
  assert.equal(p.food, "fine");
  assert.equal(p.from.food, "trip");
  assert.deepEqual(p.goals, ["museums"]);
});

test("no style and no answers: honest defaults, nothing claimed as the style's", () => {
  const p = daysPrefill(normalizeSettings({}), null);
  assert.equal(p.from.pace, "");
  assert.equal(p.from.food, "");
  assert.deepEqual(p.goals, ["sights", "food"]);
});

test("Check my assumptions walks only the dashed chips, party first", () => {
  let s = normalizeSettings({});
  assert.deepEqual(checkWalk(s), [...CHECK_ORDER]);
  assert.deepEqual(CHECK_ORDER, ["who", "when", "from"]);
  s = markAnswered(s, "who");
  assert.deepEqual(checkWalk(s), ["when", "from"]);
  s = markAnswered(markAnswered(s, "when"), "from");
  assert.deepEqual(checkWalk(s), []);
});
