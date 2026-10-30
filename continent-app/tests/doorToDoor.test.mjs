// T861: priced door to door. With the airports in reach answered (T860), the
// trip finder and the planner load each ticked airport's swept file and fly
// from the cheapest whole: the fare plus the drive or train to the airport
// and back with parking (airportReach.accessCost). The trip's flight line
// names the airport and what it saves against the nearest; a swap pins
// another (the planner's anchorOrigin). Without the answer nothing moves.
// Run: npm test (continent-app/). The catalogue cases skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { findTrips } from "../src/lib/recommend/rank.js";
import { quoteTrip, tripLines, PLANNER_BAG } from "../src/lib/tripTotal.js";
import { costTiles } from "../src/lib/price/tiles.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { withPlan, planState } from "../src/planner/finder/handoff.js";
import { planOf } from "../src/planner/finder/planOf.js";
import { homeAirports, homeCandidates, accessCost } from "../src/lib/airportReach.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";
const countryInsights = read("country_insights.json")?.countries || null;

/** The BRU sweep fixture, fresh; `from` and a price factor make another airport's file. */
function sweep(from = "BRU", factor = 1) {
  const f = fixture("tf1-flights-BRU.json");
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) {
    for (const days of Object.values(side)) {
      for (const v of Object.values(days)) if (Array.isArray(v)) { v[5] = at; v[0] = Math.round(v[0] * factor); }
    }
  }
  f.checked = at;
  f.from = from;
  return f;
}
const GHENT = { lat: 51.054, lon: 3.717 };
const BRU = { iata: "BRU", lat: 50.9014, lon: 4.4844, name: "Brussels" };

/** The app's data with the airports in reach answered: BRU (nearest) and EIN at half the fare. */
function reachData(codes = ["BRU", "EIN"], factor = 0.5) {
  const files = { BRU: sweep("BRU"), EIN: sweep("EIN", factor) };
  return {
    ...data,
    flights: files.BRU,
    flightsBy: Object.fromEntries(codes.map((c) => [c, files[c]])),
    meta: { ...data.meta, selected_origin: "BRU", home_airports: homeAirports(data.meta, GHENT, codes) },
  };
}

const answers = () => normalizeSettings({
  answered: ["who", "when"], party: { kind: "couple", adults: 2 }, priority: "balance",
  when: { mode: "exact", start: "2026-11-21", end: "2026-11-28", nights: 7 },
  guide: { shapes: ["towns"], likes: ["hiking", "food"], weather: "mild", reach: "short", avoid: ["crowds"], budget: { kind: "total", eur: 1200 } },
});
const find = (d) => findTrips({ data: d, countryInsights, layerIndexes: {}, settings: answers(), origin: BRU, flights: d.flights, today: "2026-10-28" });
const flightOf = (t) => t.slots.find((s) => s.id === "flight");

function reviewState(plan) {
  const stops = plan.order.map((id) => ({ destinationId: id, nights: plan.nights[id], activities: [] }));
  const hand = {
    startDate: plan.startDate, groupSize: plan.party.adults, children: plan.party.children, babies: plan.party.babies,
    stayTier: "home", transport: "auto", pace: "balanced", baggage: PLANNER_BAG,
    anchorId: null, anchorOrigin: null, returnAnchorId: null,
    ownFlight: { airline: "", mode: "fly", costTotal: 0, costOut: 0, costBack: 0, outDate: plan.startDate, retDate: plan.endDate },
    carHome: null, legModes: {}, ownLegs: {}, ownStays: {}, label: plan.country, stops,
  };
  return planState(withPlan(hand, plan), plan);
}

test("the candidates: the ticked airports with their files, a pinned one added, else the one origin", () => {
  const d = {
    flights: { from: "BRU" }, flightsBy: { EIN: { from: "EIN" } },
    meta: { selected_origin: "BRU", home_airports: [{ iata: "BRU", roadKm: 70 }, { iata: "EIN", roadKm: 160 }] },
  };
  assert.deepEqual(homeCandidates(d).homes.map((h) => [h.iata, h.file?.from]), [["BRU", "BRU"], ["EIN", "EIN"]]);
  assert.equal(homeCandidates(d).ticked, true);
  assert.deepEqual(homeCandidates(d, "CRL").homes.map((h) => h.iata), ["BRU", "EIN", "CRL"]);
  const one = homeCandidates({ flights: { from: "BRU" }, meta: { selected_origin: "BRU" } });
  assert.deepEqual([one.ticked, one.homes.map((h) => h.iata)], [false, ["BRU"]]);
});

test("the finder flies from the cheapest ticked airport door to door, the way there in the flight's figure", { skip }, () => {
  const d = reachData();
  const trips = find(d);
  const flown = trips.filter((t) => flightOf(t)?.pick?.facts?.source === "swept");
  assert.ok(flown.length, "some trip has a swept flight");
  const t = flown[0];
  const facts = flightOf(t).pick.facts;
  assert.equal(facts.home, "EIN", "half the fare beats the longer drive");
  assert.equal(t.origin, "EIN");
  assert.ok(facts.access && facts.access.eur > 0);
  const legs = (facts.out?.perSeat || 0) > 0;
  assert.ok(legs);
  // The slot's figure is the fares plus the way to the airport and back.
  const fares = flightOf(t).eurGroup - facts.access.eur;
  assert.ok(fares > 0);
  // The same trips from Brussels alone: no way to the airport is added.
  const plain = find({ ...data, flights: d.flights, meta: { ...data.meta, selected_origin: "BRU" } });
  const same = plain.find((x) => x.places.map((p) => p.id).join() === t.places.map((p) => p.id).join() && flightOf(x)?.pick?.facts?.source);
  if (same) assert.equal(flightOf(same).pick.facts.access, null);
});

test("the planner keeps the card's airport, adds the way there as its own line, and a swap pins another", { skip }, () => {
  const d = reachData();
  const t = find(d).find((x) => flightOf(x)?.pick?.facts?.home === "EIN");
  const plan = planOf(t);
  assert.equal(plan.anchorOrigin, "EIN");
  const state = reviewState(plan);
  const q = quoteTrip(state, { data: d, countryInsights });
  assert.equal(q.cartaFlight.home, "EIN");
  assert.equal(q.cartaFlight.nearest, "BRU");
  assert.deepEqual(q.cartaFlight.airports.map((a) => a.iata), ["BRU", "EIN"]);
  assert.ok(q.parts.airport > 0);
  assert.equal(q.parts.airport, q.cartaFlight.access.eur);
  const line = tripLines(q).find((l) => l.key === "airport");
  assert.equal(line.eur, q.parts.airport);
  // The four tiles still add up to the total, the way there in getting there.
  const tiles = costTiles(q);
  assert.ok(tiles[0].parts.includes("airport"));
  assert.equal(Math.round(tiles.reduce((n, x) => n + x.eur, 0) * 100) / 100, q.grandTotal);
  // A swap to Brussels pins it, at its own fare and drive.
  const bru = quoteTrip({ ...state, anchorOrigin: "BRU" }, { data: d, countryInsights });
  assert.equal(bru.cartaFlight.home, "BRU");
  assert.ok(bru.cartaFlight.pinned);
  const row = d.meta.home_airports.find((a) => a.iata === "BRU");
  assert.equal(bru.parts.airport, accessCost(row, { adults: 2, children: 0, babies: 0, nights: q.plannedNights }).eur);
  // Unpinned, the planner picks the cheapest whole of the two.
  const free = quoteTrip({ ...state, anchorOrigin: null }, { data: d, countryInsights });
  const best = Math.min(...free.cartaFlight.airports.filter((a) => a.priced).map((a) => a.total));
  assert.equal(free.cartaFlight.airports.find((a) => a.iata === free.cartaFlight.home).total, best);
});

test("without the reach answered nothing moves: one origin, no way-to-the-airport line", { skip }, () => {
  const d = { ...data, flights: sweep("BRU"), meta: { ...data.meta, selected_origin: "BRU" } };
  const t = find(d).find((x) => flightOf(x)?.pick?.facts?.source === "swept");
  const q = quoteTrip(reviewState(planOf(t)), { data: d, countryInsights });
  assert.equal(q.cartaFlight.home, "BRU");
  assert.equal(q.parts.airport, 0);
  assert.equal(q.cartaFlight.airports, null);
  assert.ok(!tripLines(q).some((l) => l.key === "airport"));
});

test("one tap swaps to the cheapest, else back to the nearest, else the next cheapest", async () => {
  const { swapTarget } = await import("../src/planner/trip/airportLine.js");
  const a = (iata, total, priced = true) => ({ iata, total, priced });
  const airports = [a("BRU", 500), a("CRL", 450), a("EIN", 420), a("LGG", 0, false)];
  assert.equal(swapTarget({ home: "BRU", nearest: "BRU", airports }), "EIN");
  assert.equal(swapTarget({ home: "EIN", nearest: "BRU", airports }), "BRU");
  assert.equal(swapTarget({ home: "EIN", nearest: "EIN", airports }), "CRL");
  assert.equal(swapTarget({ home: "BRU", nearest: "BRU", airports: [a("BRU", 500)] }), null);
  assert.equal(swapTarget({ home: "BRU", airports: null }), null);
});
