// T658: the trip against the traveller's budget. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { budgetCheck } from "../src/planner/flow/budget.js";

const priced = { perPerson: 900, parts: { beds: 840, days: 560 } };

test("a day budget compares bed and food a person a day", () => {
  // (840 + 560) / 2 people / 7 nights = 100 a person a day
  assert.deepEqual(budgetCheck(priced, { kind: "day", eur: 80 }, { party: 2, nights: 7 }), { over: true, gap: 20 });
  assert.deepEqual(budgetCheck(priced, { kind: "day", eur: 130 }, { party: 2, nights: 7 }), { over: false, gap: 30 });
});

test("a trip budget compares the figure a person", () => {
  assert.deepEqual(budgetCheck(priced, { kind: "total", eur: 1200 }, { party: 2, nights: 7 }), { over: false, gap: 300 });
});

test("no budget, no figure", () => {
  assert.equal(budgetCheck(priced, { kind: "day", eur: 0 }, { party: 2, nights: 7 }), null);
  assert.equal(budgetCheck(null, { kind: "day", eur: 80 }), null);
  assert.equal(budgetCheck(priced, { kind: "day", eur: 80 }, { party: 2, nights: 0 }), null);
});
