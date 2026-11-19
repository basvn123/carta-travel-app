// D9 (wave 1, 0.8): the lead highlight on lake and beach pages is a
// place-specific line, never the water class every page shares.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { chooseLead, lakeHighlights, LAKE_NEVER_LEAD } from "../src/lib/lakeStory.js";
import { beachHighlights } from "../src/lib/beachStory.js";

const h = (key) => ({ key, title: "", line: key });
const keys = (xs) => xs.map((x) => x.key);
// A key echoed back is a missing string to the story files, so the stub prefixes it.
const t = (key, vars) => (vars && vars.n != null ? `s:${key}:${vars.n}` : `s:${key}`);

test("chooseLead moves the best-ranked eligible highlight first, the rest keep order", () => {
  const out = chooseLead([h("waterExcellent"), h("forest"), h("glacier"), h("lido")], {
    neverLead: new Set(["waterExcellent"]),
    leadOrder: ["glacier", "lido", "forest"],
  });
  assert.deepEqual(keys(out), ["glacier", "waterExcellent", "forest", "lido"]);
});

test("chooseLead takes an unlisted code in wire order and never a never-lead one", () => {
  const out = chooseLead([h("swimYes"), h("oddCode"), h("otherCode")], { neverLead: LAKE_NEVER_LEAD, leadOrder: [] });
  assert.deepEqual(keys(out), ["oddCode", "swimYes", "otherCode"]);
});

test("chooseLead with nothing eligible returns the list unchanged", () => {
  const xs = [h("waterGood"), h("swimYes")];
  assert.equal(chooseLead(xs, { neverLead: LAKE_NEVER_LEAD, leadOrder: [] }), xs);
  assert.deepEqual(chooseLead([], {}), []);
});

test("a lake page leads with its glacier, not its water class", () => {
  const lake = { name: "Lac X", why: [{ k: "waterExcellent" }, { k: "glacier" }, { k: "designated", n: 1 }] };
  const out = lakeHighlights(lake, t);
  assert.equal(out[0].key, "glacier");
  assert.ok(out.some((x) => x.key === "waterExcellent"));
  // One bathing site reads in the singular.
  assert.equal(out.find((x) => x.key === "designated").line, "s:lake.whyDesignatedOne:1");
});

test("a beach page never leads with the water class or the Blue Flag", () => {
  const beach = { name: "Plage X", why: [{ k: "waterExcellent" }, { k: "blueFlag" }, { k: "sandColour" }, { k: "cave" }] };
  const out = beachHighlights(beach, t);
  assert.equal(out[0].key, "cave");
  assert.ok(out.length <= 4);
});
