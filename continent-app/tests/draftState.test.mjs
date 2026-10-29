// T827: the day planner prices a stored trip draft the way the trip planner
// does (its stay, its eating habits, the picked flights), so the days screen
// and the trip page say one figure. Run: npm test. Pure.
import test from "node:test";
import assert from "node:assert/strict";
import { draftQuoteState, draftLifestyle } from "../src/lib/price/draftState.js";

const pick = { from: "BRU", to: "SZG", date: "2026-11-21", price: 96, airline: "FR", dep: "06:30", arr: "13:15" };

test("picked flights become live answers", () => {
  const st = draftQuoteState({ stops: [{}], flightPicks: { out: pick, back: null } });
  assert.ok(st.liveFlights instanceof Map);
  assert.equal(st.liveFlights.size, 1);
});

test("a pick wins over a live answer for the same leg", () => {
  const live = new Map([[[...draftQuoteState({ flightPicks: { out: pick } }).liveFlights.keys()][0], { flights: [{ price: 999 }] }]]);
  const st = draftQuoteState({ flightPicks: { out: pick } }, { liveAnswers: live });
  assert.equal([...st.liveFlights.values()][0].flights[0].price, 96);
});

test("the trip's own stay tier wins over the app's", () => {
  assert.equal(draftQuoteState({ stayTier: "hotel" }, { stayTier: "home" }).stayTier, "hotel");
  assert.equal(draftQuoteState({}, { stayTier: "home" }).stayTier, "home");
});

test("a finder trip's eating habits hold until the app's Lifestyle moves", () => {
  const app = { food: "mix" };
  const d = { tripLifestyle: { profile: { food: "eatout" }, base: JSON.stringify(app) } };
  assert.deepEqual(draftLifestyle(d, app), { food: "eatout" });
  assert.deepEqual(draftLifestyle(d, { food: "cook" }), { food: "cook" });
});

test("no picks and no live answers adds no liveFlights", () => {
  assert.equal("liveFlights" in draftQuoteState({ stops: [] }), false);
  assert.equal(draftQuoteState(null), null);
});
