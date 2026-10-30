// T863 to T866 (plan flow v3 Batch D): the four doors. The words preselect a
// door (lib/plan/doors.js suggestDoor, parseTrip's flight-first words), a
// finder plan lands on the trip page as the planner's hand-over
// (selectionOfPlan), Find my flight first lists one priced row a place
// cheapest first (lib/recommend/doorTrips.js flightRows), I know where
// drafts a priced route through the named towns (knowTrip), and the
// bookings anchor a trip with the booked parts kept the traveller's own
// (bookedTrip; quoteTrip never puts Google's fare over a booked flight).
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { bookedTrip, selectionOfPlan, suggestDoor, DOORS } from "../src/lib/plan/doors.js";
import { parseTrip, applyTrip } from "../src/lib/plan/parseTrip.js";
import { normalizeSettings, fromImports, TRIP_DOORS } from "../src/planner/flow/tripSettings.js";
import { tellSettings } from "../src/planner/flow/tellChips.js";
import { flightRows, knowTrip, flightOf } from "../src/lib/recommend/doorTrips.js";
import { planOf } from "../src/planner/finder/planOf.js";
import { quoteTrip, wizardPlannerState } from "../src/lib/tripTotal.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const raw = existsSync(pub("app_data.json")) ? JSON.parse(readFileSync(pub("app_data.json"), "utf8")) : null;
const skip = raw ? false : "public/app_data.json is not on this machine";
const destinations = raw ? (Array.isArray(raw.destinations) ? Object.fromEntries(raw.destinations.map((d) => [d.id, d])) : raw.destinations) : {};
const data = raw ? { ...raw, destinations } : null;

function sweep(minutesAgo = 30) {
  const f = fixture("tf1-flights-BRU.json");
  const at = Math.floor(Date.now() / 60000) - minutesAgo;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at;
  return f;
}
const BRU = { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" };
const answers = (extra = {}) => normalizeSettings({
  answered: ["who", "when"], party: { kind: "couple", adults: 2 },
  when: { mode: "exact", start: "2026-11-21", end: "2026-11-28", nights: 7 },
  guide: { likes: [] },
  ...extra,
});
const inputOf = (settings) => {
  const flights = sweep();
  return { data: { ...data, flights }, settings, origin: BRU, flights, today: "2026-10-30", layerIndexes: {} };
};

test("the four doors, and the words preselect one", () => {
  assert.deepEqual(DOORS, ["guide", "flight", "know", "booked"]);
  assert.deepEqual(TRIP_DOORS, DOORS);
  assert.equal(suggestDoor(normalizeSettings({})), "guide");
  assert.equal(suggestDoor(normalizeSettings({ places: [{ kind: "country", id: "PT", name: "Portugal", iso2: "PT", country: "Portugal" }] })), "know");
  assert.equal(suggestDoor(normalizeSettings({ booked: { flights: true } })), "booked");
  // A booking wins over a named place: the trip is built around it.
  assert.equal(suggestDoor(normalizeSettings({ booked: { stays: true }, places: [{ kind: "country", id: "PT", name: "Portugal" }] })), "booked");
  // A door already chosen (or said) is kept.
  assert.equal(suggestDoor(normalizeSettings({ door: "flight", places: [{ kind: "country", id: "PT", name: "Portugal" }] })), "flight");
  assert.equal(normalizeSettings({ door: "ready" }).door, "", "an old or unknown door is dropped");
});

test("flight-first words choose the door in six languages, and only those words", () => {
  const said = (text, lang) => parseTrip(text, { lang }).fields.door?.value || "";
  assert.equal(said("Just a cheap flight to somewhere warm in March", "en"), "flight");
  assert.equal(said("Find me a flight first, two of us", "en"), "flight");
  assert.equal(said("Eerst de vlucht, in mei", "nl"), "flight");
  assert.equal(said("Nur den Flug bitte, im Juni", "de"), "flight");
  assert.equal(said("Juste le vol, en juillet", "fr"), "flight");
  assert.equal(said("Solo el vuelo, en agosto", "es"), "flight");
  assert.equal(said("Solo il volo, a settembre", "it"), "flight");
  assert.equal(said("A week in Portugal by plane", "en"), "");
  assert.equal(said("We fly to Lisbon in May", "en"), "");
  const { patch, answered } = applyTrip(normalizeSettings({}), parseTrip("just a cheap flight", { lang: "en" }));
  assert.equal(patch.door, "flight");
  assert.ok(answered.includes("doors"));
  // Through Tell Carta's chips the door is the words', and leaves with them.
  const a = tellSettings(normalizeSettings({}), parseTrip("just a cheap flight", { lang: "en" }));
  assert.equal(a.settings.door, "flight");
  const b = tellSettings(a.settings, parseTrip("a week away", { lang: "en" }));
  assert.equal(b.settings.door, "");
});

test("a finder plan is the planner's hand-over, its flight held each way", () => {
  const plan = {
    order: ["LIS", "OPO"], nights: { LIS: 4, OPO: 3 }, startDate: "2027-05-08", endDate: "2027-05-15",
    party: { adults: 2, children: 1, babies: 0 }, anchorId: "LIS", returnAnchorId: "OPO", anchorOrigin: "EIN",
    transport: "auto", stayTier: "hotel3", lifestyle: { food: 1 },
    flights: { out: { from: "EIN", to: "LIS", date: "2027-05-08", price: 80 }, back: { from: "OPO", to: "EIN", date: "2027-05-15", price: 90 } },
  };
  const s = selectionOfPlan(plan, { label: "May" });
  assert.deepEqual(s.stops.map((x) => [x.destinationId, x.nights]), [["LIS", 4], ["OPO", 3]]);
  assert.equal(s.startDate, "2027-05-08");
  assert.equal(s.groupSize, 2);
  assert.equal(s.children, 1);
  assert.equal(s.anchorOrigin, "EIN");
  assert.equal(s.flightPicks.out.price, 80);
  assert.equal(s.flightPicks.back.to, "EIN");
  assert.equal(s.stayTier, "hotel3");
  assert.equal(s.label, "May");
  assert.equal(selectionOfPlan({ order: [] }), null);
});

test("Find my flight first: one row a place, cheapest flight for the group first, each with both legs", { skip }, () => {
  const rows = flightRows(inputOf(answers()));
  assert.ok(rows.length >= 3, `rows: ${rows.length}`);
  const fares = rows.map((r) => r.flight.eurGroup);
  assert.deepEqual(fares, [...fares].sort((a, b) => a - b), "cheapest first");
  assert.equal(new Set(rows.map((r) => r.trip.gateway.iata)).size, rows.length, "one row an airport");
  for (const r of rows) {
    assert.equal(r.trip.places.length, 1, "one base");
    assert.ok(r.flight.facts.out.airline && r.flight.facts.out.dep && r.flight.facts.back.arr);
    assert.equal(r.trip.dates.out, "2026-11-21");
    assert.equal(r.trip.nights, 7);
    assert.equal(flightOf(r.trip).eurGroup, r.flight.eurGroup);
  }
});

test("Find my flight first is narrowed by the answers: a named country, the budget", { skip }, () => {
  const cz = flightRows(inputOf(answers({ places: [{ kind: "country", id: "CZ", name: "Czechia", iso2: "CZ", country: "Czechia" }] })));
  assert.ok(cz.length >= 1);
  assert.ok(cz.every((r) => r.trip.iso2 === "CZ"), cz.map((r) => r.trip.iso2).join(","));
  const all = flightRows(inputOf(answers()));
  const cheapest = all[0].flight.eur;
  const tight = flightRows(inputOf(answers({ guide: { likes: [], budget: { kind: "total", eur: Math.floor(cheapest) + 1 } } })));
  assert.ok(tight.every((r) => r.flight.eur <= cheapest + 1 && r.trip.total.perPerson <= cheapest + 1));
  assert.ok(tight.length < all.length);
});

test("a flight row picked becomes a trip that prices the same flight", { skip }, () => {
  const input = inputOf(answers());
  const [row] = flightRows(input);
  const sel = selectionOfPlan(planOf(row.trip));
  const state = { ...wizardPlannerState(sel, { stayTier: sel.stayTier || "home", lifestyle: sel.lifestyle }), flightPicks: sel.flightPicks };
  const q = quoteTrip(state, { data: { ...input.data, meta: { ...input.data.meta, selected_origin: "BRU" } } });
  assert.equal(q.cartaFlight.out.price, row.flight.facts.out.price);
  assert.equal(q.cartaFlight.back.price, row.flight.facts.back.price);
});

test("I know where: the named towns are the route, in the order named, the nights split", { skip }, () => {
  const lj = { kind: "place", id: "LJU", name: "Ljubljana", iso2: "SI", country: "Slovenia" };
  const one = knowTrip(inputOf(answers({ places: [lj] })));
  assert.deepEqual(one.places, [{ id: "LJU", nights: 7 }]);
  assert.ok(one.total.group > 0);
  const two = knowTrip(inputOf(answers({ places: [lj, { kind: "place", id: "PRG", name: "Prague", iso2: "CZ", country: "Czechia" }] })));
  assert.deepEqual(two.places.map((p) => p.id), ["LJU", "PRG"]);
  assert.equal(two.places.reduce((n, p) => n + p.nights, 0), 7);
  const pt = knowTrip(inputOf(answers({ places: [{ kind: "country", id: "PT", name: "Portugal", iso2: "PT", country: "Portugal" }] })));
  assert.equal(pt.iso2, "PT");
  assert.equal(knowTrip(inputOf(answers())), null, "nothing named, nothing built");
});

test("I've booked part of it: the bookings anchor the trip, the booked parts the traveller's own", { skip }, () => {
  let s = answers({ when: { mode: "exact", start: "", end: "", nights: 7 }, answered: [] });
  s = fromImports(s, [
    { kind: "flight_out", city: "Lisbon", title: "TAP", date: "2027-05-08", eur: 210 },
    { kind: "stay", city: "Lisbon", title: "Casa", date: "2027-05-08", eur: 400 },
    { kind: "stay", city: "Porto", title: "Ribeira", date: "2027-05-12", eur: 300 },
    { kind: "flight_home", city: "Porto", title: "TAP", date: "2027-05-15", eur: 190 },
  ]);
  const made = bookedTrip(s, destinations);
  assert.deepEqual(made.selection.stops.map((x) => [x.destinationId, x.nights]), [["LIS", 4], ["OPO", 3]]);
  assert.equal(made.selection.startDate, "2027-05-08");
  assert.deepEqual(made.selection.ownStays, { LIS: 400, OPO: 300 });
  assert.equal(made.selection.ownFlight.costOut, 210);
  assert.equal(made.selection.ownFlight.costBack, 190);
  assert.equal(made.selection.ownFlight.booked, true);
  assert.equal(made.selection.anchorId, "LIS");
  assert.deepEqual(made.booked, { flights: true, stays: ["LIS", "OPO"] });

  // Only a flight: the town it lands in is the one base for the nights; Carta fills the rest.
  const f = bookedTrip(fromImports(answers({ answered: [] }), [{ kind: "flight_out", city: "Prague", date: "2026-11-21", eur: null }]), destinations);
  assert.deepEqual(f.selection.stops.map((x) => x.destinationId), ["PRG"]);
  assert.equal(f.selection.ownFlight.booked, true);
  assert.equal(f.selection.ownFlight.costTotal, 0);
  assert.deepEqual(f.booked.stays, []);

  // A booked flight with no price is still theirs: no Google Flights fare in its place.
  const state = wizardPlannerState(f.selection, { stayTier: "home" });
  const q = quoteTrip(state, { data: { ...data, flights: sweep(), meta: { ...data.meta, selected_origin: "BRU" } } });
  assert.equal(q.cartaFlight, null);
  const free = quoteTrip({ ...state, ownFlight: null }, { data: { ...data, flights: sweep(), meta: { ...data.meta, selected_origin: "BRU" } } });
  assert.ok(free.cartaFlight, "without the booking Carta prices the flight");

  assert.equal(bookedTrip(fromImports(answers(), [{ kind: "stay", city: "Atlantis", date: "2027-05-08" }]), destinations), null);
});
