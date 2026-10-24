// T702-T711 (F6): the trip price from the engine, plan "Carta prijslogica
// Explore" invariants V1 (trip), V6 (car) and the saved trip's own request.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import {
  quoteStay, tripRequest, priceDay, atDates, priceDays, priceRequest,
} from "../src/lib/price/index.js";
import { quoteTrip } from "../src/lib/price/trip.js";
import { quoteNights } from "../src/lib/price/nights.js";
import { quoteComposed } from "../src/lib/price/compose.js";
import { plannerStateFromPlan } from "../src/lib/myTrips.js";
import { PLANNER_BAG } from "../src/lib/tripTotal.js";
import { rule } from "../src/lib/price/config.js";
import { bagTier } from "../src/lib/flights/bagFees.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/price/destinations.json", import.meta.url), "utf8"));
setStayRecords(FX.stays);
const ALL = FX.destinations;
const IDS = Object.keys(ALL);
const DATA = { destinations: ALL, meta: {} };
const c100 = (v) => Math.round(v * 100);
const START = "2027-05-08";

const stateFor = (id, over = {}) => ({
  stops: [{ destinationId: id, nights: 5, activities: [] }],
  tripStart: START, groupSize: 2, stayTier: "home", transportPref: "auto", ...over,
});

test("V1 (trip): a stop costs the destination page's day, times the nights and the seats", () => {
  for (const id of IDS) {
    for (const over of [{}, { groupSize: 3, children: 1 }, { stayTier: "hotel3" }, { groupSize: 1, stayTier: "dorm" }]) {
      const state = stateFor(id, over);
      const priced = quoteTrip(state, { data: DATA });
      const req = atDates(tripRequest(state), START, "2027-05-13");
      const day = priceDay(ALL[id], req, ALL);
      const seats = req.group.adults + req.group.children;
      if (day?.stayEur == null) continue;
      assert.equal(c100(priced.stayCosts[0].accomTotal), c100(day.stayEur * 5 * seats), `${id} ${JSON.stringify(over)} beds`);
      assert.equal(c100(priced.stayCosts[0].groundTotal), c100(day.foodEur * 5 * seats), `${id} ${JSON.stringify(over)} days`);
      assert.equal(c100(priced.parts.beds + priced.parts.days), c100(priced.stayCosts[0].total), id);
    }
  }
});

test("V1 (trip): the composed Places trip and the calculator read the same day", () => {
  const choices = { group_size: 2, stay_tier: "home", transport_mode: "any" };
  const ret = "2027-05-13";
  const req = atDates(priceRequest({ choices }), START, ret);
  const days = priceDays(ALL, req);
  for (const id of IDS) {
    const day = days.get(id);
    if (day?.dayEur == null) continue;
    const calc = quoteNights(day, 5, 2);
    assert.equal(c100(calc.total), c100(day.stayEur * 10) + c100(day.foodEur * 10), id);
    const composed = quoteComposed(ALL[id], START, ret, choices, ALL, { day });
    if (!composed) continue;
    assert.equal(c100(composed.accom_total + composed.ground_total), c100(calc.total), `${id}: Places stay = calculator`);
  }
});

test("V6 (car): a hire for seven is two cars, and the car is in the trip only when hired", () => {
  const id = "LIS";
  const hired = quoteTrip(stateFor(id, { groupSize: 7, transportPref: "car" }), { data: DATA });
  assert.equal(hired.carRental.cars, 2);
  assert.ok(hired.parts.car > 0);
  const four = quoteTrip(stateFor(id, { groupSize: 4, transportPref: "car" }), { data: DATA });
  assert.equal(four.carRental.cars, 1);
  assert.ok(hired.parts.car / 7 >= four.parts.car / 4 - 0.01, "the jump to a second car is the only rise a head");
  const flying = quoteTrip(stateFor(id, { groupSize: 7 }), { data: DATA });
  assert.equal(flying.carRental, null);
  assert.equal(flying.parts.car, 0);
});

test("children pay the configured shares, the same on a stop as on the day price", () => {
  const id = "LIS";
  const kids = quoteTrip(stateFor(id, { groupSize: 2, children: 2 }), { data: DATA });
  const req = atDates(tripRequest({ groupSize: 2, children: 2 }), START, "2027-05-13");
  const day = priceDay(ALL[id], req, ALL);
  assert.equal(c100(kids.stayCosts[0].groundTotal), c100(day.foodEur * 5 * 4));
  assert.equal(kids.party.weight, (2 + 2 * rule("party.shares").child_ticket) / 4);
});

test("the planner's bag is the app's bag tier", () => {
  assert.equal(bagTier(PLANNER_BAG), bagTier(rule("request.default_bag")));
});

test("a saved trip keeps its own request", () => {
  const plan = {
    stops: [{ destination_id: "LIS", arrive_date: START, depart_date: "2027-05-13",
      choices: { groupSize: 2, priceRequest: { stay: "hotel4", lifestyle: { dinners_per_week: 7 } } } }],
  };
  const st = plannerStateFromPlan(plan, { stayTier: "dorm", lifestyle: { dinners_per_week: 0 } });
  assert.equal(st.stayTier, "hotel4");
  assert.deepEqual(st.lifestyle, { dinners_per_week: 7 });
  const old = { stops: [{ destination_id: "LIS", arrive_date: START, depart_date: "2027-05-13", choices: { groupSize: 2 } }] };
  assert.equal(plannerStateFromPlan(old, { stayTier: "dorm" }).stayTier, "dorm");
});

test("a pass-through stop costs nothing", () => {
  const q = quoteStay(ALL.LIS, 0, START, tripRequest({ groupSize: 2 }), ALL);
  assert.equal(q.total, 0);
  assert.equal(q.accom, null);
});
