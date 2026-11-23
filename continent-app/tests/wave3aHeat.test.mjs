// Logic wave 3a, the "Avoid heat" setting (REQ-data-3; ROADMAP D20). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { styleAvoids, guardsHeat, bestMonthsFor, riskMonths } from "../src/lib/heatRisk.js";
import { normalizeStyles, styleFromTemplate } from "../src/lib/travelStyles.js";

// Seville as the wire carries it after the next box run.
const SEVILLE = { best: [3, 4, 5, 10], heat: [7, 8], fire: [5, 6, 7, 8, 9] };

test("REQ-data-3: a style that avoids heat guards the best months of a destination page", () => {
  // The couple template avoids crowds only; the family one avoids transfers and heat.
  const couple = styleFromTemplate("couple");
  const family = styleFromTemplate("family");
  const store = (s) => normalizeStyles({ list: [s], active: s.id });
  assert.deepEqual(styleAvoids(store(couple)), ["crowds"]);
  assert.deepEqual(styleAvoids(store(family)), ["transfers", "heat"]);
  // The settings value passes the style's answers; the page's guard reads them.
  assert.equal(guardsHeat({ children: 0, babies: 0, avoid: styleAvoids(store(couple)) }), false);
  assert.equal(guardsHeat({ children: 0, babies: 0, avoid: styleAvoids(store(family)) }), true);
  assert.deepEqual(bestMonthsFor(SEVILLE, true).best, [3, 4, 10]);
});

test("REQ-data-3: no style, no avoid; and absent heat months are unknown, never safe", () => {
  assert.deepEqual(styleAvoids(undefined), []);
  assert.deepEqual(styleAvoids({ list: [], active: "" }), []);
  // A destination the pipeline has no heat months for: nothing dropped, nothing claimed.
  const unknown = { best: [6, 7, 8] };
  assert.deepEqual(riskMonths(unknown), { heat: [], fire: [], any: [] });
  assert.deepEqual(bestMonthsFor(unknown, true), { best: [6, 7, 8], dropped: [] });
});
