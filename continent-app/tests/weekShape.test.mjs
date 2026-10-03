// The week plan of T170: bases, effort, the two ends and the weather plan.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import {
  weekBases, dayEffort, tripEnds, weatherPlan, transferMinutes, firstTransfer, baseLabel, sameBase,
} from "../src/lib/weekShape.js";
import { parseGateway } from "../src/lib/gateway.js";

const day = (n, extra = {}) => ({ day: n, title: `Day ${n}`, ...extra });

test("sleep lines become runs of nights, and a change of bed is a move", () => {
  const trip = {
    itinerary: [
      day(1, { sleep: "Hotel San Rocco, Brtonigla" }),
      day(2, { sleep: "Hotel San Rocco, Brtonigla" }),
      day(3, { sleep: "Hotel Kastel or Roxanich Wine & Heritage Hotel, Motovun" }),
      day(4, { sleep: "Hotel Kastel or Roxanich, Motovun" }),
      day(5, { sleep: "Hotel Adriatic or Hotel Angelo d'Oro, Rovinj" }),
      day(6, { sleep: "Hotel Adriatic, Rovinj, or an airport hotel" }),
    ],
  };
  const b = weekBases(trip);
  assert.equal(b.source, "sleep");
  assert.deepEqual(b.runs.map((r) => r.label), ["Brtonigla", "Motovun", "Rovinj"]);
  assert.equal(b.moves, 2);
  assert.equal(b.exit.day, 6);
});

test("a departure night is not a base", () => {
  const b = weekBases({ itinerary: [day(1, { sleep: "Mama Shelter, Belgrade" }), day(2, { sleep: "n/a, departure day." })] });
  assert.equal(b.runs.length, 1);
  assert.equal(b.exit.text, null);
});

test("one basecamp is the whole week from one bed", () => {
  const b = weekBases({ basecamps: ["Vienna (Neubau or Landstrasse)"], itinerary: [day(1), day(2), day(3)] });
  assert.equal(b.source, "one");
  assert.equal(b.moves, 0);
  assert.equal(b.runs[0].label, "Vienna");
});

test("basecamps that cannot be placed are listed, not guessed", () => {
  const b = weekBases({ basecamps: ["Alpha", "Bravo"], itinerary: [day(1), day(2)] });
  assert.equal(b.source, "listed");
  assert.equal(b.moves, null);
});

test("base labels and sameness", () => {
  assert.equal(baseLabel("Manteigas, small hotel or *casa de campo*"), "Manteigas");
  assert.equal(baseLabel("Rifugio Biella, 2,327 m (dorm half board approx. €70)"), "Rifugio Biella");
  assert.equal(baseLabel("Guesthouse in central Viseu"), "Viseu");
  assert.equal(sameBase("Petrostrouga refuge, 1,920 m", "Villa Drosos or Hotel Enipeas, Litochoro"), false);
});

test("effort per style", () => {
  assert.equal(dayEffort({ dayStats: "63 km / 1,120 m ascent / 45% hardpack" }, "cycling").level, 3);
  assert.equal(dayEffort({ dayStats: "43 km, asphalt" }, "cycling").level, 1);
  assert.equal(dayEffort({ dayStats: "15 km, 200 m, 4-5 h" }, "hiking").level, 2);
  assert.equal(dayEffort({ dayStats: "approx. 5,200 m vertical, Rendl sector" }, "winter-sports").level, 3);
  assert.equal(dayEffort({ dayStats: "3 water hours, Open Baltic" }, "water-sports").level, 2);
  assert.equal(dayEffort({ title: "Rest day and coastal logistics" }, "water-sports").rest, true);
  assert.equal(dayEffort({ dayStats: "150 km, 2h20-2h50" }, "city").level, null);
  assert.equal(dayEffort({ dayStats: "Cellars visited: 1." }, "culinary").level, null);
});

test("transfer times read the longest figure", () => {
  assert.equal(transferMinutes("75 min to Buje"), 75);
  assert.equal(transferMinutes("3 h-3 h 45 by road"), 225);
  assert.equal(transferMinutes("2 h 30 to Vielha"), 150);
  assert.equal(firstTransfer("25 min to Kotor, 1 h 45 to Ulcinj"), 25);
  assert.equal(firstTransfer("160 km north; road transfer 2 h 30-3 h via the E79"), 180);
});

test("day zero: land by, collect; the last day: give back, bags", () => {
  const trip = {
    gatewayAirport: "TRS Trieste-Ronchi, 75 min to Buje",
    basecamps: ["Buje"],
    itinerary: [
      day(1, { morning: "Transfer from Trieste to Buje and take delivery of the bike. Ride." }),
      day(2, { afternoon: "Return the bike at the operator's drop-off, then walk." }),
    ],
  };
  const e = tripEnds(trip, parseGateway);
  assert.equal(e.arrive.landBy, "20:00");
  assert.match(e.arrive.collect, /delivery of the bike/);
  assert.match(e.leave.giveBack, /Return the bike/);
  assert.equal(e.leave.luggage, null);
  assert.equal(e.leave.timed.before, 75 + 120);
});

test("weather fallbacks: bail-out, a weather sentence, a flex swap", () => {
  const plan = weatherPlan({
    tripTypeSlug: "hiking",
    itinerary: [
      day(1, { dayStats: "12 km / +400 m. Bail-out: the cable car at the top station." }),
      day(2, { afternoon: "If the weather has broken, escape south over the pass instead." }),
      day(3, { afternoon: "A long ridge." }),
      day(4, { title: "Weather-contingency and rest day" }),
      day(5),
    ],
  });
  assert.equal(plan.days[0].fallback.kind, "bail");
  assert.equal(plan.days[1].fallback.kind, "weather");
  assert.equal(plan.days[2].swap, 4);
  assert.equal(plan.days[4].swap, null);
});

test("a condition, not a fallback, is left out", () => {
  const plan = weatherPlan({ tripTypeSlug: "winter-sports", itinerary: [day(1, { morning: "It holds cold snow when everything else is turning." }), day(2), day(3)] });
  assert.equal(plan.days[0].fallback, null);
});

test("water days group by the conditions they need, travel days apart", () => {
  const plan = weatherPlan({
    tripTypeSlug: "water-sports",
    itinerary: [
      day(1, { title: "Arrive and read the coast" }),
      day(2, { title: "Kite the lagoon" }),
      day(3, { title: "Sea kayak to the caves" }),
      day(4, { title: "Rest day on land" }),
      day(5, { title: "Dawn session and out" }),
    ],
  });
  const needs = Object.fromEntries(plan.groups.options.map((g) => [g.need, g.days.map((d) => d.day)]));
  assert.deepEqual(needs, { wind: [2], calm: [3], any: [4] });
  assert.deepEqual(plan.groups.travel.map((d) => d.day), [1, 5]);
});
