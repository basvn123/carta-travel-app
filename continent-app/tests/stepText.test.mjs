// The plan flow's steps as words (T893). Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { GUIDE_GROUPS, groupsOf, stepAnswer } from "../src/planner/flow/stepText.js";
import { GUIDE } from "../src/planner/flow/flowGraph.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const t = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);

test("every help-me-choose question sits in one group, in the flow's order", () => {
  const grouped = GUIDE_GROUPS.flatMap(([, ids]) => ids);
  assert.deepEqual(grouped, GUIDE.filter((id) => id !== "g:trips"));
  assert.deepEqual(groupsOf(["g:persona", "g:budget"]).map((g) => g.key), ["like", "practical"]);
});

test("answers read as short lines", () => {
  const s = normalizeSettings({ guide: { personas: ["towns", "coast"], likes: ["beach"], weather: "warm", shapes: ["one"] } });
  assert.equal(stepAnswer(t, "g:persona", s), "pf.persona.towns, pf.persona.coast");
  assert.equal(stepAnswer(t, "g:likes", s), "pf.like.beach");
  assert.equal(stepAnswer(t, "g:weather", s), "pf.o.warm");
  assert.equal(stepAnswer(t, "g:shape", s), "pf.o.shapeOne");
  assert.equal(stepAnswer(t, "g:budget", s), "");
  assert.equal(stepAnswer(t, "when", s, { when: { start: "1 Jun", end: "8 Jun" } }), 'plan.dateRange{"a":"1 Jun","b":"8 Jun"}');
  assert.equal(stepAnswer(t, "tell", s), "");
});
