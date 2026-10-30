// T874: what the end-to-end walk of four travellers found asked twice,
// dropped or priced wrong, held by node tests.
//  - The way there the setup asks (Train, Car) answers Help me choose's "how
//    far" (no flying): the question is skipped, the finder's trips go
//    overland, and with Fly the "No flying" answer is not offered again.
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildCandidates, fliesThere, transportFor } from "../src/lib/recommend/candidates.js";
import { guideScreens } from "../src/planner/flow/flowGraph.js";
import { QUESTIONS } from "../src/planner/flow/questions.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const data = existsSync(pub("app_data.json")) ? JSON.parse(readFileSync(pub("app_data.json"), "utf8")) : null;
const skip = data ? false : "public/app_data.json is not on this machine";
const BRUSSELS = { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" };
const settings = (extra = {}) => normalizeSettings({
  answered: ["who", "when", "way"],
  party: { kind: "couple", adults: 2 },
  when: { mode: "exact", start: "2026-12-05", end: "2026-12-12", nights: 7 },
  guide: { shapes: [], likes: ["food"] },
  ...extra,
});

test("T874: a train or car way there skips how far; Fly and Any way still ask it", () => {
  for (const way of ["train", "car"]) assert.ok(!guideScreens(settings({ way })).includes("g:reach"), way);
  for (const way of ["", "any", "plane"]) assert.ok(guideScreens(settings({ way })).includes("g:reach"), way || "unset");
});

test("T874: with Fly as the way there, How far does not offer No flying", () => {
  const q = QUESTIONS["g:reach"];
  const offered = (way) => q.options.map((o) => o.value).filter((v) => q.offered(settings({ way }), v));
  assert.deepEqual(offered("plane"), ["short", "any"]);
  assert.deepEqual(offered("any"), ["short", "any", "overland"]);
});

test("T874: the way there decides how the finder's trips travel", () => {
  assert.equal(transportFor("one", settings({ way: "train" })), "train");
  assert.equal(transportFor("one", settings({ way: "car" })), "owncar");
  assert.equal(transportFor("one", settings({ way: "car", guide: { avoid: ["car"] } })), "train");
  assert.equal(transportFor("one", settings({ way: "plane" })), "auto");
  assert.equal(transportFor("road", settings({ way: "any" })), "car");
  assert.equal(fliesThere(settings({ way: "train" })), false);
  assert.equal(fliesThere(settings({ way: "car" })), false);
  assert.equal(fliesThere(settings({ way: "plane" })), true);
  assert.equal(fliesThere(settings({ way: "any", guide: { reach: "overland" } })), false);
});

test("T874: a train way there gives trips that go by train, none flown", { skip }, () => {
  const c = buildCandidates({ data, settings: settings({ way: "train" }), origin: BRUSSELS, flights: null, today: "2026-10-30" });
  const list = Array.isArray(c) ? c : c?.candidates || [];
  assert.ok(list.length > 0, "some trips");
  assert.ok(list.every((t) => t.transport === "train"), list.map((t) => t.transport).join(","));
});

// ---- Priced wrong: the way to the airport with no fare, and the finder's airport ----
import { quoteTrip, wizardPlannerState } from "../src/lib/tripTotal.js";
import { homeAirports } from "../src/lib/airportReach.js";
import { engineOriginCode } from "../src/lib/airportReach.js";

function sweepBRU() {
  const f = JSON.parse(readFileSync(new URL("./fixtures/tf1-flights-BRU.json", import.meta.url), "utf8"));
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at; f.from = "BRU";
  return f;
}
const GHENT = { lat: 51.054, lon: 3.717 };
const reach = () => {
  const bru = sweepBRU();
  return { ...data, flights: bru, flightsBy: { BRU: bru }, meta: { ...data.meta, selected_origin: "ANR", home_airports: homeAirports(data.meta, GHENT, ["BRU", "CRL"]) } };
};
const trip = (id, start, end, nights) => wizardPlannerState({
  startDate: start, stops: [{ destinationId: id, nights }], groupSize: 2, transport: "auto", pace: "balanced",
}, { stayTier: "home" });

test("T874: a trip with no fare yet counts no way to the airport (the card's 'without the flight')", { skip }, () => {
  const q = quoteTrip(trip("DBV", "2026-12-05", "2026-12-12", 7), { data: reach() });
  assert.ok(q.cartaFlight, "the trip flies");
  assert.ok(!q.cartaFlight.out?.cost && !q.cartaFlight.back?.cost, "no fare in the sweep");
  assert.equal(q.parts.airport, 0);
});

test("T874: a priced flight still counts the way to the airport and back", { skip }, () => {
  const q = quoteTrip(trip("PRG", "2026-11-21", "2026-11-28", 7), { data: reach() });
  assert.ok(q.cartaFlight.out?.cost && q.cartaFlight.back?.cost);
  assert.ok(q.parts.airport > 0);
  assert.equal(q.parts.airport, q.cartaFlight.access.eur);
});

test("T874: the finder's origin is a ticked airport, as the planner's", { skip }, () => {
  const d = reach();
  assert.equal(engineOriginCode(d), "BRU");
  assert.equal(engineOriginCode({ ...d, meta: { ...d.meta, selected_origin: "CRL" } }), "CRL");
  assert.equal(engineOriginCode({ ...d, meta: { ...d.meta, home_airports: [] } }), "ANR");
});

// ---- Asked twice: a flight the words said is booked ----
import { saidFlight } from "../src/lib/plan/doors.js";

test("T874: the words' booked flight fills the typed form: the one town named and the trip's days", () => {
  const s = normalizeSettings({
    booked: { flights: true }, places: [{ kind: "place", id: "PRG", name: "Prague", iso2: "CZ", country: "Czechia" }],
    when: { mode: "exact", start: "2026-11-21", end: "2026-11-28", nights: 7 },
  });
  assert.deepEqual(saidFlight(s), { city: "Prague", out: "2026-11-21", back: "2026-11-28" });
  assert.deepEqual(saidFlight({ ...s, booked: { ...s.booked, flights: false } }), { city: "", out: "", back: "" });
  const two = { ...s, places: [...s.places, { kind: "place", id: "VIE", name: "Vienna" }] };
  assert.equal(saidFlight(two).city, "");
  assert.equal(saidFlight({ ...s, when: { mode: "month", month: 11 } }).out, "");
});

test("T874: with no fare anywhere the trip names a swept airport, not the nearest unswept one", { skip }, () => {
  const d = reach();
  const ticked = { ...d, meta: { ...d.meta, selected_origin: "BRU", home_airports: homeAirports(data.meta, GHENT, ["ANR", "BRU", "CRL"]) } };
  assert.equal(ticked.meta.home_airports[0].iata, "ANR", "Antwerp is the nearest drive from Ghent");
  const q = quoteTrip(trip("DBV", "2026-12-05", "2026-12-12", 7), { data: ticked });
  assert.equal(q.cartaFlight.home, "BRU");
  assert.equal(q.parts.airport, 0);
});

test("plan flow walk: getting around moves the pricing and the scoring", async () => {
  const { wantsNoCar, tasteFor, shapesFor } = await import("../src/lib/recommend/candidates.js");
  const around = (v, extra = {}) => settings({ way: "plane", ...extra, guide: { around: v, ...(extra.guide || {}) } });
  // Public transport and taxis: no car anywhere, car-needing places marked down.
  for (const v of ["public", "taxi"]) {
    assert.ok(wantsNoCar(around(v)), v);
    assert.equal(transportFor("road", around(v)), "auto", `${v}: a road trip is not priced with a car`);
    assert.equal(tasteFor(around(v)).noCar, true, `${v}: the taste says no car`);
    assert.ok(!shapesFor(around(v, { guide: { shapes: ["road", "towns"] } })).shapes.includes("road"), `${v}: no road trip`);
  }
  // A hire car prices every shape with one; whatever fits keeps today's rule.
  assert.equal(transportFor("towns", around("car")), "car");
  assert.equal(transportFor("towns", around("mix")), "auto");
  assert.equal(transportFor("road", around("mix")), "car");
  assert.ok(!wantsNoCar(around("car")) && !wantsNoCar(around("mix")));
  // The question is not asked when they drive their own car or booked a rental.
  assert.ok(guideScreens(settings({ way: "plane" })).includes("g:around"));
  assert.ok(!guideScreens(settings({ way: "car" })).includes("g:around"));
  assert.ok(!guideScreens(settings({ way: "plane", booked: { car: true } })).includes("g:around"));
  // "Avoid a car" left the avoid question; an older answer still counts.
  assert.ok(!QUESTIONS["g:avoid"].offered(settings({}), "car"));
  assert.ok(wantsNoCar(settings({ guide: { avoid: ["car"] } })));
});
