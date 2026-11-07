// T1185 (ROADMAP D24): the way back a trail page shows, from the record
// pipeline/trails/way_back.py writes. Run: npm test  (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { wayBackFor, wayBackPlan, splitMinutes } from "../src/lib/wayBack.js";

const WB = { km: 15.2, walk: { km: 20, min: 330 }, taxi: { km: 19.7, min: 25, est: true },
  pt: { s: ["rail"], e: ["rail", "bus"], both: ["rail"] }, _src: "osm", _asof: "2026-11-06" };

test("a row's own record applies; a trek stage uses its trek's", () => {
  assert.deepEqual(wayBackFor({ id: 1, wb: WB }, null), { wb: WB, viaTrek: false });
  const trek = { id: "t", wb: { ...WB, km: 30 } };
  assert.deepEqual(wayBackFor({ id: 2, trek: { id: "t" } }, trek), { wb: trek.wb, viaTrek: true });
  assert.equal(wayBackFor({ id: 2, trek: { id: "t" } }, null).wb, null);
  assert.equal(wayBackFor({ id: 3 }, null).wb, null);
});

test("the plan separates public transport, taxi and walk, and never invents times", () => {
  const p = wayBackPlan(WB);
  assert.equal(p.pt, "both");
  assert.deepEqual(p.modes, ["rail"]);
  assert.equal(p.taxi.min, 25);
  assert.equal("min" in p, false);
  assert.equal(wayBackPlan({ km: 5 }).pt, "unknown");
  assert.equal(wayBackPlan({ km: 5, pt: { s: [], e: ["bus"], both: [] } }).pt, "none");
  assert.equal(wayBackPlan({ km: 5 }).taxi, null);
  assert.equal(wayBackPlan(null), null);
});

test("minutes split", () => {
  assert.deepEqual(splitMinutes(330), { h: 5, min: 30 });
  assert.deepEqual(splitMinutes(25), { h: 0, min: 25 });
});
