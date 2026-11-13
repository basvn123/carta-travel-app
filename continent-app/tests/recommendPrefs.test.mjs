// r3 ranking audit (owner, 2026-11-12): the trip settings shape the trip
// finder's order, not only which trips get built. Stay in one place or move
// around, the persona and what matters most each move the order; heat and
// no car are read one way everywhere; a family keeps its family type; the
// persona picks the countries when the likes are unanswered; a no-car trip
// prices no car hop (r4 price audit); the finder prices the traveller's bag.
// Run: node --test tests/recommendPrefs.test.mjs (continent-app/).
// The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { rankTrips, findTrips, shapeNudge, priorityPull, blendOf, RANK } from "../src/lib/recommend/rank.js";
import { broadWhenUnasked, answersFor, transportFor, BROAD_TYPES } from "../src/lib/recommend/candidates.js";
import { personaTypes, personaFeatures, PERSONA } from "../src/lib/recommend/persona.js";
import { avoidsHeat, noCar } from "../src/lib/recommend/prefs.js";
import { buildTrips } from "../src/lib/recommend/trips.js";
import { slotTotals } from "../src/lib/recommend/slots.js";
import { normalizeSettings, quizAnswers } from "../src/planner/flow/tripSettings.js";
import { SPEND_CHOICES } from "../src/lib/countryMatch.js";

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";

const settings = (guide = {}, over = {}) => normalizeSettings({
  answered: ["who", "when", "g:likes"],
  party: { kind: "couple", adults: 2 },
  when: { mode: "exact", start: "2027-05-09", end: "2027-05-16", nights: 7 },
  guide: { shapes: [], likes: ["hiking"], weather: "", reach: "short", avoid: [], budget: { kind: "total", eur: 0 }, ...guide },
  ...over,
});

// ---- hand-built trips: the same place, one trip stays, the other moves ----

const place = (city) => ({
  city,
  rating: { score: 8 },
  taste: {
    likes: { hiking: [0.8, { n: 4, best: `${city} trail`, band: "good", minutes: 12 }] },
    crowd_by_month: Array(12).fill(1), car_need: false, tmax_by_month: Array(12).fill(20),
  },
});
const DESTS = { a: place("Alpha"), a2: place("Alpha Two"), a3: place("Alpha Three") };
const FAKE = { destinations: DESTS };
const slotRow = (id, eur) => ({ id, labelKey: `tf.slot.${id}`, owner: "carta", eur, eurGroup: eur * 2, pick: null, options: null, because: null, quality: "modelled" });
const trip = (id, shape, places, { perPerson = 900, flight = null } = {}) => {
  const slots = [slotRow("flight", 100), slotRow("stay", perPerson - 300), slotRow("food", 150), slotRow("local", 50)];
  if (flight) slots[0] = { ...slots[0], pick: { facts: flight } };
  return {
    id, country: "Testland", iso2: "TL", shape, places: places.map(([pid, nights]) => ({ id: pid, nights })), month: 5, nights: 7,
    gateway: { iata: "TST", minutes: 30, mode: "bus" }, slots, total: slotTotals(slots), signals: {},
  };
};
// "a..." and "z..." ids: with equal scores the id breaks the tie, so each
// test puts the trip it expects first on the losing side of the tie.
const STAY = trip("z-stay", "one", [["a", 7]]);
const MOVE = trip("a-move", "towns", [["a", 4], ["a2", 3]]);
const ROAD = trip("a-road", "road", [["a", 3], ["a2", 2], ["a3", 2]]);
const order = (s, trips = [MOVE, STAY]) => rankTrips(trips, { settings: s, data: FAKE }).map((t) => t.id);

test("stay or move: the shape asked for leads; none asked and no persona moves nothing", () => {
  assert.equal(order(settings({ shapes: ["one"] }))[0], "z-stay", "one place asked: the one-place trip first");
  const moveFirst = [trip("z-move", "towns", [["a", 4], ["a2", 3]]), trip("a-stay", "one", [["a", 7]])];
  assert.equal(order(settings({ shapes: ["towns"] }), moveFirst)[0], "z-move", "a few towns asked: the moving trip first");
  assert.equal(order(settings({ shapes: ["road"] }), [ROAD, trip("z-stay", "one", [["a", 7]])])[0], "a-road");
  const none = rankTrips([MOVE, STAY], { settings: settings(), data: FAKE });
  assert.equal(none[0].score, none[1].score, "no shapes, no persona: the same score");
  assert.equal(shapeNudge(STAY, settings()), 0);
  // Several countries and one way are built as a few towns, so they count as towns.
  assert.equal(shapeNudge(MOVE, settings({ shapes: ["countries"] })), RANK.shapeStep);
});

test("stay or move: with the shapes unanswered the persona's shapes speak", () => {
  // slow builds one place; towns builds a few towns, then a road trip.
  assert.deepEqual(PERSONA.shapes.slow, ["one"]);
  assert.equal(order(settings({ personas: ["slow"] }))[0], "z-stay");
  const moveFirst = [trip("z-move", "towns", [["a", 4], ["a2", 3]]), trip("a-stay", "one", [["a", 7]])];
  assert.equal(order(settings({ personas: ["towns"] }), moveFirst)[0], "z-move");
  const towns = settings({ personas: ["towns"] });
  assert.equal(shapeNudge(MOVE, towns), RANK.shapeStep, "the persona's first shape: the full step");
  assert.equal(shapeNudge(ROAD, towns), RANK.shapeStep / 2, "its other shapes: half");
  assert.equal(shapeNudge(STAY, towns), 0);
  // Several shapes asked for: the persona says which comes first.
  const both = settings({ shapes: ["one", "towns"], personas: ["towns"] });
  assert.equal(shapeNudge(MOVE, both), RANK.shapeStep);
  assert.equal(shapeNudge(STAY, both), RANK.shapeStep / 2);
  assert.equal(shapeNudge(STAY, settings({ shapes: ["one", "towns"] })), RANK.shapeStep, "no persona: every asked shape alike");
});

test("what matters most orders the trips: price the cheaper, comfort the quicker, balance nothing", () => {
  const leg = (stops, minutes) => ({ stops, out: { minutes } });
  // The dearer trip flies direct; the cheaper one changes planes.
  const dear = trip("a-dear", "one", [["a", 7]], { perPerson: 1300, flight: leg(0, 120) });
  const cheap = trip("z-cheap", "one", [["a", 7]], { perPerson: 800, flight: leg(1, 300) });
  const at = (priority) => order(settings({}, { priority }), [dear, cheap])[0];
  assert.equal(at("price"), "z-cheap");
  assert.equal(at("comfort"), "a-dear");
  assert.equal(at("balance"), "a-dear", "balance: the tie stands, broken by id");
  const pull = priorityPull([dear, cheap], settings({}, { priority: "price" }));
  assert.equal(pull.get("z-cheap"), RANK.priorityPull / 2);
  assert.equal(pull.get("a-dear"), -RANK.priorityPull / 2, "centred: the first rises as much as the last sinks");
  assert.equal(priorityPull([dear, cheap], settings()).size, 0);
  assert.equal(priorityPull([dear], settings({}, { priority: "price" })).size, 0, "one trip: nothing to order");
});

test("a missing fit counts as neutral: the persona keeps its own share", () => {
  const near = Math.abs(blendOf(null, 0.8, 8) - blendOf(0.5, 0.8, 8));
  assert.ok(near < 1e-9, `blendOf(null, P, Q) equals blendOf(0.5, P, Q) (${near})`);
  assert.equal(blendOf(0.7, null, 8), 0.6 * 0.7 + 0.4 * 0.8, "no persona: as before");
  assert.equal(blendOf(null, null, 8), 0.8);
});

test("heat and no car: one rule each", () => {
  assert.equal(avoidsHeat({ avoid: ["heat"] }), true);
  assert.equal(avoidsHeat({ avoid: [], weather: "mild" }), true);
  assert.equal(avoidsHeat({ avoid: [], weather: "warm" }), false);
  for (const around of ["public", "taxi"]) {
    assert.equal(noCar({ avoid: [], around }), true, around);
    const q = quizAnswers(settings({ around }));
    assert.equal(q.around, "flytrain", `${around}: the country match reads no car`);
    assert.ok(q.avoid.includes("car"), around);
  }
  assert.equal(noCar({ avoid: [], around: "car" }), false);
  assert.equal(quizAnswers(settings({ around: "car" })).around, "any");
});

test("a family keeps its family type with three likes", () => {
  const likes = ["culture", "food", "city"];
  const fam = quizAnswers(settings({ likes }, { party: { kind: "family", adults: 2, kids: 2, kidAges: [6, 9] } }));
  assert.deepEqual(fam.types, ["culture", "food", "family"]);
  assert.deepEqual(quizAnswers(settings({ likes })).types, likes, "a couple keeps its three likes");
});

test("the persona picks the countries when the likes are unanswered", () => {
  const unasked = (guide) => settings({ likes: [], ...guide }, { answered: ["who", "when"] });
  assert.deepEqual(answersFor(unasked({ personas: ["coast"] })).types, ["beach", "islands"]);
  assert.deepEqual(answersFor(unasked({})).types, [...BROAD_TYPES], "no persona: the broad types");
  assert.deepEqual(personaTypes({ ids: ["coast", "nature"], most: "nature" }), ["hiking", "lakes", "beach", "islands"], "the most you first");
  assert.equal(answersFor(unasked({ personas: ["coast", "nature"] })).types.length, 3, "at most three");
  assert.deepEqual(broadWhenUnasked({ types: [] }, settings({ likes: [], personas: ["coast"] })).types, [], "an answered empty like list stays empty");
  // The pace term reads the persona's shapes while What kind of trip is unanswered.
  assert.equal(answersFor(unasked({ personas: ["slow"] })).pace, "base");
  assert.equal(answersFor(unasked({ personas: ["towns"] })).pace, "moving");
  assert.equal(answersFor(unasked({ personas: ["slow"], shapes: ["road"] })).pace, "moving", "an answer wins");
  for (const ids of Object.values(PERSONA.types)) assert.ok(ids.length);
});

test("the luxury spend fits the very high cost countries too", () => {
  assert.ok(SPEND_CHOICES.find((x) => x.key === "luxury").levels.includes("very_high"));
});

test("no car: every shape is priced by public transport", () => {
  for (const around of ["public", "taxi"]) {
    for (const shape of ["one", "towns", "road"]) assert.equal(transportFor(shape, settings({ around })), "public", `${around} ${shape}`);
  }
  assert.equal(transportFor("towns", settings({ around: "car" })), "car");
  assert.equal(transportFor("towns", settings()), "auto");
});

// ---- the catalogue ----------------------------------------------------------

const catalogue = () => ({
  data,
  countryInsights: read("country_insights.json")?.countries || null,
  layerIndexes: {
    trails: read("trails/index.json"), beaches: read("beaches/index.json"), lakes: read("lakes/index.json"),
    mountains: read("mountains/index.json"), cycling: read("cycling/index.json"),
  },
  origin: { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" },
  flights: null,
  today: "2026-10-28",
});

test("the catalogue: four people by public transport price no car hop or day trip", { skip }, () => {
  const s = settings({ shapes: ["towns"], likes: ["culture", "food"], around: "public" }, { party: { kind: "friends", adults: 4 } });
  const trips = buildTrips({ ...catalogue(), settings: s });
  assert.ok(trips.length > 0);
  let legs = 0;
  for (const t of trips) {
    assert.equal(t.transport, "public", t.id);
    for (const l of t.quote.legs || []) {
      if (!l?.mode) continue;
      legs += 1;
      assert.notEqual(l.mode, "car", `${t.id}: a hop by car`);
    }
    for (const d of t.quote.dayTrips || []) assert.notEqual(d.mode, "car", `${t.id}: a day trip by car`);
  }
  assert.ok(legs > 0, "some hops were priced");
});

test("the catalogue: the finder prices the traveller's bag, the cabin bag without one", { skip }, () => {
  const s = settings({ shapes: ["one"], likes: ["culture"] });
  // A swept fare on a full-service airline (SN) at every gateway, so the
  // flight has a figure and the checked bag a known fee.
  const gateways = buildTrips({ ...catalogue(), settings: s }).map((t) => t.gateway?.iata).filter(Boolean);
  const flights = sweptFile([...new Set(gateways)]);
  const cabin = buildTrips({ ...catalogue(), settings: s, flights });
  const checked = buildTrips({ ...catalogue(), settings: s, flights, baggage: "checked_20kg" });
  assert.equal(cabin[0].state.baggage, "priority", "no bag given: the planner's cabin bag");
  assert.equal(checked[0].state.baggage, "checked_20kg");
  const priced = cabin.filter((t) => t.quote.parts.flights > 0);
  assert.ok(priced.length > 0, "some flights were priced");
  for (const t of priced) {
    const twin = checked.find((x) => x.id === t.id);
    assert.ok(twin.quote.parts.flights > t.quote.parts.flights, `${t.id}: a checked bag costs more than the cabin bag`);
  }
});

test("the catalogue: a coast persona with the likes unanswered leads with the coast", { skip }, () => {
  const s = settings({ likes: [], personas: ["coast"] }, { answered: ["who", "when"] });
  const trips = findTrips({ ...catalogue(), settings: s });
  for (const t of trips.slice(0, 3)) {
    const id = t.places[0].id;
    assert.ok(personaFeatures(id, data.destinations[id], data.destinations, t.month).coast >= PERSONA.reasonFacts.coast, `${id} is by the sea`);
  }
});

/** A swept flight file with one fresh fare a day, both ways, for the airports given. */
function sweptFile(airports, from = "2027-05-01", days = 30, price = 90) {
  const checked = Math.floor(Date.now() / 60000);
  const day = (k) => new Date(Date.parse(`${from}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
  const leg = (k) => [price + (k % 5) * 7, "SN", "07:05", "08:40", 0, checked];
  const side = () => Object.fromEntries(airports.map((a) => [a, Object.fromEntries(Array.from({ length: days }, (_, k) => [day(k), leg(k)]))]));
  return { v: 1, from: "BRU", checked, to: side(), back: side() };
}
