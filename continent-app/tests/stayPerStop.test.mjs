// T842 (owner D2, 2026-10-29): a stop may sleep its own way. Its stayTier
// prices that stop's beds; the other stops keep the trip's, and the four
// tiles still add up to the total to the cent.
// Run: npm test (continent-app/). Needs public/app_data.json; skips without it.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { quoteTrip } from "../src/lib/tripTotal.js";
import { costTiles } from "../src/lib/price/tiles.js";

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const data = existsSync(pub("app_data.json")) ? JSON.parse(readFileSync(pub("app_data.json"), "utf8")) : null;
const skip = data ? false : "public/app_data.json is not on this machine";
const trip = (stops) => ({
  tripStart: "2026-11-21", tripEnd: "2026-11-28", groupSize: 2, stayTier: "home",
  stops,
});
const r2 = (n) => Math.round(n * 100) / 100;

test("a stop's own stay type prices that stop's beds only", { skip }, () => {
  const base = quoteTrip(trip([{ destinationId: "gem:hallstatt", nights: 4 }, { destinationId: "SZG", nights: 3 }]), { data });
  const dorm = quoteTrip(trip([{ destinationId: "gem:hallstatt", nights: 4 }, { destinationId: "SZG", nights: 3, stayTier: "dorm" }]), { data });
  assert.ok(base.stayCosts[1].accomTotal > 0);
  assert.equal(dorm.stayCosts[0].accomTotal, base.stayCosts[0].accomTotal);
  assert.ok(dorm.stayCosts[1].accomTotal < base.stayCosts[1].accomTotal);
  for (const q of [base, dorm]) {
    assert.equal(r2(costTiles(q).reduce((n, t) => n + t.eur, 0)), q.grandTotal);
  }
});

// T843 (owner D4): a day trip from a base is priced there and back for the
// party, sits in Getting around, and the tiles still add up.
test("a day trip from a base is priced there and back in Getting around", { skip }, () => {
  const plain = quoteTrip(trip([{ destinationId: "gem:hallstatt", nights: 4 }, { destinationId: "SZG", nights: 3 }]), { data });
  const withTrip = quoteTrip(trip([{ destinationId: "gem:hallstatt", nights: 4 }, { destinationId: "SZG", nights: 3, dayTrips: [{ destinationId: "gem:hallstatt", day: 2 }] }]), { data });
  assert.equal(plain.parts.daytrips, 0);
  assert.equal(withTrip.dayTrips.length, 1);
  assert.equal(withTrip.dayTrips[0].stopIndex, 1);
  assert.ok(withTrip.parts.daytrips > 0);
  assert.equal(r2(withTrip.grandTotal - plain.grandTotal), withTrip.parts.daytrips);
  const around = costTiles(withTrip).find((t) => t.key === "around");
  assert.ok(around.parts.includes("daytrips"));
  assert.equal(r2(costTiles(withTrip).reduce((n, t) => n + t.eur, 0)), withTrip.grandTotal);
});
