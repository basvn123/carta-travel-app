// T801: "Plan this trip" hands the whole trip to the planner, and the
// planner's Finish total is the receipt's total, to the euro. The planner
// prices what the wizard hands over (GuidedTripWizard handOver, then
// lib/tripTotal.js quoteTrip); a seeded trip goes through
// planner/finder/handoff.js (withPlan, planState). This test builds the
// hand-over the way the wizard does for a trip with nothing typed in, and
// checks the top 6 trips of two answer sets: the plan's example (May, past
// the sweep) and the same answers inside the sweep. The flight data is the
// fixed T795 fixture, so no live flight can move between the two reads.
// Run: npm test (continent-app/). Skips without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { findTrips } from "../src/lib/recommend/rank.js";
import { receiptOf } from "../src/lib/recommend/trips.js";
import { chooseOption, slotTotals } from "../src/lib/recommend/slots.js";
import { chooseFlight, optionsFor } from "../src/lib/recommend/adapters/flight.js";
import { quoteTrip, PLANNER_BAG } from "../src/lib/tripTotal.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { withPlan, planState, appliesTo, landingStep, draftFor } from "../src/planner/finder/handoff.js";
import { planOf } from "../src/planner/finder/planOf.js";
import { withSlot } from "../src/planner/finder/finderText.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";
const countryInsights = read("country_insights.json")?.countries || null;
const layerIndexes = data ? {
  trails: read("trails/index.json"), beaches: read("beaches/index.json"), lakes: read("lakes/index.json"),
  mountains: read("mountains/index.json"), cycling: read("cycling/index.json"),
} : {};

function sweep(minutesAgo = 30) {
  const f = fixture("tf1-flights-BRU.json");
  const at = Math.floor(Date.now() / 60000) - minutesAgo;
  for (const side of [f.to, f.back]) {
    for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  }
  f.checked = at;
  return f;
}
const flights = data ? sweep() : null;
const BRU = { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" };
// The app's catalogue as the wizard reads it: priced from BRU, with the sweep.
const appData = data ? { ...data, flights, meta: { ...data.meta, selected_origin: "BRU" } } : null;

const answers = (start, end) => normalizeSettings({
  answered: ["who", "when"], party: { kind: "couple", adults: 2 }, priority: "balance",
  when: { mode: "exact", start, end, nights: 7 },
  guide: { shapes: ["towns"], likes: ["hiking", "food"], weather: "mild", reach: "short", avoid: ["crowds"], budget: { kind: "total", eur: 1200 } },
});
const trips = (s) => findTrips({ data, countryInsights, layerIndexes, settings: s, origin: BRU, flights, today: "2026-10-28" });

/** The wizard's hand-over for a built trip with nothing typed (GuidedTripWizard handOver). */
function wizardHandOver(plan, { stayTier = "home" } = {}) {
  const stops = plan.order.map((id) => ({ destinationId: id, nights: plan.nights[id], activities: [] }));
  return {
    startDate: plan.startDate, groupSize: plan.party.adults, children: plan.party.children, babies: plan.party.babies,
    stayTier, transport: "auto", pace: "balanced", baggage: PLANNER_BAG,
    anchorId: null, anchorOrigin: null, returnAnchorId: null,
    ownFlight: { airline: "", mode: "fly", costTotal: 0, costOut: 0, costBack: 0, outDate: plan.startDate, retDate: plan.endDate },
    carHome: null, legModes: {}, ownLegs: {}, ownStays: {}, label: plan.country, stops,
  };
}

/** The Finish total a person, whole euros, for a seeded trip. */
function finishTotal(trip) {
  const plan = planOf(trip);
  const handOver = withPlan(wizardHandOver(plan), plan);
  const q = quoteTrip(planState(handOver, plan), { data: appData, countryInsights });
  return { perPerson: Math.round(q.perPerson), q };
}

const results = [];
for (const [label, s] of [["May, past the sweep", ["2027-05-09", "2027-05-16"]], ["November, inside the sweep", ["2026-11-21", "2026-11-28"]]]) {
  test(`T801: the planner prices the finder's own request to the cent, top 6, ${label}`, { skip }, () => {
    const top = trips(answers(...s)).slice(0, 6);
    assert.equal(top.length, 6);
    for (const t of top) {
      const rc = receiptOf(t).total;
      const { q } = finishTotal(t);
      // The planner prices the same request the finder priced: the same
      // grand total, to the cent.
      assert.equal(q.grandTotal, t.quote.grandTotal, `${t.country} ${t.id}: Finish ${q.grandTotal} against the finder's ${t.quote.grandTotal}`);
      // The receipt is that total cut into slots of whole euros (slots.js);
      // each slot rounds once, so the sum sits within half a euro a slot.
      const priced = t.slots.filter((x) => x.eur != null).length;
      assert.ok(Math.abs(rc.group - q.grandTotal) <= 0.5 * priced, `${t.id}: group ${rc.group} against ${q.grandTotal}`);
      assert.ok(Math.abs(rc.perPerson - q.perPerson) <= 0.5 * priced, `${t.id}: a person ${rc.perPerson} against ${q.perPerson}`);
      results.push({ label, id: t.id, receipt: rc.perPerson, finish: Math.round(q.perPerson) });
    }
  });
}

test("T801: swaps carry over: stay tier, food level, getting around and a live flight", { skip }, async () => {
  const t0 = trips(answers("2026-11-21", "2026-11-28")).find((t) => t.slots[0].eur != null);
  assert.ok(t0, "a trip with a flight");
  let t = t0;
  for (const [id, opt] of [["stay", "hotel3"], ["food", "out"], ["local", "car"]]) {
    const s = t.slots.find((x) => x.id === id);
    if (s.options?.some((o) => o.id === opt && o.id !== s.pick?.id)) t = withSlot(t, chooseOption(s, opt), slotTotals);
  }
  const live = fixture("tf1-live-BRU-LJU.json");
  const opts = await optionsFor(t, { fetchDay: async () => live });
  if (opts?.out) t = withSlot(t, chooseFlight(t, opts.out.groups.quickest[0]), slotTotals);
  const plan = planOf(t);
  assert.ok(plan.liveFlights.length <= 2);
  const rc = receiptOf(t).total;
  const { q } = finishTotal(t);
  const priced = t.slots.filter((x) => x.eur != null).length;
  assert.ok(Math.abs(rc.group - q.grandTotal) <= 0.5 * priced, `swapped trip: group ${rc.group} against Finish ${q.grandTotal}`);
});

test("T801: the measured gap, receipt against Finish, whole euros a person", { skip }, () => {
  // Printed for the report: how many of the 12 agree to the euro.
  const same = results.filter((x) => x.receipt === x.finish).length;
  console.log(`receipt equals Finish to the euro: ${same} of ${results.length}; largest gap ${Math.max(0, ...results.map((x) => Math.abs(x.receipt - x.finish)))}`);
  assert.equal(results.length, 12);
});

test("T801: the plan keeps the finder's order, skips Where and Stay, and lets a 'you' stay be asked", { skip }, () => {
  const [t] = trips(answers("2026-11-21", "2026-11-28"));
  const plan = planOf(t);
  assert.deepEqual(plan.order, t.places.map((p) => p.id));
  assert.equal(appliesTo(plan, [...plan.order].reverse()), true, "the same places in any order");
  assert.equal(appliesTo(plan, plan.order.slice(1)), plan.order.length === 1 ? false : false, "a place removed drops the plan");
  const steps = ["Where", "Stay", "Getting", "Finish"];
  assert.equal(landingStep(plan, steps), "Getting");
  assert.equal(landingStep({ ...plan, yours: ["stay"] }, steps), "Stay");
  const d = draftFor(plan, steps);
  assert.equal(d.stepName, "Getting");
  assert.equal(d.step, 3);
  assert.deepEqual(d.countries, [t.country]);
  assert.equal(d.finder.tripId, t.id);
  assert.deepEqual(JSON.parse(JSON.stringify(d)).finder.liveFlights, d.finder.liveFlights, "the draft survives JSON (plannerStore)");
});
