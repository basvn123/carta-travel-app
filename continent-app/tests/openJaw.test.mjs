// G12 plan rethink, lane L11 (decision §3.6, §7 N6): fly home from the last
// stop. The choice is named (openJawChoice), each side is quoted through
// quoteTrip with the same state (openJawTotals), a difference shows only like
// for like, and the planner's return airport survives the device draft.
// Run: npm test (continent-app/). The catalogue test skips without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { liveLines, openJawChoice, openJawPatch, openJawTotals } from "../src/lib/plan/openJaw.js";
import { loadRestorableDraft, persistTripDraft, clearTripDraft } from "../src/planner/tripDraftStore.js";
import { wizardPlannerState } from "../src/lib/tripTotal.js";

const DESTS = {
  LIS: { id: "LIS", city: "Lisbon", routes: { BRU: {} } },
  OPO: { id: "OPO", city: "Porto", routes: { BRU: {} } },
  SIN: { id: "SIN", city: "Sintra", anchor_airport: "LIS" },
  EVO: { id: "EVO", city: "Evora" },
};
const stops = (...ids) => ids.map((destinationId) => ({ destinationId, nights: 2 }));

test("openJawChoice: two stops with their own airports offer the choice", () => {
  const c = openJawChoice({ stops: stops("LIS", "OPO") }, DESTS);
  assert.deepEqual(c, { inId: "LIS", outId: "OPO", firstId: "LIS", lastId: "OPO", current: "open" }, "the engine already flies home from a routed last stop");
  assert.equal(openJawChoice({ stops: stops("LIS", "OPO"), returnAnchorId: "LIS" }, DESTS).current, "round");
  assert.equal(openJawChoice({ stops: stops("LIS", "OPO"), returnAnchorId: "OPO" }, DESTS).current, "open");
  assert.deepEqual(openJawPatch(c, "round"), { returnAnchorId: "LIS" });
  assert.deepEqual(openJawPatch(c, "open"), { returnAnchorId: "OPO" });
  // A stop with no routes flies through its anchor airport.
  assert.equal(openJawChoice({ stops: stops("OPO", "SIN") }, DESTS).outId, "LIS");
});

test("openJawChoice: no choice for one stop, their own car, a booked flight, one shared airport or no airport", () => {
  assert.equal(openJawChoice({ stops: stops("LIS") }, DESTS), null);
  assert.equal(openJawChoice({ stops: stops("LIS", "OPO"), transportPref: "owncar" }, DESTS), null);
  assert.equal(openJawChoice({ stops: stops("LIS", "OPO"), ownFlight: { booked: true } }, DESTS), null);
  assert.equal(openJawChoice({ stops: stops("LIS", "SIN") }, DESTS), null, "Sintra flies through Lisbon");
  assert.equal(openJawChoice({ stops: stops("LIS", "EVO") }, DESTS), null, "no airport for Evora");
  assert.equal(openJawChoice(null, DESTS), null);
});

test("liveLines: the flight counts only when both ways are priced", () => {
  assert.deepEqual(liveLines({ parts: { beds: 300, days: 200, flights: 0 }, cartaFlight: { out: { cost: { total: 90 } } } }), ["beds", "days"]);
  assert.deepEqual(liveLines({ parts: { beds: 300, flights: 180 }, cartaFlight: { out: { cost: {} }, back: { cost: {} } } }), ["beds", "flights"]);
  assert.deepEqual(liveLines(null), []);
});

test("the return airport survives the device draft (round trip)", () => {
  const mem = new Map();
  globalThis.window = { localStorage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
  try {
    persistTripDraft({ tripStart: "2027-05-01", stops: stops("LIS", "OPO"), anchorId: "LIS", returnAnchorId: "OPO" });
    const back = loadRestorableDraft();
    assert.equal(back.returnAnchorId, "OPO");
    assert.equal(back.anchorId, "LIS");
    clearTripDraft();
    assert.equal(loadRestorableDraft(), null);
  } finally {
    delete globalThis.window;
  }
});

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const raw = existsSync(pub("app_data.json")) ? JSON.parse(readFileSync(pub("app_data.json"), "utf8")) : null;
const skip = raw ? false : "public/app_data.json is not on this machine";

test("openJawTotals: both ways home quoted with the same state; a difference only like for like", { skip }, () => {
  const destinations = Array.isArray(raw.destinations) ? Object.fromEntries(raw.destinations.map((d) => [d.id, d])) : raw.destinations;
  const data = { ...raw, destinations, meta: { ...(raw.meta || {}), selected_origin: "BRU" } };
  const ids = ["LIS", "OPO"].filter((id) => destinations[id]);
  if (ids.length < 2) return;
  const state = wizardPlannerState({ startDate: "2027-05-01", stops: stops(...ids), groupSize: 2, transport: "public" }, {});
  const res = openJawTotals(state, { data });
  assert.ok(res, "Lisbon and Porto have a choice");
  assert.ok(Number.isFinite(res.round.total) && Number.isFinite(res.open.total));
  if (res.diff != null) {
    assert.ok(res.same && res.round.flight && res.open.flight);
    assert.equal(res.diff, Math.round(res.open.total - res.round.total));
  } else {
    assert.ok(!res.same || !res.round.flight || !res.open.flight, "no difference without like for like");
  }
});
