// G12 plan rethink, browser pass 2: a typed booking sentence with prices.
// Each booked part is read with its own price (lib/plan/parseTrip.js
// bookedParts), the money stays on the booked rows and never becomes the
// budget unless the words say budget, the rows reach the trip page as the
// traveller's (doors.js bookedLanding) and the receipt reads "Paid · Still to
// plan" (bookedReceipt.js bookedSplit). Run: npm test (continent-app/). The
// catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseTrip, tripVocab, applyTrip, saidImports } from "../src/lib/plan/parseTrip.js";
import { bookedLanding, bookedTrip } from "../src/lib/plan/doors.js";
import { bookedSplit } from "../src/lib/plan/bookedReceipt.js";
import { defaultSettings, normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { tellSettings } from "../src/planner/flow/tellChips.js";
import { quoteTrip, wizardPlannerState } from "../src/lib/tripTotal.js";

const TODAY = "2026-11-25";
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const HAVE = existsSync(pub("app_data.json")) && existsSync(pub("search_index.json"));
const skip = HAVE ? false : "public/app_data.json is not on this machine";

let CTX = null;
function ctx() {
  if (CTX) return CTX;
  const raw = JSON.parse(readFileSync(pub("app_data.json"), "utf8"));
  const rows = Array.isArray(raw.destinations) ? raw.destinations : Object.values(raw.destinations);
  const destinations = Object.fromEntries(rows.map((d) => [d.id, d]));
  const index = JSON.parse(readFileSync(pub("search_index.json"), "utf8"));
  const lexicon = existsSync(pub("search/ask/lexicon.json")) ? JSON.parse(readFileSync(pub("search/ask/lexicon.json"), "utf8")) : null;
  CTX = { raw, destinations, index, lexicon, vocabs: new Map() };
  return CTX;
}
function read(lang, text) {
  const c = ctx();
  if (!c.vocabs.has(lang)) c.vocabs.set(lang, tripVocab({ destinations: c.destinations, lang, index: c.index, lexicon: c.lexicon }));
  return parseTrip(text, { vocab: c.vocabs.get(lang), lang, today: TODAY, destinations: c.destinations, origins: c.raw.meta?.origins || {} });
}
/** The sentence as the Tell field reads it: the settings it makes. */
function told(lang, text, base = defaultSettings()) {
  return tellSettings(base, read(lang, text)).settings;
}
const parts = (p) => (p.fields.bookedParts?.value || []).map((x) => [x.kind, x.eur, x.city]);

// [lang, sentence, booked parts [kind, eur, city], budget eur or null]
const CASES = [
  ["nl", "vlucht naar Lissabon 3 mei €180 geboekt, hotel 4 nachten €420 geboekt",
    [["flight", 180, "Lisbon"], ["stay", 420, "Lisbon"]], null],
  ["en", "flight to Lisbon on 3 May for 280 euros booked, hotel in Lisbon 4 nights for 900 euros booked",
    [["flight", 280, "Lisbon"], ["stay", 900, "Lisbon"]], null],
  ["en", "Flight to Rome booked for €240, 5 to 12 June. Hotel booked, 7 nights, €700",
    [["flight", 240, "Rome"], ["stay", 700, "Rome"]], null],
  ["nl", "We hebben de vlucht naar Porto al geboekt voor 2 personen, 310 euro, budget 1500",
    [["flight", 310, "Porto"]], 1500],
];

for (const [lang, text, want, budget] of CASES) {
  test(`booked parts with their own price, money never the budget unless said: ${text}`, { skip }, () => {
    const p = read(lang, text);
    assert.deepEqual(parts(p), want);
    assert.equal(p.fields.budget?.value?.eur ?? null, budget);
    const kinds = new Set(want.map(([k]) => (k === "flight" ? "flights" : "stays")));
    for (const k of ["flights", "stays"]) assert.equal(p.fields.booked.value[k], kinds.has(k), k);
  });
}

test("a part not booked, or the money after a budget word, is no booked price", { skip }, () => {
  const p = read("en", "Flight to Lisbon booked, hotel not booked yet, budget €900");
  assert.deepEqual(parts(p), [["flight", null, "Lisbon"]]);
  assert.equal(p.fields.booked.value.stays, false);
  assert.equal(p.fields.budget.value.eur, 900);
  // No booking word at all: the money is the budget, as before.
  const q = read("nl", "Een week naar Lissabon in mei, 1500 euro");
  assert.equal(q.fields.bookedParts, undefined);
  assert.equal(q.fields.budget.value.eur, 1500);
});

test("the sentence's rows land on the trip page as the traveller's, the receipt splits Paid and Still to plan", { skip }, () => {
  const { raw, destinations } = ctx();
  const s = told("nl", "vlucht naar Lissabon 3 mei €180 geboekt, hotel 4 nachten €420 geboekt");
  assert.ok(!(s.guide.budget?.eur > 0), "no budget from booked prices");
  assert.deepEqual(s.imports.map((b) => [b.kind, b.city, b.eur, b.said]), [["flight", "Lisbon", 180, true], ["stay", "Lisbon", 420, true]]);
  const land = bookedLanding(s, destinations);
  assert.deepEqual(land.stops.map((x) => [x.destinationId, x.nights]), [["LIS", 4]]);
  assert.equal(land.ownFlight.costTotal, 180);
  assert.deepEqual(land.ownStays, { LIS: 420 });
  assert.deepEqual(land.booked, { flights: true, stays: ["LIS"] });
  const made = bookedTrip(s, destinations);
  const q = quoteTrip(wizardPlannerState(made.selection, { stayTier: "home" }), { data: { ...raw, destinations } });
  const split = bookedSplit(q);
  assert.equal(split.paid, 600, "the flight and the hotel, as typed");
  assert.ok(split.toPlan > 0 && Math.abs(split.paid + split.toPlan - q.grandTotal) < 0.01);
  assert.deepEqual(split.unpriced, []);
});

test("rows the words made follow the words; a file's rows win over them", { skip }, () => {
  const s = told("en", "Flight to Rome booked for €240, 5 to 12 June. Hotel booked, 7 nights, €700");
  assert.equal(s.imports.length, 2);
  // The booking words deleted: their rows go too.
  const again = tellSettings(s, read("en", "Rome, 5 to 12 June")).settings;
  assert.deepEqual(again.imports, []);
  // An upload (parse-booking) first: the words add no second flight.
  const file = normalizeSettings({ ...defaultSettings(), imports: [{ kind: "flight_out", city: "Rome", date: "2027-06-05", eur: 199, title: "ITA" }] });
  const both = told("en", "Flight to Rome booked for €240, 5 to 12 June", file);
  assert.deepEqual(both.imports.map((b) => [b.kind, b.eur, Boolean(b.said)]), [["flight_out", 199, false]]);
});

test("saidImports: a price per person is the party's; a part with no known town makes no row", () => {
  const when = { mode: "exact", start: "2027-05-03", end: "2027-05-07" };
  const rows = saidImports([{ kind: "flight", eur: 150, per: "person", city: "Lisbon" }, { kind: "stay", eur: null, per: "group", city: "" }], when, { adults: 2, kids: 1 });
  assert.deepEqual(rows, [{ kind: "flight", title: "", city: "Lisbon", date: "2027-05-03", eur: 450, code: "", link: "", said: true }]);
  const plain = applyTrip(defaultSettings(), { fields: { booked: { value: { flights: true } } } });
  assert.equal(plain.patch.imports, undefined, "no parts: no rows, the typed-flight fallback stands");
});
