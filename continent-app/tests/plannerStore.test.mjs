// T388 (row T377-e): the trip wizard's draft keeps every answer that decides
// which step a stored step number means and what is on it, so a reload lands
// on the same named step with the same answers. Run: npm test (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";

// plannerStore reads localStorage once, at import, so the stand-in has to be
// in place first and the module is imported afterwards.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

const KEY = "carta.plannerDraft.v1";
const future = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
};

// A draft as the wizard writes it mid-trip: beds booked, two cities on the
// Stays step, a leg answered, the arrival city and the pace set.
const draft = {
  version: 2,
  savedAt: Date.now(),
  travelDates: { isFlexible: false, startDate: future(20), endDate: future(27), durationNights: 7, flexibleMonths: [] },
  travelers: { adults: 3, children: 1, lifestyle: "standard" },
  wizard: {
    step: 4,
    countries: ["Albania"],
    buildMode: "custom",
    tripPickId: null,
    dateMode: "exact",
    flexMonth: "",
    flexNights: 7,
    quiz: {},
    booked: { travel: true, stays: true },
    nights: { berat: 3, gjirokaster: 4 },
    order: ["berat", "gjirokaster"],
    travelValues: { leg0: { mode: "bus", service: "", eur: "12" } },
    arrivalId: "tirana",
    pace: "relaxed",
    stayStyle: "single",
  },
};
mem.set(KEY, JSON.stringify(draft));

const { plannerStore } = await import("../src/planner/plannerStore.js");

test("a fresh draft restores the answers that decide the step list", () => {
  const w = plannerStore.getState().wizard;
  assert.equal(w.step, 4);
  assert.deepEqual(w.booked, { travel: true, stays: true });
  assert.deepEqual(w.nights, { berat: 3, gjirokaster: 4 });
  assert.deepEqual(w.order, ["berat", "gjirokaster"]);
  assert.equal(w.travelValues.leg0.mode, "bus");
  assert.equal(w.arrivalId, "tirana");
  assert.equal(w.pace, "relaxed");
  assert.equal(w.stayStyle, "single");
});

test("the party survives with the draft", () => {
  const tr = plannerStore.getState().travelers;
  assert.equal(tr.adults, 3);
  assert.equal(tr.children, 1);
});

test("setWizard writes the new fields through to storage", () => {
  plannerStore.setWizard({ pace: "packed", order: ["gjirokaster", "berat"] });
  const stored = JSON.parse(mem.get(KEY));
  assert.equal(stored.wizard.pace, "packed");
  assert.deepEqual(stored.wizard.order, ["gjirokaster", "berat"]);
  // Fields the patch did not name are kept, not reset to the defaults.
  assert.deepEqual(stored.wizard.booked, { travel: true, stays: true });
});

test("reset returns the defaults for every restored field", () => {
  plannerStore.reset();
  const w = plannerStore.getState().wizard;
  assert.equal(w.step, 1);
  assert.deepEqual(w.booked, { travel: false, stays: false });
  assert.deepEqual(w.nights, {});
  assert.deepEqual(w.order, []);
  assert.deepEqual(w.travelValues, {});
  assert.equal(w.arrivalId, "");
  assert.equal(w.pace, "balanced");
  assert.equal(w.stayStyle, "multi");
});
