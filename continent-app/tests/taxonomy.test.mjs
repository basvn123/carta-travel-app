// Boundary tests for the three-axis taxonomy (PLAN.md C1).
// Run: node --test continent-app/tests/
import test from "node:test";
import assert from "node:assert/strict";
import {
  kindOf,
  verdictOf,
  roleOf,
  ROLES,
  ROLE_RULES,
  buildNearbyIndex,
} from "../src/lib/taxonomy.js";

const dest = (visit_h, base, transit) => ({
  place: { class: "town", visit_h, base },
  local_transport: { transit_quality: transit },
});

test("kind reads place.class and never returns outside the five", () => {
  assert.equal(kindOf({ place: { class: "village" } }), "village");
  assert.equal(kindOf({ place: { class: "borough" } }), "city"); // unknown -> city
  assert.equal(kindOf({}), "city");
});

test("verdict carries tier, gem and confidence", () => {
  const v = verdictOf({
    rating: { tier: 2, label: "Worth a detour", hidden_gem: true, confidence: "modelled" },
  });
  assert.deepEqual(v, {
    tier: 2,
    label: "Worth a detour",
    gem: true,
    confidence: "modelled",
  });
  assert.equal(verdictOf({}).tier, 0);
});

test("stop boundary: under 3 hours is a stop, exactly 3 is not", () => {
  assert.equal(roleOf(dest(2.9, 0.9, "excellent"), 9), ROLES.stop);
  assert.notEqual(roleOf(dest(3.0, 0.9, "excellent"), 9), ROLES.stop);
});

test("the bed decides base vs basecamp where rides out exist", () => {
  assert.equal(roleOf(dest(8, 0.6, "poor"), 4), ROLES.base); // sleeps well: stay
  assert.equal(roleOf(dest(8, 0.59, "poor"), 4), ROLES.basecamp); // sleeps so-so: ride out
  // without rides out, an 8-hour place anchors a stay whatever the bed
  assert.equal(roleOf(dest(8, 0.2, "poor"), 0), ROLES.base);
  // 7.9 h with a great bed but under BASE_MIN_H: the strict base rule
  // does not fire, the big-place fallback does
  assert.equal(roleOf(dest(7.9, 0.9, "poor"), 0), ROLES.base);
});

test("basecamp needs 5-8 hours and four rides out", () => {
  assert.equal(roleOf(dest(5, 0.2, "poor"), 4), ROLES.basecamp);
  assert.equal(roleOf(dest(8, 0.2, "poor"), 4), ROLES.basecamp);
  assert.notEqual(roleOf(dest(5, 0.2, "poor"), 3), ROLES.basecamp); // 3 rides
  assert.notEqual(roleOf(dest(4.9, 0.2, "poor"), 9), ROLES.basecamp);
});

test("daytrip needs reachability, 3-6 hours", () => {
  assert.equal(roleOf(dest(4, 0.2, "good"), 0), ROLES.daytrip);
  assert.equal(roleOf(dest(6, 0.2, "excellent"), 0), ROLES.daytrip);
});

test("the cascade is total: gap cases still resolve", () => {
  // 4 h, poor transit, nothing nearby: PLAN's rules matched nothing here
  assert.equal(roleOf(dest(4, 0.2, "poor"), 0), ROLES.daytrip);
  // 7 h, bad bed, nothing nearby: big enough to anchor a stay anyway
  assert.equal(roleOf(dest(7, 0.2, "poor"), 0), ROLES.base);
  // no fields at all
  assert.ok(roleOf({}, 0));
});

test("every destination resolves to exactly one kind, verdict and role", () => {
  // a miniature catalogue exercising all branches at once
  const dests = {
    a: { lat: 48.0, lon: 11.0, ...dest(2, 0.1, "poor") },
    b: { lat: 48.1, lon: 11.1, ...dest(9, 0.9, "good") },
    c: { lat: 48.2, lon: 11.0, ...dest(6, 0.3, "poor") },
    d: { lat: 48.05, lon: 11.05, ...dest(4, 0.3, "excellent") },
    e: { lat: 48.15, lon: 11.15, ...dest(5.5, 0.3, "limited") },
  };
  const near = buildNearbyIndex(dests);
  for (const [id, d] of Object.entries(dests)) {
    const role = roleOf(d, near[id]);
    assert.ok(Object.values(ROLES).includes(role), `${id} has a role`);
    assert.ok(kindOf(d));
    assert.ok(verdictOf(d));
  }
  // the cluster sits within NEARBY_KM of itself
  assert.ok(near.a >= 4, `a sees ${near.a} neighbours`);
});

test("nearby index distances respect the radius", () => {
  const far = {
    x: { lat: 48.0, lon: 11.0 },
    y: { lat: 52.0, lon: 21.0 }, // Warsaw-ish, far away
  };
  const near = buildNearbyIndex(far);
  assert.equal(near.x, 0);
  assert.equal(near.y, 0);
  assert.ok(ROLE_RULES.NEARBY_KM > 0);
});
