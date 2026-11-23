// PT-E10 (ROADMAP G4, I2, I5, I14; logic audit E10): one entitlement decision, the paywall matrix
// that closes the QUOTA-011/012/013 "no test" rows. decide() is pure; usePaywall only wires it
// behind flag E10 (config/flags.json, default old). Owner default 13: unknown entitlement fails
// open for a traveller with a known payment, closed for one who never paid.
// Run: node --test tests/paywallDecision.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { decide, isPaidTier, QUOTA_REASONS } from "../src/lib/paywallDecision.js";

const HARD = ["export", "exportCal", "exportMap", "import", "save", "browse"];
const QUOTA = ["plans", "ground", "plansLow"];
const guest = { signedIn: false, loading: false, known: false, tier: "free" };
const loading = { signedIn: true, loading: true, known: false, tier: "free" };
const failed = { signedIn: true, loading: false, known: false, tier: "free" };
const free = { signedIn: true, loading: false, known: true, tier: "free" };
const pass = { signedIn: true, loading: false, known: true, tier: "trip" };

test("E10: a guest is gated on every reason", () => {
  for (const why of [...HARD, ...QUOTA, "expiring"]) assert.equal(decide(why, guest, null), "gate", why);
});

test("E10: a known free traveller is gated on every reason", () => {
  for (const why of [...HARD, ...QUOTA]) assert.equal(decide(why, free, null), "gate", why);
});

test("E10: a known pass holder passes the hard gates and is asked only when an allowance is spent", () => {
  for (const why of [...HARD, "expiring"]) assert.equal(decide(why, pass, null), "pass", why);
  for (const why of QUOTA) assert.equal(decide(why, pass, null), "gate", why);
});

test("E10: unknown and never paid fails closed for export, save and import (J-12)", () => {
  for (const why of ["export", "save", "import", "exportCal", "exportMap"]) {
    assert.equal(decide(why, failed, null), "gate", `${why} after a failed read`);
    assert.equal(decide(why, failed, "free"), "gate", `${why}, last known free`);
    assert.equal(decide(why, loading, null), "wait", `${why} while the read is in flight`);
  }
});

test("E10: unknown with a known payment fails open, but never for a metered allowance (owner default 13)", () => {
  for (const why of HARD) {
    assert.equal(decide(why, failed, "trip"), "pass", why);
    assert.equal(decide(why, loading, "year"), "pass", why);
  }
  for (const why of QUOTA) assert.equal(decide(why, failed, "trip"), "wait", why);
});

test("E10: the quota reasons are the three allowance gates, and free is not a paid tier", () => {
  assert.deepEqual([...QUOTA_REASONS].sort(), [...QUOTA].sort());
  assert.equal(isPaidTier("free"), false);
  assert.equal(isPaidTier(null), false);
  assert.equal(isPaidTier("trip"), true);
});

test("E10: a missing snapshot is a guest, never a pass", () => {
  assert.equal(decide("save", undefined, null), "gate");
});
