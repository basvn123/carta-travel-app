// G12 plan rethink, lanes L13 and R3: the found trip's levers (a bed tier
// down, a nearby base, a cheaper checked week) and one alternative per
// relation (cheaper, another month, another country, closer). A difference
// shows only like for like, a "Not yet" total never counts as cheaper, and
// nothing empty is returned. Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { alternatives, leavesOut, levers, movedLines, priceDiff, MIN_WINDOWS } from "../src/lib/recommend/alternatives.js";
import { knowTrip } from "../src/lib/recommend/doorTrips.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const slots = (flight = 200) => [
  { id: "flight", eur: flight }, { id: "stay", eur: 300 }, { id: "food", eur: 150 }, { id: "activities", eur: null },
];
const trip = (id, { iso2 = "PT", shape = "one", group = 650, flight = 200, month = 5, places = ["LIS"], min = 300 } = {}) => ({
  id, iso2, shape, month, places: places.map((p) => ({ id: p, nights: 4 })), slots: slots(flight), total: { group }, min,
});
const minutes = (x) => x.min;

test("priceDiff: only like for like", () => {
  assert.equal(priceDiff(trip("a"), trip("b", { group: 600 })), -50);
  assert.equal(priceDiff(trip("a"), trip("b", { group: 450, flight: null })), null, "a Not yet flight is not a saving");
  assert.equal(leavesOut(trip("b", { flight: null })), true);
  assert.equal(leavesOut(trip("a")), false, "activities never count as Not yet");
});

test("alternatives: one per relation, each with its difference, none empty", () => {
  const base = trip("base");
  const others = [
    trip("es1", { iso2: "ES", group: 900, min: 200 }),
    trip("pt-cheap", { group: 560 }),
    trip("pt-notyet", { group: 300, flight: null }),
    trip("pt-june", { month: 6, group: 700 }),
  ];
  const alts = alternatives(base, others, { minutes, windows: MIN_WINDOWS });
  assert.deepEqual(alts.map((a) => [a.key, a.trip.id]), [["cheaper", "pt-cheap"], ["month", "pt-june"], ["country", "es1"]]);
  assert.equal(alts[0].diff, -90);
  // Another month needs two checked windows; closer needs a real gain.
  const few = alternatives(base, others, { minutes, windows: 1 });
  assert.ok(!few.some((a) => a.key === "month"));
  const closer = alternatives(base, [trip("pt-near", { group: 700, min: 120 })], { minutes, windows: 0 });
  assert.deepEqual(closer.map((a) => a.key), ["closer"]);
  assert.deepEqual(alternatives(base, [], {}), [], "nothing to show, nothing drawn");
  // A lever wins the cheaper slot.
  const lv = [{ key: "tier", trip: trip("base~tier", { group: 500 }), diff: -150 }];
  assert.equal(alternatives(base, others, { levers: lv }).find((a) => a.key === "cheaper").trip.id, "base~tier");
});

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const raw = existsSync(pub("app_data.json")) ? JSON.parse(readFileSync(pub("app_data.json"), "utf8")) : null;
const skip = raw ? false : "public/app_data.json is not on this machine";

test("levers on a real trip: each cheaper, complete and like for like, with its own id", { skip }, () => {
  const destinations = Array.isArray(raw.destinations) ? Object.fromEntries(raw.destinations.map((d) => [d.id, d])) : raw.destinations;
  const f = JSON.parse(readFileSync(new URL("./fixtures/tf1-flights-BRU.json", import.meta.url), "utf8"));
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at;
  const settings = normalizeSettings({
    answered: ["who", "when"], party: { kind: "couple", adults: 2 },
    when: { mode: "exact", start: "2026-11-21", end: "2026-11-28", nights: 7 }, guide: { likes: [] },
    places: [{ kind: "place", id: "LIS", name: "Lisbon", iso2: "PT", country: "Portugal" }],
  });
  const input = {
    data: { ...raw, destinations }, countryInsights: {}, layerIndexes: {}, settings, taste: null,
    origin: { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" }, flights: f, lifestyle: null, stayTier: "hotel3", today: "2026-11-01",
  };
  const base = knowTrip(input);
  assert.ok(base);
  const lv = levers(base, input);
  for (const l of lv) {
    assert.ok(["tier", "nearby", "week"].includes(l.key));
    assert.ok(l.diff < 0, `${l.key} is cheaper`);
    if (l.partial) {
      // G12 B5 owner rule: the flight Not yet in both, the saving only on priced lines.
      assert.equal(leavesOut(base), true);
      assert.ok(l.lines.length && !l.lines.includes("flight"));
      assert.notEqual(l.key, "week");
      continue;
    }
    assert.equal(priceDiff(base, l.trip), l.diff);
    assert.equal(leavesOut(l.trip), false);
    assert.notEqual(l.trip.id, base.id);
  }
});

test("owner rule (G12 B5): flight Not yet in both, a saving on the priced lines only, never Cheaper", () => {
  const withStay = (id, stay, group) => ({ ...trip(id, { flight: null, group }), slots: [
    { id: "flight", eur: null }, { id: "stay", eur: stay, eurGroup: stay * 2 }, { id: "food", eur: 150, eurGroup: 300 }, { id: "activities", eur: null },
  ] });
  const base = withStay("base", 300, 900);
  const down = withStay("base~tier", 280, 860);
  assert.deepEqual(movedLines(base, down), [{ id: "stay", diff: -40 }]);
  assert.deepEqual(movedLines(base, trip("x")), [], "different live lines move nothing");
  const lv = [{ key: "tier", trip: down, diff: -40, lines: ["stay"], partial: true }];
  const alts = alternatives(base, [trip("es1", { iso2: "ES", group: 400 }), trip("pt-cheap", { group: 300 })], { levers: lv, minutes });
  assert.ok(!alts.some((x) => x.key === "cheaper"), "a Not yet total never wins Cheaper");
  assert.ok(alts.every((x) => x.diff === null), "no whole-trip difference against a Not yet total");
});

// G12 B6 (R6): Another month as a row runs only on Search more, and never
// from a trip with a Not yet line or without two checked windows.
test("R6: otherMonthTrips skips Not yet trips and needs checked windows", async () => {
  const { otherMonthTrips } = await import("../src/lib/recommend/alternatives.js");
  const t = (id, out) => ({ id, nights: 7, gateway: { iata: "LIS" }, dates: { out: "2027-05-01" }, total: { group: 900 }, slots: [{ id: "flight", eur: out ? null : 200 }] });
  assert.deepEqual(otherMonthTrips([t("a", true), t("b", false)], { flights: null, today: "2026-11-25" }), []);
  assert.deepEqual(otherMonthTrips([], {}), []);
});

test("G12 judge round 3: a pool trip with no places does not throw", () => {
  const bare = { ...trip("bare", { month: 6 }), places: undefined };
  assert.doesNotThrow(() => alternatives(trip("base"), [bare], { minutes, windows: MIN_WINDOWS }));
  const alts = alternatives(trip("base"), [bare, trip("pt-june", { month: 6, group: 700 })], { minutes, windows: MIN_WINDOWS });
  assert.equal(alts.find((x) => x.key === "month").trip.id, "pt-june");
});
