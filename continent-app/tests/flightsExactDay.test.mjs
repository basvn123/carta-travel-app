// T855: trip dates and flight days agree. A trip whose dates may move goes
// onto the swept flight days with its nights kept (sweptShift); one whose
// dates are fixed keeps them, flies home never before check-out
// (sweptFixedDates) and says which day it flies; the found trip and the
// trip page look the exact days up live and price them through quoteTrip.
// Run: npm test (continent-app/). The finder cases skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { sweptShift, sweptFixedDates } from "../src/lib/flights/flights.js";
import { exactDayLive, exactDayNote, exactDayQueries } from "../src/lib/flights/exactDay.js";
import { flightOffDays } from "../src/lib/recommend/adapters/flight.js";
import { findTrips } from "../src/lib/recommend/rank.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { quoteTrip, wizardPlannerState } from "../src/lib/tripTotal.js";
import { selectionOfPlan } from "../src/lib/plan/doors.js";
import { planOf } from "../src/planner/finder/planOf.js";

const NOW = Date.UTC(2026, 10, 26, 12);
const at = Math.floor(NOW / 60000) - 60;
const leg = (price) => [price, "VY", "07:00", "09:00", 0, at];
const file = (to, back) => ({ v: 1, from: "BRU", to: { BCN: to }, back: { BCN: back } });

test("the shift rule: the smallest shift with both ways swept, nights kept, the cheaper of two equal shifts", () => {
  // Trip 10 to 17 December; fares on the 9th and 16th (shift -1) and the 12th and 19th (+2).
  const f = file({ "2026-12-09": leg(40), "2026-12-12": leg(20) }, { "2026-12-16": leg(40), "2026-12-19": leg(20) });
  const s = sweptShift(f, "BCN", "2026-12-10", "2026-12-17", { now: NOW });
  assert.equal(s.shift, -1);
  assert.equal(s.out.date, "2026-12-09");
  assert.equal(s.back.date, "2026-12-16");
  // Both one day away: the cheaper pair.
  const g = file({ "2026-12-09": leg(60), "2026-12-11": leg(30) }, { "2026-12-16": leg(60), "2026-12-18": leg(30) });
  assert.equal(sweptShift(g, "BCN", "2026-12-10", "2026-12-17", { now: NOW }).shift, 1);
  // The exact days win over a cheaper shift.
  const h = file({ "2026-12-10": leg(90), "2026-12-11": leg(10) }, { "2026-12-17": leg(90), "2026-12-18": leg(10) });
  assert.equal(sweptShift(h, "BCN", "2026-12-10", "2026-12-17", { now: NOW }).shift, 0);
});

test("the fallback: no shared shift gives null, and fixed dates never fly home before check-out", () => {
  // Out swept a day early, home only a day before check-out or two days after.
  const f = file({ "2026-12-09": leg(40) }, { "2026-12-15": leg(20), "2026-12-19": leg(50) });
  assert.equal(sweptShift(f, "BCN", "2026-12-10", "2026-12-17", { now: NOW }), null);
  const fixed = sweptFixedDates(f, "BCN", "2026-12-10", "2026-12-17", { now: NOW });
  assert.equal(fixed.out.date, "2026-12-09");
  assert.equal(fixed.back.date, "2026-12-19", "the cheaper 15th is before check-out on the 17th");
  assert.ok(fixed.back.date >= "2026-12-17");
  // Only a flight home before check-out: no pair at all.
  assert.equal(sweptFixedDates(file({ "2026-12-10": leg(40) }, { "2026-12-16": leg(20) }), "BCN", "2026-12-10", "2026-12-17", { now: NOW }), null);
});

test("the card names the day a fixed-date trip's flight flies, only when it is another day", () => {
  const trip = (out, back) => ({ dates: { out: "2026-12-10", back: "2026-12-17" }, slots: [{ id: "flight", pick: { facts: { out: { date: out }, back: { date: back } } } }] });
  assert.deepEqual(flightOffDays(trip("2026-12-10", "2026-12-17")), { out: null, back: null });
  assert.deepEqual(flightOffDays(trip("2026-12-09", "2026-12-18")), { out: "2026-12-09", back: "2026-12-18" });
});

test("the found trip asks the two exact days only for a swept Google fare, and says what happened", () => {
  const queries = [{ o: "BRU", d: "BCN", date: "2026-12-10" }, { o: "BCN", d: "BRU", date: "2026-12-17" }];
  const trip = (source) => {
    const t = { slots: [{ id: "flight", pick: { facts: { source, out: { date: "2026-12-09" }, back: { date: "2026-12-17" } } } }] };
    Object.defineProperty(t, "quote", { value: { cartaFlight: { queries } }, enumerable: false });
    return t;
  };
  assert.deepEqual(exactDayQueries(trip("swept")), queries);
  assert.equal(exactDayQueries(trip("live")), null, "a live flight is already the exact day's");
  assert.equal(exactDayQueries(trip("yours")), null);
  const answer = { checked: "2026-11-26T12:00:00Z", flights: [] };
  assert.deepEqual(exactDayLive(queries, [answer, null]), [["BRU-BCN-2026-12-10", answer]]);
  const facts = trip("swept").slots[0].pick.facts;
  const money = (d) => (d > 0 ? `+€${d}` : `-€${-d}`);
  assert.equal(exactDayNote({ facts, statuses: ["loading", "ready"], diff: null, money }).key, "tf.tp.flightEstimate");
  const failed = exactDayNote({ facts, statuses: ["error", "error"], diff: null, money });
  assert.equal(failed.key, "tf.tp.flightFailed");
  assert.ok(failed.vars.date.length > 0, "it names the swept fare's day");
  assert.equal(exactDayNote({ facts, statuses: ["ready", "ready"], diff: null, money }), null);
  const moved = exactDayNote({ facts, statuses: [], diff: { lines: [{ id: "flight", diff: 12 }] }, money });
  assert.deepEqual([moved.key, moved.vars.diff], ["tf.tp.flightLive", "+€12"]);
  assert.equal(exactDayNote({ facts, statuses: [], diff: { lines: [] }, money }).key, "tf.tp.flightLiveSame");
});

// The finder on the real catalogue and the fixture sweep.
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";
const countryInsights = read("country_insights.json")?.countries || null;
function sweep() {
  const f = JSON.parse(readFileSync(new URL("./fixtures/tf1-flights-BRU.json", import.meta.url), "utf8"));
  const minute = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = minute;
  return f;
}
const flights = data ? sweep() : null;
const BRU = { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" };
const settings = (when) => normalizeSettings({
  answered: ["who", "when"], party: { kind: "couple", adults: 2 }, priority: "balance", when,
  guide: { shapes: ["towns"], likes: ["hiking", "food"], weather: "mild", reach: "short", avoid: ["crowds"], budget: { kind: "total", eur: 1200 } },
});
const trips = (s) => findTrips({ data, countryInsights, settings: s, origin: BRU, flights, today: "2026-10-28" });

test("the list: a trip whose dates may move flies on its own dates; the return is never before check-out", { skip }, () => {
  const moving = trips(settings({ mode: "months", months: [11], nights: 7 })).slice(0, 20);
  let shifted = 0;
  for (const t of moving) {
    const facts = t.slots.find((s) => s.id === "flight")?.pick?.facts;
    if (facts?.source !== "swept") continue;
    // On its flight days: moved there (shiftedBy), or started on the month's
    // cheapest week (owner, 2026-11-27), so nothing had to move.
    if (t.shiftedBy || (facts.out.date === t.dates.out && facts.back.date === t.dates.back)) shifted += 1;
    if (t.shiftedBy) {
      assert.equal(facts.out.date, t.dates.out, `${t.id}: out on check-in`);
      assert.equal(facts.back.date, t.dates.back, `${t.id}: home on check-out`);
    }
    assert.ok(facts.back.date >= t.dates.back, `${t.id}: home ${facts.back.date}, check-out ${t.dates.back}`);
  }
  const fixed = trips(settings({ mode: "exact", start: "2026-11-14", end: "2026-11-21", nights: 7 })).slice(0, 20);
  let named = 0;
  for (const t of fixed) {
    const facts = t.slots.find((s) => s.id === "flight")?.pick?.facts;
    if (facts?.source !== "swept") continue;
    assert.equal(t.datesFixed, true);
    assert.equal(t.dates.out, "2026-11-14", "the traveller's dates stay");
    assert.ok(facts.back.date >= t.dates.back, `${t.id}: home ${facts.back.date}, check-out ${t.dates.back}`);
    if (flightOffDays(t).out || flightOffDays(t).back) named += 1;
  }
  assert.ok(named >= 1, `${named} fixed-date trips name their flight's day`);
  assert.ok(shifted >= 1, `${shifted} trips fly on their own days`);
});

test("the trip page: the exact day's live flight replaces a held nearby-day fare; without an answer the held one stays", { skip }, () => {
  const t = trips(settings({ mode: "exact", start: "2026-11-14", end: "2026-11-21", nights: 7 }))
    .find((x) => flightOffDays(x).out);
  assert.ok(t, "a trip priced on a nearby day");
  const plan = planOf(t);
  const sel = selectionOfPlan(plan);
  const state = { ...wizardPlannerState(sel, { stayTier: sel.stayTier || "home", lifestyle: sel.lifestyle }), flightPicks: sel.flightPicks, flightRank: plan.flightRank };
  const appData = { ...data, flights, meta: { ...data.meta, selected_origin: "BRU" } };
  const held = quoteTrip(state, { data: appData, countryInsights });
  assert.equal(held.cartaFlight.out.date, flightOffDays(t).out, "the held fare keeps its own day");
  const q = held.cartaFlight.queries[0];
  const live = new Map([[`${q.o}-${q.d}-${q.date}`, { checked: new Date().toISOString(), flights: [{ price: 77, airline: "SN", flightNo: "SN1", dep: "10:00", arr: "12:00", stops: 0 }] }]]);
  const exact = quoteTrip({ ...state, liveFlights: live }, { data: appData, countryInsights });
  assert.equal(exact.cartaFlight.out.date, q.date, "the exact day");
  assert.equal(exact.cartaFlight.out.price, 77);
  assert.equal(exact.cartaFlight.out.source, "live");
});
