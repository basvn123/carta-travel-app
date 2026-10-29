// T795: the trip finder's flight slot (lib/recommend/adapters/flight.js).
// The card figure is Google Flights' swept fare for the trip's days (or the
// nearest swept day within the spread), bags and lap fees in, never older
// than flights.max_age_days, a typed fare winning; the picker's options are
// the live day list, grouped. Fixtures: tests/fixtures/tf1-flights-BRU.json
// (a trimmed real sweep file) and tf1-live-BRU-LJU.json (a hand-built day).
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildTrips, receiptOf } from "../src/lib/recommend/trips.js";
import { optionsFor, chooseFlight, SOURCE } from "../src/lib/recommend/adapters/flight.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { legCost } from "../src/lib/flights/flights.js";
import { BABY_LAP_FEE_LEG } from "../src/lib/party.js";
import { rule } from "../src/lib/price/config.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";
const layerIndexes = data ? {
  trails: read("trails/index.json"), beaches: read("beaches/index.json"), lakes: read("lakes/index.json"),
  mountains: read("mountains/index.json"), cycling: read("cycling/index.json"),
} : {};
const countryInsights = read("country_insights.json")?.countries || null;

/** The sweep fixture with every day's check time set to `minutesAgo` before now. */
function sweep(minutesAgo = 30) {
  const f = fixture("tf1-flights-BRU.json");
  const at = Math.floor(Date.now() / 60000) - minutesAgo;
  for (const side of [f.to, f.back]) {
    for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  }
  f.checked = at;
  return f;
}

const settings = (start, end, party = {}) => normalizeSettings({
  answered: ["who", "when"],
  party: { kind: "couple", adults: 2, ...party },
  when: { mode: "exact", start, end, nights: 7 },
  guide: { shapes: ["towns"], likes: ["hiking", "food"], weather: "mild", reach: "short", avoid: ["crowds"], budget: { kind: "total", eur: 1200 } },
});
const input = (s, over = {}) => ({
  data, countryInsights, layerIndexes, settings: s, origin: { iata: "BRU", lat: 50.85, lon: 4.35 },
  flights: sweep(), today: "2026-10-28", ...over,
});
const slovenia = (trips) => trips.find((t) => t.iso2 === "SI");
const flightOf = (t) => t.slots.find((s) => s.id === "flight");

test("the card figure is Google Flights' swept fare for the trip's days, bags in", { skip }, () => {
  const t = slovenia(buildTrips(input(settings("2026-11-21", "2026-11-28"))));
  assert.ok(t, "Slovenia is among the trips");
  assert.equal(t.gateway.iata, "LJU");
  const f = flightOf(t);
  const cf = t.quote.cartaFlight;
  assert.equal(f.eurGroup, Math.round(cf.out.cost.total + cf.back.cost.total));
  assert.equal(f.eur, Math.round(f.eurGroup / 2));
  assert.equal(f.quality, "measured");
  const p = f.pick.facts;
  assert.equal(p.source, "swept");
  assert.equal(p.attribution, SOURCE, "the figure is Google Flights', never Carta's");
  assert.equal(p.out.date, "2026-11-21");
  assert.equal(p.back.date, "2026-11-28");
  for (const leg of [p.out, p.back]) {
    assert.ok(leg.airline && leg.dep && leg.arr && Number.isFinite(leg.checked), "airline, times and check time");
    assert.ok(Number.isFinite(leg.bags), "the bag is priced");
  }
  assert.match(p.link, /^https:\/\/www\.google\.com\/travel\/flights\?q=/);
  // One bag on every flight (T691): the planner's bag, per seat.
  const planner = legCost({ price: 100, airline: p.out.airline }, { paying: 2, bagKey: t.state.baggage });
  assert.equal(planner.total, planner.fare + planner.bags);
});

test("one total: the card, the receipt and the trip's quoteTrip call agree", { skip }, () => {
  let exact = 0;
  for (const t of buildTrips(input(settings("2026-11-21", "2026-11-28")))) {
    assert.deepEqual(receiptOf(t).total, t.total);
    const f = flightOf(t);
    if (f.pick?.facts?.out?.date === t.dates.out && f.pick?.facts?.back?.date === t.dates.back) {
      const slots = t.slots.filter((s) => s.eurGroup != null).length;
      assert.ok(Math.abs(t.total.group - t.quote.grandTotal) <= slots, `${t.country}: ${t.total.group} against ${t.quote.grandTotal}`);
      exact += 1;
    }
  }
  assert.ok(exact > 0, "at least one trip flies on its exact days");
});

test("no fare on the exact day: the nearest swept day within the spread, with its own date", { skip }, () => {
  const f = sweep();
  const days = Object.keys(f.to.LJU).sort();
  // A day the sweep did not check, with a checked day near it.
  const missing = (() => {
    for (let i = 0; i < days.length - 1; i++) {
      const a = Date.parse(`${days[i]}T00:00:00Z`);
      const b = Date.parse(`${days[i + 1]}T00:00:00Z`);
      if (b - a >= 2 * 86400000) return new Date(a + 86400000).toISOString().slice(0, 10);
    }
    return null;
  })();
  assert.ok(missing, "the fixture has a gap");
  const back = new Date(Date.parse(`${missing}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const t = slovenia(buildTrips(input(settings(missing, back), { flights: f })));
  const fl = flightOf(t);
  assert.ok(fl.eur > 0, "priced from the nearest day");
  const spread = rule("flights.nearest_day_spread");
  const off = Math.abs(Date.parse(`${fl.pick.facts.out.date}T00:00:00Z`) - Date.parse(`${missing}T00:00:00Z`)) / 86400000;
  assert.ok(off >= 1 && off <= spread, `the leg keeps its own date, ${off} days off`);
  assert.deepEqual(receiptOf(t).total, t.total);
});

test("a stale sweep is no figure: NotYet, out of the sum, never 0", { skip }, () => {
  const stale = sweep(60 * 24 * 40);
  const t = slovenia(buildTrips(input(settings("2026-11-21", "2026-11-28"), { flights: stale })));
  const f = flightOf(t);
  assert.equal(f.eur, null);
  assert.equal(f.quality, "missing");
  assert.equal(t.total.perPerson, t.slots.filter((s) => s.eur != null).reduce((n, s) => n + s.eur, 0));
});

test("a fare the traveller typed replaces Google Flights' and is theirs", { skip }, () => {
  const own = { mode: "fly", airline: "", costTotal: 300, costOut: 160, costBack: 140, outDate: "2026-11-21", retDate: "2026-11-28" };
  const t = slovenia(buildTrips(input(settings("2026-11-21", "2026-11-28"), { ownFlight: own })));
  const f = flightOf(t);
  assert.equal(f.pick.id, "yours");
  assert.equal(f.eurGroup, 300);
  assert.equal(f.pick.facts.attribution, null, "a typed fare is not Google Flights'");
});

test("babies fly on a lap for the configured fee a leg (row T713-a)", { skip }, () => {
  const two = slovenia(buildTrips(input(settings("2026-11-21", "2026-11-28"))));
  const baby = slovenia(buildTrips(input(settings("2026-11-21", "2026-11-28", { babies: 1 }))));
  assert.equal(baby.quote.cartaFlight.out.cost.lap, BABY_LAP_FEE_LEG);
  assert.equal(baby.quote.cartaFlight.back.cost.lap, BABY_LAP_FEE_LEG);
  assert.equal(flightOf(baby).eurGroup - flightOf(two).eurGroup, Math.round(2 * BABY_LAP_FEE_LEG));
});

test("the picker: the live day grouped cheapest, quickest and best times, each with its delta", { skip }, async () => {
  const t = slovenia(buildTrips(input(settings("2026-11-21", "2026-11-28"))));
  const live = fixture("tf1-live-BRU-LJU.json");
  const asked = [];
  const fetchDay = async (o, d, date) => { asked.push(`${o}-${d}-${date}`); return o === "BRU" ? live : null; };
  const before = JSON.stringify(t.slots);
  const opts = await optionsFor(t, { fetchDay });
  assert.deepEqual(asked, ["BRU-LJU-2026-11-21", "LJU-BRU-2026-11-28"]);
  assert.equal(opts.source, SOURCE);
  assert.equal(opts.back, null, "a day that could not be searched has no options");
  const g = opts.out.groups;
  assert.equal(g.cheapest[0].facts.airline, "FR");
  assert.equal(g.quickest[0].facts.airline, "SN", "a direct flight is the quickest");
  assert.equal(g.times[0].facts.stops, 0, "best times put the direct daytime flight first");
  for (const o of [...g.cheapest, ...g.quickest, ...g.times]) {
    for (const k of ["airline", "dep", "arr", "stops", "minutes", "checked"]) assert.ok(o.facts[k] != null, `${o.id} has ${k}`);
    assert.equal(o.delta, o.eur - flightOf(t).eur);
  }
  const cheaper = g.cheapest[0];
  const curOut = flightOf(t).pick.facts.out.perSeat * 2;
  assert.equal(cheaper.eurGroup, flightOf(t).eurGroup - curOut + cheaper.legGroup);
  assert.equal(JSON.stringify(t.slots), before, "the card never changes while the picker loads");
  assert.equal(await optionsFor({ ...t, gateway: null }, { fetchDay }), null);
});

test("every slot follows the contract", { skip }, () => {
  const keys = ["id", "order", "labelKey", "owner", "eur", "pick", "options", "because", "quality"];
  for (const t of buildTrips(input(settings("2026-11-21", "2026-11-28")))) {
    for (const s of t.slots) {
      for (const k of keys) assert.ok(k in s, `${s.id} has ${k}`);
      assert.ok(["carta", "you"].includes(s.owner));
      assert.ok(["live", "measured", "modelled", "missing"].includes(s.quality));
      if (s.eur == null) assert.equal(s.quality === "missing" || s.id === "activities", true);
    }
  }
});

test("T800: choosing a live flight moves the slot by that leg, in any order", { skip }, async () => {
  const t = slovenia(buildTrips(input(settings("2026-11-21", "2026-11-28"))));
  const live = fixture("tf1-live-BRU-LJU.json");
  const opts = await optionsFor(t, { fetchDay: async () => live });
  const out = opts.out.groups.cheapest[0];
  const back = opts.back.groups.quickest[0];
  const withSlot = (trip, slot) => ({ ...trip, slots: trip.slots.map((s) => (s.id === slot.id ? slot : s)) });
  const a = chooseFlight(t, out);
  assert.equal(a.eur, out.eur, "the slot takes the option's own figure");
  assert.equal(a.pick.id, "live");
  assert.equal(a.pick.facts.attribution, SOURCE);
  assert.equal(a.pick.facts.out.airline, out.facts.airline);
  assert.equal(a.pick.facts.out.price, live.flights.find((f) => f.flightNo === out.facts.flightNo).price, "the fare per seat travels with the pick");
  const ab = chooseFlight(withSlot(t, a), back);
  const ba = chooseFlight(withSlot(t, chooseFlight(t, back)), out);
  assert.equal(ab.eurGroup, ba.eurGroup, "out then back equals back then out");
  assert.equal(ab.eurGroup, Math.round(flightOf(t).eurGroup - flightOf(t).pick.facts.out.perSeat * 2 - flightOf(t).pick.facts.back.perSeat * 2 + out.legGroup + back.legGroup));
  assert.equal(chooseFlight(t, { ...out, legGroup: null }), flightOf(t), "an option without a figure changes nothing");
});
