// The guided trip wizard's step list (T500, owner T490-c: Booked and Who are
// one step) and the pure rules around it.
// Run: npm test  (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { wizardSteps, restoreStep, dayCostText, nightsText, cheapestDay } from "../src/planner/wizard/wizardSteps.js";

test("the plain path is six steps", () => {
  assert.deepEqual(wizardSteps({}, "ready"), ["Booked", "When", "Where", "Trips", "Getting", "Finish"]);
  assert.deepEqual(wizardSteps({}, "custom"), ["Booked", "When", "Where", "Stay", "Getting", "Finish"]);
});

test("travel booked adds From after the first step", () => {
  assert.deepEqual(wizardSteps({ travel: true }, "ready"), ["Booked", "From", "When", "Where", "Trips", "Getting", "Finish"]);
});

test("beds booked puts Your stays in place of Where; both booked drops Getting there", () => {
  assert.deepEqual(wizardSteps({ stays: true }, "ready"), ["Booked", "When", "Stays", "Getting", "Finish"]);
  assert.deepEqual(wizardSteps({ travel: true, stays: true }), ["Booked", "From", "When", "Stays", "Finish"]);
});

test("a draft with a step name reopens on that step", () => {
  assert.equal(restoreStep({ step: 9, stepName: "Where", booked: {}, buildMode: "ready" }), 3);
  assert.equal(restoreStep({ step: 2, stepName: "Gone", booked: {} }), 2);
});

test("an older draft folds Who into the first step and moves the rest up one", () => {
  // Old plain list: Booked 1, Who 2, When 3, Where 4, Trips 5, Getting 6, Finish 7.
  assert.equal(restoreStep({ step: 1, booked: {} }), 1);
  assert.equal(restoreStep({ step: 2, booked: {} }), 1);
  assert.equal(restoreStep({ step: 4, booked: {} }), 3);
  assert.equal(restoreStep({ step: 7, booked: {} }), 6);
  // Old travel list: Booked 1, From 2, Who 3, When 4.
  assert.equal(restoreStep({ step: 2, booked: { travel: true } }), 2);
  assert.equal(restoreStep({ step: 3, booked: { travel: true } }), 1);
  assert.equal(restoreStep({ step: 4, booked: { travel: true } }), 3);
  assert.equal(restoreStep({ step: 40, booked: {} }), 6);
});

const t = (key, vars = {}) => {
  const table = {
    "money.est": "est.",
    "money.estSpoken": "about {price}",
    "plan.nightsOne": "{n} night",
    "plan.nightsMany": "{n} nights",
  };
  return (table[key] || key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
};

test("a day cost is one visible phrase and one spoken phrase", () => {
  const est = dayCostText({ min: 86.6, national: true }, t, "en");
  // Price plan rule 2 (owner 2026-10-24): an estimate reads like any figure,
  // on screen and to a screen reader.
  assert.equal(est.visible, "€87");
  assert.equal(est.spoken, "€87");
  const measured = dayCostText({ min: 41, national: false }, t, "en");
  assert.equal(measured.visible, "€41");
  assert.equal(measured.spoken, "€41");
  assert.equal(dayCostText(null, t), null);
});

test("nights are one key with the number inside", () => {
  assert.equal(nightsText(t, 1), "1 night");
  assert.equal(nightsText(t, 7), "7 nights");
});

test("a trip card's day is the cheapest member's, never an average", () => {
  assert.deepEqual(
    cheapestDay([
      { dayEur: 90, stayLevel: "city", foodLevel: "city" },
      null,
      { dayEur: 60, stayLevel: "national", foodLevel: "city" },
      { dayEur: null },
    ]),
    { min: 60, national: true },
  );
  assert.equal(cheapestDay([]), null);
});
