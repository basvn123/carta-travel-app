// T867 to T869: searching, Trips for you's layout A and the card
// (src/planner/finder/finderText.js, priceSlices.js). Pure helpers only, no
// DOM: the stages name the answers and only real work, pricing a slice at a
// time gives buildTrips' own list, the sorts, the answers line naming the
// places (row T859-b), and the card's one line and group total.
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  airportTowns, answersLine, cardLine, groupHead, placeChips, sortTrips, stageLines, thereMinutes, SORTS,
} from "../src/planner/finder/finderText.js";
import { priceInSlices, EARLY } from "../src/planner/finder/priceSlices.js";
import { buildTrips } from "../src/lib/recommend/trips.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const t = (k, v = {}) => `${k}${Object.keys(v).length ? JSON.stringify(v) : ""}`;
const slot = (id, eur, pick = null) => ({ id, eur, eurGroup: eur == null ? null : eur * 2, owner: "carta", pick });
const trip = (id, { group = 1000, flight = 100, out = null, gw = 30, door = null, places = 1 } = {}) => ({
  id,
  places: Array.from({ length: places }, (_, i) => ({ id: `${id}${i}`, nights: 3 })),
  gateway: { iata: "X", minutes: gw },
  party: { adults: 2, children: 0, babies: 0, head: 2 },
  slots: [slot("flight", flight, out ? { id: "f", facts: { out: { ...out, minutes: door } } } : null), slot("stay", 300), slot("food", 200)],
  total: { perPerson: group / 2, group },
  reasons: [{ key: "tf.reason.x", facts: {} }],
  catch: { key: "tf.catch.y", facts: {} },
});

test("T867: the stages name the airports' towns, the dates or months, who goes and the likes", () => {
  const data = { meta: { home_airports: [{ iata: "BRU", city: "Brussels" }, { iata: "CRL", city: "Charleroi" }, { iata: "EIN", city: "Eindhoven" }] } };
  assert.deepEqual(airportTowns(data), ["Brussels", "Charleroi", "Eindhoven"]);
  assert.deepEqual(airportTowns({ meta: {} }, { iata: "BRU", name: "Brussels" }), ["Brussels"], "no ticked airports: the one origin");
  const s = normalizeSettings({
    party: { kind: "couple", adults: 2 }, when: { mode: "months", months: [12], nights: 7 },
    guide: { likes: ["food"] },
  });
  const lines = stageLines(s, { t, lang: "en", when: { start: "December", end: "7 nights" }, data, stayTier: "hotel3" });
  assert.deepEqual(lines.map((l) => l.key), ["flights", "stays", "likes"], "three stages of real work, no separate food stage");
  assert.ok(lines[0].text.startsWith("tf.stage.flightsIn"));
  assert.ok(lines[0].text.includes("Brussels, Charleroi and Eindhoven") && lines[0].text.includes("December"));
  assert.ok(lines[1].text.startsWith("tf.stage.stay.hotel3") && lines[1].text.includes("plan.partyAdultMany"));
  assert.ok(lines[2].text.startsWith("tf.load.likes"));
});

test("T867: a stage with nothing to do has no line", () => {
  const s = normalizeSettings({});
  const lines = stageLines(s, { t, lang: "en", when: { start: "", end: "" }, data: { meta: {} }, origin: null });
  assert.deepEqual(lines.map((l) => l.key), ["stays", "likes"], "no home airport: no flight line");
  const exact = normalizeSettings({ when: { mode: "exact", start: "2026-12-05", end: "2026-12-12" } });
  const l2 = stageLines(exact, { t, lang: "en", when: { start: "5 Dec", end: "12 Dec" }, data: { meta: { home_airports: [{ iata: "BRU", city: "Brussels" }] } } });
  assert.ok(l2[0].text.startsWith("tf.load.flights") && l2[0].text.includes("tf.chip.dates"));
  assert.ok(l2[1].text.includes('"n":7'), "the dates' own nights");
});

test("T868: the answers line names the places first (row T859-b), then from, when, who, the likes", () => {
  const s = normalizeSettings({
    party: { kind: "couple", adults: 2 },
    places: [{ kind: "place", id: "cz_prague", name: "Prague", iso2: "CZ" }, { kind: "country", id: "AT", name: "Austria" }],
    guide: { likes: ["food", "culture"], weather: "mild", budget: { kind: "total", eur: 1500 } },
  });
  const a = answersLine(s, { t, lang: "en", originName: "Ghent", when: null, trip: null, locale: "en" });
  assert.ok(a.line.startsWith("Prague and Austria, tf.chip.from"), a.line);
  assert.ok(a.line.includes("plan.partyAdultMany"));
  assert.equal(a.rest, 2, "the weather and the budget wait under Edit answers");
  assert.deepEqual(placeChips(s).map((c) => c.q), ["tell", "tell"], "a place reopens Tell Carta");
  assert.ok(a.chips.some((c) => c.q === "who"), "who goes can be changed too");
  assert.equal(new Set(a.chips.map((c) => c.id)).size, a.chips.length, "each answer once");
});

test("T868: the sorts; ties keep the ranked order", () => {
  assert.deepEqual(SORTS, ["match", "cheapest", "shortest"]);
  const ranked = [
    trip("a", { group: 1900, out: { dep: "06:15", arr: "09:40" }, gw: 20 }),
    trip("b", { group: 1600, out: { dep: "10:00", arr: "11:05" }, gw: 60 }),
    trip("c", { group: 1600, flight: null }),
    trip("d", { group: 1700, out: { dep: "08:00", arr: "09:00" }, door: 70, gw: 10 }),
  ];
  assert.deepEqual(sortTrips(ranked, "match").map((x) => x.id), ["a", "b", "c", "d"]);
  assert.deepEqual(sortTrips(ranked, "cheapest").map((x) => x.id), ["b", "d", "a", "c"], "a total without the flight goes after the whole ones");
  assert.equal(thereMinutes(ranked[0]), 225, "clock times plus the transfer");
  assert.equal(thereMinutes(ranked[3]), 80, "door to door when the flight carries its minutes");
  assert.equal(thereMinutes(ranked[2]), null);
  assert.deepEqual(sortTrips(ranked, "shortest").map((x) => x.id), ["d", "b", "a", "c"], "unknown last");
  assert.notEqual(sortTrips(ranked, "match"), ranked, "a new array");
});

test("T869: the card's line and the group it is priced for", () => {
  const x = trip("a");
  assert.deepEqual(cardLine(x, { t, lang: "en" }), { reason: "tf.reason.x", caught: "tf.catch.y" });
  assert.deepEqual(cardLine({ ...x, reasons: [], catch: null }, { t, lang: "en" }), { reason: "", caught: "" });
  assert.equal(groupHead(x), 2);
  assert.equal(groupHead({ party: { head: 2, babies: 1 } }), 3, "a baby counts, as on the preview");
  assert.equal(groupHead({ party: null }), 1);
});

// The real engine: pricing a slice at a time is buildTrips' own list.
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";

test("T867: slices give buildTrips' trips in the same order, the first ones early", { skip }, async () => {
  const settings = normalizeSettings({
    answered: ["who", "when"], party: { kind: "couple", adults: 2 }, priority: "balance",
    when: { mode: "exact", start: "2027-05-09", end: "2027-05-16", nights: 7 },
    guide: { shapes: ["towns"], likes: ["hiking", "food"], weather: "mild", reach: "short" },
  });
  const input = { data, settings, origin: { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" }, today: "2026-10-28" };
  const seen = [];
  let frames = 0;
  const sliced = await priceInSlices({ ...input, data: { ...data } }, { sliceMs: 0, onSome: (some) => seen.push(some.length), yieldFrame: async () => { frames += 1; } });
  const whole = buildTrips(input);
  assert.deepEqual(sliced.map((x) => x.id), whole.map((x) => x.id));
  assert.deepEqual(sliced.map((x) => x.total), whole.map((x) => x.total), "the same totals");
  assert.ok(seen.length > 0 && frames === seen.length, "the browser paints between slices");
  assert.ok(seen.every((n, i) => i === 0 || n > seen[i - 1]), "each slice adds trips");
  assert.ok(EARLY >= 1);
  const again = await priceInSlices({ ...input, data: input.data }, {});
  const twice = await priceInSlices({ ...input, data: input.data }, { onSome: () => assert.fail("memoised: nothing priced again") });
  assert.equal(again, twice, "the same answers price nothing the second time");
});
