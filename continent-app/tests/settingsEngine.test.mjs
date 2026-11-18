// G12 (D10), Lane 3: the Settings engine (src/lib/settings, lib/flights/pairs.js,
// lib/price/flight.js, request.js, display.js, urlState.js). One test per rule
// of .work/2026-11-18-search-settings contract.md and decision.md.
// Run: node --test tests/settingsEngine.test.mjs (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { en } from "../src/i18n/en.js";
import {
  readSettings, withDateMode, withMonth, withTripNights, withPriceSpan, withPriceView, withStart, withWay,
  nearestTown, countryStartTown, countryAirports, startCountryOf, grandTotal, priceFigure, priceSortValue,
  settingsSummary, makeSettingsSetters, wayRowsFor, wayKey, flightFiles, DEFAULT_TRIP_NIGHTS,
} from "../src/lib/settings/index.js";
import { cheapestPair, typicalFare, PAIR_SLACK, MIN_FARES } from "../src/lib/flights/pairs.js";
import { flightLegs, flightPrice, cheapestFlight } from "../src/lib/price/flight.js";
import { priceRequest, requestKey, flightWindow, DEFAULT_PRICE_REQUEST } from "../src/lib/price/request.js";
import { viewFactor, wayFactor, dayUnit, spanOf } from "../src/lib/price/display.js";
import { encodeState, decodeState } from "../src/lib/urlState.js";
import { notKnownWay, wayFor } from "../src/lib/travelWay.js";
import { legCost } from "../src/lib/flights/flights.js";
import { rule } from "../src/lib/price/config.js";
import { readFileSync } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import { monthFrom, atMonth } from "../src/lib/settings/monthFrom.js";
import { placeRow } from "../src/lib/settings/ways.js";
import { priceDays } from "../src/lib/price/priceDay.js";

const t = (k, v = {}) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n]);
const TODAY = "2026-11-18";
const NOW = Date.parse("2026-11-18T12:00:00Z");
const CHECKED = (NOW - 3600000) / 60000; // an hour ago, in minutes (publish.mjs)
const BAG = rule("request.default_bag");

// A sweep file: `to` and `back` per airport, [price, airline, dep, arr, stops, checkedMin].
const leg = (price, airline = "FR") => [price, airline, "08:00", "10:00", 0, CHECKED];
function file(from, routes) {
  const f = { from, to: {}, back: {} };
  for (const [ap, { to = {}, back = {} }] of Object.entries(routes)) {
    f.to[ap] = Object.fromEntries(Object.entries(to).map(([d, p]) => [d, p == null ? null : leg(p)]));
    f.back[ap] = Object.fromEntries(Object.entries(back).map(([d, p]) => [d, p == null ? null : leg(p)]));
  }
  return f;
}
const seat = (p) => legCost({ price: p, airline: "FR" }, { paying: 1, bagKey: BAG }).perSeat;

/* ---------------------------------------------------------------- model */

test("migration: state from before the model prices as it did", () => {
  const pair = { departDate: "2026-12-05", returnDate: "2026-12-12" };
  assert.equal(readSettings({}, { ...pair, ownDates: true, today: TODAY }).dateMode, "dates");
  assert.equal(readSettings({}, { ...pair, ownDates: false, today: TODAY }).dateMode, "any");
  const m = readSettings({}, { ...pair, dateFlex: "month", today: TODAY });
  assert.equal(m.dateMode, "month");
  assert.equal(m.month, "2026-12");
  assert.equal(readSettings({}, { ...pair, dateFlex: "any", today: TODAY }).dateMode, "any");
  // The Explore month filter won app-wide (B7): it still does for old state.
  const xm = readSettings({}, { ...pair, xm: 7, today: TODAY });
  assert.deepEqual([xm.dateMode, xm.month], ["month", "2027-07"]);
  // The pair's length is the old trip length; with no pair, the default.
  assert.equal(m.tripNights, 7);
  assert.equal(readSettings({}, { departDate: "2026-12-05", returnDate: "2026-12-15", dateFlex: "any" }).tripNights, 10);
  assert.equal(readSettings({}, {}).tripNights, DEFAULT_TRIP_NIGHTS);
  // App starts the new fields as null: null is "not set", never 0 or 1 night.
  assert.equal(readSettings({ trip_nights: null, date_mode: null, price_span: null, origin_kind: null }, {}).tripNights, DEFAULT_TRIP_NIGHTS);
  // An old group total was seats x nights: it reads as the whole trip.
  assert.equal(readSettings({ price_view: "total" }).priceSpan, "trip");
  assert.equal(readSettings({ price_view: "total", price_span: "day" }).priceSpan, "day");
  assert.equal(readSettings({}).priceSpan, "day");
  assert.equal(readSettings({}).originKind, "place");
});

test("a date_mode in the choices wins over the old readers (xm no longer moves a price)", () => {
  const m = readSettings({ date_mode: "any", trip_nights: 5 }, { xm: 7, dateFlex: "month", departDate: "2026-12-05" });
  assert.equal(m.dateMode, "any");
  assert.equal(m.nights, 5);
});

test("switching When modes keeps every other mode's value", () => {
  let c = { date_mode: "dates" };
  c = withMonth("2027-06")(c);
  c = withTripNights(9)(c);
  c = withDateMode("cheapest")(c);
  c = withDateMode("dates")(c);
  assert.equal(c.when_month, "2027-06");
  assert.equal(c.trip_nights, 9);
  const legacy = { departDate: "2026-12-05", returnDate: "2026-12-12", today: TODAY };
  assert.deepEqual(readSettings(c, legacy).dates, { start: "2026-12-05", end: "2026-12-12" });
  assert.equal(readSettings(c, legacy).nights, 7, "dates mode prices the pair's nights");
  c = withDateMode("month")(c);
  assert.equal(readSettings(c, legacy).month, "2027-06");
  assert.equal(readSettings(c, legacy).nights, 9);
});

test("updaters reject what the model does not know", () => {
  const c = { date_mode: "any", transport_mode: "train" };
  assert.equal(withDateMode("someday")(c), c);
  assert.equal(withMonth("2027-13")(c), c);
  assert.equal(withTripNights("x")(c), c);
  assert.equal(withTripNights(99)(c).trip_nights, 30);
  assert.equal(withTripNights(0)(c).trip_nights, 1);
  assert.equal(withWay("boat")(c), c);
  assert.equal(withPriceSpan("week")(c), c);
  assert.equal(withPriceView("nonsense")(c).price_view, "pp");
});

test("Start kinds: country keeps its airports, leaving it drops them", () => {
  let c = { origin_kind: "place", origins: ["CRL"], airport_hours: 2 };
  c = withStart("country", { country: "BE", airports: ["BRU", "CRL"], origin: "BRU" })(c);
  assert.deepEqual([c.origin_kind, c.origin_country, c.origins, c.airport_hours, c.origin], ["country", "BE", ["BRU", "CRL"], null, "BRU"]);
  const here = withStart("here", { town: "gem:bruges" })(c);
  assert.deepEqual([here.origin_kind, here.here_town, here.origin_country, here.origins], ["here", "gem:bruges", null, []]);
  assert.equal(readSettings(here).hereTown, "gem:bruges");
  assert.equal(readSettings({ ...here, origin_kind: "place" }).hereTown, null);
});

/* -------------------------------------------------------------- request */

test("the request carries the mode, the span and the start; cheapest flies its own window", () => {
  const base = { departDate: "2026-12-05", returnDate: "2026-12-12", today: TODAY };
  const cheap = priceRequest({ ...base, choices: { date_mode: "cheapest", trip_nights: 4 } });
  assert.equal(cheap.when.kind, "any", "the bed reads cheapest as any time");
  assert.equal(cheap.nights, 4);
  assert.deepEqual(flightWindow(cheap), { kind: "cheapest" });
  const month = priceRequest({ ...base, choices: { date_mode: "month", when_month: "2027-03", trip_nights: 6 } });
  assert.deepEqual([month.when.kind, month.when.month, month.when.ym, month.nights], ["month", 3, "2027-03", 6]);
  const dates = priceRequest({ ...base, choices: { date_mode: "dates" } });
  assert.deepEqual([dates.when.kind, dates.when.start, dates.nights, dates.dateMode], ["exact", "2026-12-05", 7, "dates"]);
  // Dates without a pair read as any time.
  assert.equal(priceRequest({ choices: { date_mode: "dates" } }).dateMode, "any");
  const pv = priceRequest({ choices: { price_view: "total", price_span: "day" } });
  assert.deepEqual([pv.view, pv.span], ["total", "day"]);
});

test("requestKey moves with every choice that moves a figure", () => {
  const a = priceRequest({ choices: { date_mode: "any" } });
  const keys = new Set([
    requestKey(a),
    requestKey(priceRequest({ choices: { date_mode: "cheapest" } })),
    requestKey(priceRequest({ choices: { date_mode: "any", price_span: "trip" } })),
    requestKey(priceRequest({ choices: { date_mode: "any", price_view: "total", price_span: "day" } })),
    requestKey(priceRequest({ choices: { date_mode: "any", transport_mode: "train" } })),
    requestKey(priceRequest({ choices: { date_mode: "any", origin: "BRU" } })),
    requestKey(priceRequest({ choices: { date_mode: "any", origin_kind: "country", origin_country: "BE" } })),
    requestKey(priceRequest({ choices: { date_mode: "any", drive_home: { lat: 51, lon: 4 } } })),
    requestKey(priceRequest({ choices: { date_mode: "month", when_month: "2027-03" } })),
    requestKey(priceRequest({ choices: { date_mode: "month", when_month: "2027-04" } })),
  ]);
  assert.equal(keys.size, 10);
});

test("one group rule: the span decides day or trip (the old seats x one day vs seats x nights clash)", () => {
  const req = (c) => priceRequest({ choices: { group_size: 3, trip_nights: 5, date_mode: "any", ...c } });
  assert.equal(viewFactor(req({ price_view: "pp", price_span: "day" })), 1);
  assert.equal(viewFactor(req({ price_view: "total", price_span: "day" })), 3);
  assert.equal(viewFactor(req({ price_view: "pp", price_span: "trip" })), 5);
  assert.equal(viewFactor(req({ price_view: "total", price_span: "trip" })), 15);
  assert.equal(wayFactor(req({ price_view: "total", price_span: "day" })), 3);
  // A request built without a span (older callers) reads total as the trip.
  assert.equal(spanOf({ ...DEFAULT_PRICE_REQUEST, view: "total" }), "trip");
  assert.equal(viewFactor({ ...DEFAULT_PRICE_REQUEST, view: "total", group: { adults: 2, children: 0, babies: 0 }, nights: 7 }), 14);
  assert.equal(dayUnit(t, req({ price_view: "total", price_span: "day" })), "a day for 3 people");
  assert.equal(dayUnit(t, req({ price_view: "pp", price_span: "trip" })), "for 1 person, 5 nights");
});

/* ---------------------------------------------------------------- fares */

const ROUTE = {
  to: { "2026-12-01": 40, "2026-12-03": 30, "2026-12-10": 80, "2027-01-05": 20 },
  back: { "2026-12-08": 50, "2026-12-11": 25, "2026-12-17": 60, "2027-01-13": 90 },
};

test("cheapest pair: the trip length plus or minus one day, the bag on both legs", () => {
  assert.equal(PAIR_SLACK, 1);
  const f = file("BRU", { LIS: ROUTE });
  const p = cheapestPair(f, "LIS", { nights: 7, now: NOW, bagKey: BAG });
  // Pairs of 6 to 8 nights: 12-01/12-08 (40+50), 12-03/12-11 (30+25), 12-10/12-17 (80+60), 01-05/01-13 (20+90).
  assert.deepEqual([p.out.date, p.back.date, p.nights], ["2026-12-03", "2026-12-11", 8]);
  assert.equal(p.perSeat, seat(30) + seat(25));
  // Month limits the way out only.
  const jan = cheapestPair(f, "LIS", { nights: 8, ym: "2027-01", now: NOW, bagKey: BAG });
  assert.deepEqual([jan.out.date, jan.back.date], ["2027-01-05", "2027-01-13"]);
  // No pair of that length: null, never a pair of another length.
  assert.equal(cheapestPair(f, "LIS", { nights: 20, now: NOW }), null);
});

test("cheapest pair: an exact length wins a tie; stale fares do not count", () => {
  const f = file("BRU", { OPO: { to: { "2026-12-01": 30 }, back: { "2026-12-07": 30, "2026-12-08": 30 } } });
  assert.equal(cheapestPair(f, "OPO", { nights: 7, now: NOW }).back.date, "2026-12-08");
  const stale = file("BRU", { OPO: { to: { "2026-12-01": 30 }, back: { "2026-12-08": 30 } } });
  stale.to.OPO["2026-12-01"][5] = (NOW - 40 * 86400000) / 60000;
  assert.equal(cheapestPair(stale, "OPO", { nights: 7, now: NOW }), null);
});

test("typical fare: the median each way, only with three fares each way", () => {
  assert.equal(MIN_FARES, 3);
  const f = file("BRU", { LIS: ROUTE, FAO: { to: { "2026-12-01": 40, "2026-12-02": 50 }, back: { "2026-12-09": 1, "2026-12-10": 2, "2026-12-11": 3 } } });
  const tf = typicalFare(f, "LIS", { now: NOW, bagKey: BAG });
  // out 20, 30, 40, 80 -> 35; back 25, 50, 60, 90 -> 55.
  assert.deepEqual([tf.out.price, tf.back.price, tf.typical, tf.out.date], [35, 55, true, null]);
  assert.equal(tf.perSeat, seat(35) + seat(55));
  assert.equal(typicalFare(f, "FAO", { now: NOW }), null, "two fares out is not enough");
  // An odd count takes the middle fare.
  const g = file("BRU", { X: { to: { "2026-12-01": 10, "2026-12-02": 30, "2026-12-03": 20 }, back: { "2026-12-09": 5, "2026-12-10": 9, "2026-12-11": 7 } } });
  assert.deepEqual([typicalFare(g, "X", { now: NOW }).out.price, typicalFare(g, "X", { now: NOW }).back.price], [20, 7]);
});

test("flight per mode: dates exact, month and cheapest checked else typical, any always typical", () => {
  const f = file("BRU", { LIS: ROUTE });
  const req = (c, extra = {}) => priceRequest({ choices: { date_mode: "any", ...c }, today: TODAY, ...extra });
  const any = flightPrice(f, "LIS", req({ date_mode: "any" }), NOW);
  assert.equal(any.typical, true);
  const cheap = flightPrice(f, "LIS", req({ date_mode: "cheapest", trip_nights: 7 }), NOW);
  assert.deepEqual([cheap.typical, cheap.out.date, cheap.from], [false, "2026-12-03", "BRU"]);
  const month = flightPrice(f, "LIS", req({ date_mode: "month", when_month: "2026-12", trip_nights: 7 }), NOW);
  assert.equal(month.out.date, "2026-12-03");
  const noPair = flightPrice(f, "LIS", req({ date_mode: "month", when_month: "2027-02", trip_nights: 7 }), NOW);
  assert.equal(noPair.typical, true, "a month without a pair falls back to typical");
  const dates = flightPrice(f, "LIS", req({ date_mode: "dates" }, { departDate: "2026-12-03", returnDate: "2026-12-11" }), NOW);
  assert.deepEqual([dates.typical, dates.out.date, dates.back.date], [false, "2026-12-03", "2026-12-11"]);
  // Checked legs only from flightLegs: the sheet's look-around never shows a median as a day.
  assert.equal(flightLegs(f, "LIS", req({ date_mode: "month", when_month: "2027-02" }), NOW), null);
  // The home airport itself has no flight.
  assert.equal(flightPrice(f, "BRU", req({}), NOW), null);
});

test("several home airports: a checked fare beats a cheaper typical one, then the cheapest", () => {
  const a = file("BRU", { LIS: ROUTE });
  const b = file("CRL", { LIS: { to: { "2026-12-01": 5, "2026-12-02": 5, "2026-12-20": 5 }, back: { "2026-12-30": 5, "2026-12-31": 5, "2027-01-30": 5 } } });
  const req = priceRequest({ choices: { date_mode: "cheapest", trip_nights: 7 } });
  const best = cheapestFlight([a, b], "LIS", req, NOW);
  assert.deepEqual([best.from, best.typical], ["BRU", false]);
  const anyReq = priceRequest({ choices: { date_mode: "any" } });
  assert.equal(cheapestFlight([a, b], "LIS", anyReq, NOW).from, "CRL", "both typical: the cheaper");
});

/* --------------------------------------------------------------- prices */

const ROW = { id: "LIS", cost: { dayEur: 100, stayEur: 60, foodEur: 40, way: { mode: "plane", perPerson: 150, typical: true } } };
const C = (c) => ({ group_size: 3, trip_nights: 5, date_mode: "any", ...c });

test("the four cells of Prices shown, from one grandTotal", () => {
  const f = (c) => priceFigure(ROW, C(c));
  assert.deepEqual([f({}).eur, f({}).unit], [100, ["card.perDay", {}]]);
  assert.deepEqual([f({ price_view: "total", price_span: "day" }).eur, f({ price_view: "total", price_span: "day" }).unit], [300, ["card.perDayGroup", { n: 3 }]]);
  assert.deepEqual([f({ price_span: "trip" }).eur, f({ price_span: "trip" }).unit], [100 * 5 + 150, ["settingsSum.unitTrip", {}]]);
  const g = f({ price_view: "total", price_span: "trip" });
  assert.deepEqual([g.eur, g.unit], [(100 * 5 + 150) * 3, ["settingsSum.unitTripGroup", { n: 3 }]]);
  // The wagons add up to the figure in every cell.
  for (const c of [{}, { price_span: "trip" }, { price_view: "total", price_span: "day" }, { price_view: "total", price_span: "trip" }]) {
    const x = f(c);
    assert.equal(x.parts.bed + x.parts.food + (x.parts.way || 0), x.eur, JSON.stringify(c));
  }
  assert.equal(grandTotal(ROW, C({ price_view: "total" })).trip, (100 * 5 + 150) * 3);
});

test("typical and not known: flagged, never dropped, sorted last", () => {
  assert.equal(priceFigure(ROW, C({ price_span: "trip" })).typical, true);
  assert.equal(priceFigure(ROW, C({})).typical, false, "a day holds no flight");
  const nk = { id: "X", cost: { dayEur: 80, stayEur: 50, foodEur: 30, way: notKnownWay("train") } };
  const trip = priceFigure(nk, C({ price_span: "trip" }));
  assert.deepEqual([trip.eur, trip.notKnown, trip.missing], [400, true, ["way"]]);
  assert.equal(priceFigure(nk, C({})).notKnown, false, "a day needs no way");
  assert.ok(priceSortValue(nk, C({ price_span: "trip" })) > priceSortValue(ROW, C({ price_span: "trip" })));
  // A way switched off is not missing.
  const off = priceFigure(nk, C({ price_span: "trip", price_excluded: ["flight"] }));
  assert.deepEqual([off.eur, off.notKnown], [400, false]);
  const noDay = priceFigure({ id: "Y", cost: {} }, C({}));
  assert.deepEqual([noDay.eur, noDay.notKnown], [null, true]);
  assert.equal(priceSortValue({ id: "Y", cost: {} }, C({})), Infinity);
});

/* -------------------------------------------------------------- summary */

test("the summary chips: five items, full texts, each opens its step", () => {
  const style = { name: "The two of us" };
  const data = { meta: { origins: {} } };
  const s = settingsSummary(
    { origin_kind: "country", origin_country: "BE", date_mode: "month", when_month: "2027-06", trip_nights: 7, transport_mode: "train" },
    style, t, { lang: "en-GB", data },
  );
  assert.deepEqual(s.map((x) => x.key), ["style", "start", "when", "way", "prices"]);
  assert.deepEqual(s.map((x) => x.text), ["The two of us", "From Belgium", "June, 7 nights", "By train", "A day, each person"]);
  assert.deepEqual(s.map((x) => x.step), ["style", "start", "when", "way", "prices"]);
  assert.deepEqual(s.map((x) => x.icon), ["heart", "flag", "calendar", "train", "euro"]);
  const texts = (c, legacy = {}) => settingsSummary(readSettings(c, legacy), null, t, { lang: "en-GB", data })[2].text;
  assert.equal(texts({ date_mode: "dates" }, { departDate: "2027-06-12", returnDate: "2027-06-19" }), "12 to 19 June");
  assert.equal(texts({ date_mode: "dates" }, { departDate: "2027-06-28", returnDate: "2027-07-05" }), "28 June to 5 July");
  assert.equal(texts({ date_mode: "any" }), "Any time, 7 nights");
  assert.equal(texts({ date_mode: "cheapest", trip_nights: 1 }), "Cheapest dates, 1 night");
  assert.equal(texts({ date_mode: "dates" }), "Pick your dates");
  const all = settingsSummary({ transport_mode: "any", price_view: "total", price_span: "trip", drive_home: { name: "Ghent", lat: 51, lon: 3.7 } }, null, t, { lang: "en-GB" });
  assert.deepEqual(all.map((x) => x.text).slice(0, 2), ["Create a travel style", "From Ghent"]);
  assert.deepEqual([all[3].text, all[3].icon, all[4].text], ["Best way", "route", "The whole trip, the group"]);
  // A template style has its name through i18n.
  assert.equal(settingsSummary({}, { name: "", nameKey: "styles.t.couple" }, t)[0].text, t("styles.t.couple"));
});

test("every settingsSum key is in all six catalogues, with no dash or euro sign", async () => {
  const keys = Object.keys(en).filter((k) => k.startsWith("settingsSum."));
  assert.ok(keys.length >= 28);
  for (const lang of ["nl", "de", "fr", "es", "it"]) {
    const dict = (await import(`../src/i18n/${lang}.js`))[lang];
    for (const k of keys) {
      assert.ok(dict[k], `${lang} ${k}`);
      assert.ok(!/[–—€]/.test(dict[k]), `${lang} ${k}`);
      for (const slot of en[k].match(/\{\w+\}/g) || []) assert.ok(dict[k].includes(slot), `${lang} ${k} ${slot}`);
    }
  }
});

/* ---------------------------------------------------------------- start */

const DATA = {
  destinations: {
    BRU: { tier: "airport", iata: "BRU", city: "Brussels", country: "Belgium", iso2: "BE", lat: 50.9, lon: 4.48, city_lat: 50.85, city_lon: 4.35 },
    "gem:bruges": { tier: "gem", city: "Bruges", country: "Belgium", iso2: "BE", lat: 51.21, lon: 3.22, anchor_airport: "BRU" },
    LIS: { tier: "airport", iata: "LIS", city: "Lisbon", country: "Portugal", iso2: "PT", lat: 38.77, lon: -9.13 },
    "gem:ghostly": { tier: "gem", city: "Nowhere", country: "Portugal", iso2: "PT", lat: 40, lon: -8 },
  },
  meta: { origins: {
    BRU: { city: "Brussels", country: "Belgium", lat: 50.9, lon: 4.48 },
    CRL: { city: "Charleroi", country: "Belgium", lat: 50.46, lon: 4.46 },
    LGG: { city: "Liege", country: "Belgium", lat: 50.64, lon: 5.44 },
    LIS: { city: "Lisbon", country: "Portugal", lat: 38.77, lon: -9.13 },
  } },
};

test("here: the nearest town in Carta's data", () => {
  const town = nearestTown(DATA, { lat: 51.05, lon: 3.72 }); // Ghent
  assert.deepEqual([town.id, town.name, town.iso2], ["gem:bruges", "Bruges", "BE"]);
  assert.equal(nearestTown(DATA, { lat: NaN, lon: 1 }), null);
  assert.equal(nearestTown({}, { lat: 50, lon: 4 }), null);
});

test("country: ground from the town nearest the capital, flights from its swept airports", () => {
  assert.equal(countryStartTown(DATA, "BE").name, "Brussels");
  assert.equal(countryStartTown(DATA, "PT").name, "Lisbon");
  assert.equal(countryStartTown(DATA, "XX"), null);
  assert.deepEqual(countryAirports(DATA, "BE", { BRU: 300, CRL: 700 }), ["CRL", "BRU"], "most priced days first, unswept left out");
  assert.deepEqual(countryAirports(DATA, "BE", null), ["BRU", "CRL", "LGG"]);
});

test("setters: each field through App's setters, legacy readers kept in step", () => {
  let choices = { origin: "BRU", origins: [], date_mode: "dates", when_month: "2027-03" };
  const calls = [];
  const set = makeSettingsSetters({
    data: DATA,
    sweptOrigins: { BRU: 10, CRL: 20 },
    setChoices: (u) => { choices = typeof u === "function" ? u(choices) : u; },
    setFrom: (p) => { calls.push(["from", p.name]); choices = { ...choices, drive_home: p, origin: "BRU" }; },
    setDateFlex: (v) => calls.push(["flex", v]),
    setExploreMonth: (v) => calls.push(["xm", v]),
    setDepartDate: (v) => calls.push(["d", v]),
    setReturnDate: (v) => calls.push(["r", v]),
    getChoices: () => choices,
  });
  const r = set.setStartCountry("be");
  assert.deepEqual(r.airports, ["CRL", "BRU"]);
  assert.deepEqual([choices.origin_kind, choices.origin_country, choices.origins, choices.origin], ["country", "BE", ["CRL", "BRU"], "BRU"]);
  assert.equal(set.setStartHere({ lat: 51.05, lon: 3.72 }).id, "gem:bruges");
  assert.deepEqual([choices.origin_kind, choices.here_town, choices.origins], ["here", "gem:bruges", []]);
  set.setDateMode("month");
  assert.deepEqual([choices.date_mode, choices.when_month], ["month", "2027-03"]);
  assert.deepEqual(calls.slice(-2), [["flex", "month"], ["xm", 3]]);
  set.setDateMode("cheapest");
  assert.deepEqual(calls.slice(-2), [["flex", "any"], ["xm", null]]);
  set.setDates("2027-05-01", "2027-05-08");
  assert.equal(choices.date_mode, "dates");
  assert.equal(choices.when_month, "2027-03", "the month stays for when month mode comes back");
  set.setTripNights(4); set.setWay("bus"); set.setPriceView("total"); set.setPriceSpan("trip");
  assert.deepEqual([choices.trip_nights, choices.transport_mode, choices.price_view, choices.price_span], [4, "bus", "total", "trip"]);
});

/* ----------------------------------------------------------------- rows */

test("no setting removes a row: a mode without a figure keeps the row as not known", () => {
  const rows = Object.keys(DATA.destinations).map((id) => ({ id, cost: { dayEur: 90 } }));
  const f = file("BRU", { LIS: ROUTE });
  const run = (mode, extra = {}) => wayRowsFor({
    rows, destinations: DATA.destinations, files: [f], request: priceRequest({ choices: { date_mode: "cheapest", trip_nights: 7 } }),
    mode, home: null, party: { adults: 2, children: 0, babies: 0, seats: 2 }, now: NOW, ...extra,
  });
  for (const mode of ["any", "plane", "train", "bus", "car"]) {
    const m = run(mode);
    assert.equal(m.size, rows.length, mode);
  }
  const train = run("train");
  assert.deepEqual(train.get("LIS").cost.way, { mode: "train", perPerson: null, notKnown: true });
  const plane = run("plane");
  assert.equal(plane.get("LIS").cost.way.mode, "plane");
  assert.equal(plane.get("LIS").cost.way.typical, undefined, "a checked pair is not typical");
  assert.deepEqual(plane.get("LIS").cost.way.dates, { out: "2026-12-03", back: "2026-12-11" });
  assert.equal(plane.get("gem:ghostly").cost.way.notKnown, true);
  assert.ok(plane.get("LIS").fmin > 0);
  const typ = wayRowsFor({
    rows, destinations: DATA.destinations, files: [f], request: priceRequest({ choices: { date_mode: "any" } }),
    mode: "plane", home: null, party: null, now: NOW,
  });
  assert.equal(typ.get("LIS").cost.way.typical, true);
  assert.equal(typ.get("LIS").fmin, null, "a typical fare has no flight length");
  // wayFor alone still says null: the row keeps itself, not the engine.
  assert.equal(wayFor(DATA.destinations.LIS, "train", { home: null }), null);
});

test("the way memo key ignores price view and span, and follows what moves a way", () => {
  const k = (c, mode = "any") => wayKey(priceRequest({ choices: { date_mode: "any", ...c } }), mode, { lat: 1, lon: 2 }, { adults: 2, children: 0, babies: 0 });
  assert.equal(k({}), k({ price_view: "total", price_span: "trip" }));
  assert.notEqual(k({}), k({ date_mode: "cheapest" }));
  assert.notEqual(k({}), k({ trip_nights: 4 }));
  assert.notEqual(k({}), k({}, "train"));
  assert.deepEqual(flightFiles({ flights: ROW, flightsBy: { A: ROW, B: DATA } }), [ROW, DATA]);
});

/* ------------------------------------------------------------------ url */

test("URL: the new keys round-trip, and only when not the default", () => {
  const choices = {
    price_view: "total", price_span: "day", date_mode: "cheapest", when_month: "2027-06", trip_nights: 9,
    origin_kind: "country", origin_country: "BE",
  };
  const q = encodeState({ choices });
  const back = decodeState(q);
  for (const k of Object.keys(choices)) assert.deepEqual(back[k], choices[k], k);
  const here = decodeState(encodeState({ choices: { origin_kind: "here", here_town: "gem:bruges" } }));
  assert.deepEqual([here.origin_kind, here.here_town], ["here", "gem:bruges"]);
  const bare = new URLSearchParams(encodeState({ choices: { origin_kind: "place", price_view: "pp" } }));
  for (const k of ["ps", "wm", "wy", "wn", "sk", "sc", "sh"]) assert.equal(bare.has(k), false, k);
  assert.equal(decodeState("?wm=zz").date_mode, undefined);
  assert.equal(decodeState("?wy=2027-13").when_month, undefined);
  assert.equal(decodeState("?wn=99").trip_nights, undefined);
});

/* ------------------------------------------------------------ month from */

test("E2 month cards: the cheapest checked return of the trip length that month, null where only typical fares exist", () => {
  const req = priceRequest({ choices: { date_mode: "month", when_month: "2026-12", trip_nights: 7 } });
  const at = atMonth(req, "2027-01");
  assert.deepEqual([at.when.kind, at.when.ym, at.when.month], ["month", "2027-01", 1]);
  const data = { destinations: DATA.destinations, flights: file("BRU", { LIS: ROUTE }) };
  const choices = { trip_nights: 7 };
  assert.equal(monthFrom(data, req, "2026-12", choices, NOW), seat(30) + seat(25));
  assert.equal(monthFrom(data, req, "2027-01", choices, NOW), seat(20) + seat(90));
  // No checked pair that month: no figure, never the (monthless) typical fare.
  assert.equal(monthFrom(data, req, "2027-03", choices, NOW), null);
  assert.equal(monthFrom({ destinations: DATA.destinations }, req, "2026-12", choices, NOW), null);
  assert.equal(monthFrom(data, req, "2027-13", choices, NOW), null);
  assert.equal(monthFrom(null, req, "2026-12", choices, NOW), null);
});

test("E1 a way that is not the style's holds the style, never rewrites it", () => {
  const store = { list: [{ id: "s1", name: "Two by train", way: "train", ways: ["train"] }], active: "s1" };
  const c = { transport_mode: "train", travel_styles: store };
  const held = withWay("plane")(c);
  assert.deepEqual([held.transport_mode, held.style_held], ["plane", true]);
  assert.equal(held.travel_styles, store, "the saved style is untouched");
  const same = withWay("train")({ ...c });
  assert.equal(same.style_held, undefined, "the style's own way needs no hold");
  assert.equal(withWay("plane")({ transport_mode: "train" }).style_held, undefined, "no style, nothing to hold");
});

test("E4 dates: the checked pair keeps the trip's nights, else typical", () => {
  const f = file("BRU", { LIS: ROUTE });
  const req = (d, r) => priceRequest({ choices: { date_mode: "dates" }, departDate: d, returnDate: r, today: TODAY });
  // Out 3 Dec (nearest to 2 Dec), home 7 nights later +/-1: 11 Dec (8 nights).
  const ok = flightLegs(f, "LIS", req("2026-12-02", "2026-12-09"), NOW);
  assert.deepEqual([ok.out.date, ok.back.date], ["2026-12-03", "2026-12-11"]);
  // 2 nights: no checked pair of that length nearby, so the card falls back to typical.
  assert.equal(flightLegs(f, "LIS", req("2026-12-01", "2026-12-03"), NOW), null);
  assert.equal(flightPrice(f, "LIS", req("2026-12-01", "2026-12-03"), NOW).typical, true);
});

test("E5 any time: the sheet's legs are a trip-length pair, not the year's cheapest weeks apart", () => {
  const f = file("BRU", { LIS: ROUTE });
  const legs = flightLegs(f, "LIS", priceRequest({ choices: { date_mode: "any", trip_nights: 7 } }), NOW);
  const nights = (Date.parse(legs.back.date) - Date.parse(legs.out.date)) / 86400000;
  assert.ok(Math.abs(nights - 7) <= 1, String(nights));
  assert.equal(flightPrice(f, "LIS", priceRequest({ choices: { date_mode: "any" } }), NOW).typical, true, "the card stays typical");
});

test("E6 and E7: a country starts at the capital's town; the start chip speaks the UI language", () => {
  const be = countryStartTown(DATA, "BE");
  assert.deepEqual([be.id, be.name, be.lat, be.lon], ["BRU", "Brussels", 50.85, 4.35], "the town centre, not the airport");
  assert.equal(startCountryOf(readSettings({ origin: "CRL" }), DATA), "BE", "the home airport's country");
  assert.equal(startCountryOf(readSettings({ origin_kind: "country", origin_country: "PT" }), DATA), "PT");
  const c = withStart("place", { names: { de: "Br\u00fcssel", nl: "Brussel", bad: 1 } })({ drive_home: { name: "Brussels", lat: 50.85, lon: 4.35 } });
  assert.deepEqual(c.start_names, { de: "Br\u00fcssel", nl: "Brussel" });
  assert.equal(settingsSummary(c, null, t, { lang: "de-DE" })[1].text, "From Br\u00fcssel");
  assert.equal(settingsSummary(c, null, t, { lang: "en-GB" })[1].text, "From Brussels");
});

test("Prices shown example: one place gets the same way there as its card, so the whole trip adds it", () => {
  const f = file("BRU", { LIS: ROUTE });
  const ctx = {
    destinations: DATA.destinations, files: [f], request: priceRequest({ choices: { date_mode: "cheapest", trip_nights: 7 } }),
    mode: "plane", home: null, party: { adults: 2, children: 0, babies: 0, seats: 2 }, now: NOW,
  };
  const day = { dayEur: 90, stayEur: 60, foodEur: 30 };
  const row = placeRow({ id: "LIS", day, ...ctx });
  const card = wayRowsFor({ rows: [{ id: "LIS", cost: day }], ...ctx }).get("LIS");
  assert.deepEqual(row.cost.way, card.cost.way);
  const fig = priceFigure(row, readSettings({ price_span: "trip", trip_nights: 7, date_mode: "cheapest" }));
  assert.equal(fig.notKnown, false);
  assert.ok(fig.parts.way > 0);
  assert.equal(fig.eur, Math.round((90 * 7 + fig.parts.way) * 100) / 100);
  assert.equal(placeRow({ id: "LIS", day: null, ...ctx }), null);
});
