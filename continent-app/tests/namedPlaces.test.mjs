// T859: the places Tell Carta's words name carry through. They are the trip
// finder's only places (lib/recommend/candidates.js namedPool), they skip
// Help me choose's where questions (flowGraph guideScreens), two or more are
// a shortlist the trips come from, and the finder's hand-over keeps them
// (finder/handoff.js draftFor).
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildCandidates, namedPool } from "../src/lib/recommend/candidates.js";
import { guideScreens } from "../src/planner/flow/flowGraph.js";
import { draftFor } from "../src/planner/finder/handoff.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const data = existsSync(pub("app_data.json")) ? JSON.parse(readFileSync(pub("app_data.json"), "utf8")) : null;
const skip = data ? false : "public/app_data.json is not on this machine";
const destinations = data ? (Array.isArray(data.destinations) ? Object.fromEntries(data.destinations.map((d) => [d.id, d])) : data.destinations) : {};
const BRUSSELS = { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" };

const settings = (places, guide = {}) => normalizeSettings({
  answered: ["who", "when"],
  party: { kind: "couple", adults: 2 },
  when: { mode: "exact", start: "2027-05-08", end: "2027-05-15", nights: 7 },
  guide: { shapes: [], likes: ["food"], ...guide },
  places,
});
const build = (s) => buildCandidates({ data, settings: s, origin: BRUSSELS, flights: null, today: "2026-10-30" });
const country = (iso2, name) => ({ kind: "country", id: iso2, name, iso2, country: name });
const town = (id) => ({ kind: "place", id, name: destinations[id]?.city || id, iso2: destinations[id]?.iso2 || "", country: destinations[id]?.country || "" });

test("named places skip the where questions; a town skips what they like too", () => {
  const none = guideScreens(normalizeSettings({}));
  assert.ok(none.includes("g:weather") && none.includes("g:reach") && none.includes("g:likes"));
  const pt = guideScreens(normalizeSettings({ places: [country("PT", "Portugal")] }));
  assert.ok(!pt.includes("g:weather") && !pt.includes("g:reach"));
  assert.ok(pt.includes("g:likes") && pt.includes("g:shape") && pt.includes("g:budget") && pt.includes("g:trips"));
  const lis = guideScreens(normalizeSettings({ places: [{ kind: "place", id: "LIS", name: "Lisbon", country: "Portugal" }] }));
  assert.ok(!lis.includes("g:likes") && !lis.includes("g:weather"));
  assert.ok(lis.includes("g:avoid") && lis.includes("g:pick"));
});

test("draftFor keeps the countries already picked, the trip's own first, three at most", () => {
  const plan = { country: "Spain", nights: 7, order: ["BCN"], yours: [] };
  const d = draftFor(plan, ["Getting", "Finish"], ["Portugal", "Spain", "France", "Italy"]);
  assert.deepEqual(d.countries, ["Spain", "Portugal", "France"]);
  assert.deepEqual(draftFor(plan, ["Getting", "Finish"]).countries, ["Spain"]);
  assert.equal(draftFor(plan, ["Getting", "Finish"]).finder, plan);
});

test("no places named: the pool is null and the finder ranks countries as before", () => {
  assert.equal(namedPool([], { destinations }), null);
  assert.equal(namedPool(undefined, { destinations }), null);
});

test("one named country: every trip is in it", { skip }, () => {
  const trips = build(settings([country("PT", "Portugal")]));
  assert.ok(trips.length >= 3, `trips: ${trips.length}`);
  assert.ok(trips.every((c) => c.iso2 === "PT"), trips.map((c) => c.iso2).join(","));
});

test("two named countries are a shortlist: trips in both, in no other", { skip }, () => {
  const trips = build(settings([country("PT", "Portugal"), country("ES", "Spain")]));
  const isos = new Set(trips.map((c) => c.iso2));
  assert.deepEqual([...isos].sort(), ["ES", "PT"]);
});

test("a named country with no likes still gives trips (its best places)", { skip }, () => {
  const trips = build(settings([country("SI", "Slovenia")], { likes: [] }));
  assert.ok(trips.length >= 1);
  assert.ok(trips.every((c) => c.iso2 === "SI"));
});

test("named towns each start a trip of their own, in their country", { skip }, () => {
  const ids = ["LIS", "OPO"].filter((id) => destinations[id]);
  assert.equal(ids.length, 2, "Lisbon and Porto are in the catalogue");
  const trips = build(settings(ids.map(town), { likes: [] }));
  const firsts = new Set(trips.map((c) => c.places[0].id));
  assert.ok(firsts.has("LIS") && firsts.has("OPO"), [...firsts].join(","));
  assert.ok(trips.every((c) => c.iso2 === "PT"));
  // Every trip holds a named town.
  assert.ok(trips.every((c) => c.places.some((p) => ids.includes(p.id))));
});

test("towns in two countries: each country's trips start from its town", { skip }, () => {
  const trips = build(settings([town("LIS"), town("PRG")], { likes: [] }));
  const lisbon = trips.filter((c) => c.iso2 === "PT");
  const prague = trips.filter((c) => c.iso2 === "CZ");
  assert.ok(lisbon.length && prague.length);
  assert.ok(lisbon.every((c) => c.places[0].id === "LIS") && prague.every((c) => c.places[0].id === "PRG"));
});
