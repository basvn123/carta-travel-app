// D20 (T1200): heat and fire months and the one best-months rule (src/lib/heatRisk.js).
import test from "node:test";
import assert from "node:assert/strict";
import { riskMonths, guardsHeat, bestMonthsFor } from "../src/lib/heatRisk.js";

const SEVILLE = { best: [3, 4, 5, 10], heat: [7, 8], fire: [5, 6, 7, 8, 9] };

test("D20: risk months read the wire lists, empty when absent", () => {
  assert.deepEqual(riskMonths(SEVILLE).any, [5, 6, 7, 8, 9]);
  assert.deepEqual(riskMonths({}), { heat: [], fire: [], any: [] });
  assert.deepEqual(riskMonths({ heat: [0, 13, "x", 7] }).heat, [7]);
});

test("D20: families and heat avoiders are guarded", () => {
  assert.equal(guardsHeat({ children: 2 }), true);
  assert.equal(guardsHeat({ babies: 1 }), true);
  assert.equal(guardsHeat({ avoid: ["crowds", "heat"] }), true);
  assert.equal(guardsHeat({ children: 0, avoid: [] }), false);
  assert.equal(guardsHeat(), false);
});

test("D20: guarded best months drop heat and fire months, others unchanged", () => {
  assert.deepEqual(bestMonthsFor(SEVILLE, false), { best: [3, 4, 5, 10], dropped: [] });
  assert.deepEqual(bestMonthsFor(SEVILLE, true), { best: [3, 4, 10], dropped: [5] });
});

test("D20: never empties the best months", () => {
  const all = { best: [7, 8], heat: [7, 8], fire: [] };
  assert.deepEqual(bestMonthsFor(all, true), { best: [7, 8], dropped: [] });
});
