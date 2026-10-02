// The five user-visible trail data bugs (T108, spec 6.8): the app's half.
// Run: npm test  (from continent-app/)
//
// The rows are the two Mount Korab routes as the published wire carried them
// (public/trails/AL.json, ids 63428 and 63433), cut down to the fields the
// copy reads. t() is a stand-in that returns the key and its values, so a
// test can say which sentence was chosen without depending on a language.
import test from "node:test";
import assert from "node:assert/strict";
import {
  trailClimb, trailGrade, trailheadCountry, trailPlace, isComfortableDay,
  trailReasons, trailStory,
} from "../src/lib/trailStory.js";

const t = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

// Mount Korab (9): drawn summit to village.
const KORAB_9 = {
  id: 63428, category: "hike", country: "AL", distance_m: 7941,
  ascent_m: 7, descent_m: 1423, duration_min: 232, difficulty: "easy",
  f: { g: "moderate", gs: "tagged", rt: "point" },
};
// Mount Korab (9/1): Radomire to the summit.
const KORAB_9_1 = {
  id: 63433, category: "hike", country: "AL", distance_m: 12143,
  ascent_m: 1568, descent_m: 116, duration_min: 419, difficulty: "moderate",
  f: { g: "very_hard", gs: "derived", rt: "point" },
  reasons: [
    { ele: 2764, code: "summit", name: "Golem Korab" },
    { m: 1568, code: "bigClimb" },
    { km: 12.1, code: "dayOut" },
  ],
};

// 1. +7 m on a line dropping 1,400 m
test("a line drawn downhill is read uphill, both numbers kept", () => {
  assert.deepEqual(trailClimb(KORAB_9), { up: 1423, down: 7, storedDownhill: true });
  assert.deepEqual(trailClimb(KORAB_9_1), { up: 1568, down: 116, storedDownhill: false });
  assert.deepEqual(trailClimb({ ascent_m: 600, descent_m: 610 }),
    { up: 600, down: 610, storedDownhill: false });
  assert.deepEqual(trailClimb({}), { up: null, down: null, storedDownhill: false });
});

// 2. difficulty: moderate beside f.g: very_hard, and the page printed both
test("the story's difficulty sentence follows f.g, not difficulty", () => {
  assert.equal(trailGrade(KORAB_9_1), "very_hard");
  assert.equal(trailGrade({ difficulty: "moderate" }), "moderate");
  const { points } = trailStory(KORAB_9_1, null, { t, loop: false });
  const diff = points.find((p) => p.key === "difficulty");
  assert.equal(diff.text, "trails.sHard");
  const nine = trailStory(KORAB_9, null, { t, loop: false }).points
    .find((p) => p.key === "difficulty");
  assert.equal(nine.text, "trails.sModerate");
});

// 3. the trailhead is in Albania, the page said North Macedonia
test("the page names the trailhead's country, not the nearest town's", () => {
  const mavrovo = { city: "Mavrovo National Park", country: "North Macedonia", iso2: "MK" };
  const names = { AL: "Albania", MK: "North Macedonia" };
  const name = (iso) => names[iso] || null;
  assert.equal(trailheadCountry(KORAB_9_1), "AL");
  assert.deepEqual(trailPlace(KORAB_9_1, null, mavrovo, name),
    { city: null, country: "Albania" });
  // regionize.py's rg.sc wins over the row's own country.
  const filedInMk = { country: "MK", rg: { n3: "MK006", sc: "AL" } };
  assert.equal(trailheadCountry(filedInMk), "AL");
  // Same country: the town is named as before.
  const peshkopi = { city: "Peshkopi", country: "Albania", iso2: "AL" };
  assert.deepEqual(trailPlace(KORAB_9_1, null, peshkopi, name),
    { city: "Peshkopi", country: "Albania" });
});

// 4. highlights in Cyrillic: the name order is pipeline/trails/names.py
// display_name(), tested in tests/test_trail_data_bugs.py. Nothing in the app
// picks a script; it prints the name the wire carries.

// 5. "12.1 km, a comfortable day out" next to 1,568 m of climb
test("a comfortable day out is never claimed over a big climb", () => {
  assert.equal(isComfortableDay(KORAB_9_1), false);
  assert.equal(isComfortableDay(KORAB_9), false); // 1,423 m read uphill
  assert.equal(isComfortableDay({ ascent_m: 400, descent_m: 400, duration_min: 240 }), true);
  assert.equal(isComfortableDay({ ascent_m: 400, descent_m: 400, duration_min: 420 }), false);
  // Without the record, the bigClimb reason in the same list is the climb.
  assert.equal(isComfortableDay(null, KORAB_9_1.reasons), false);

  const why = trailReasons(KORAB_9_1.reasons, t).map((r) => r.text);
  assert.ok(why.some((s) => s.startsWith("trails.whyBigClimb")));
  assert.ok(!why.some((s) => s.startsWith("trails.whyDayOut")));

  const easy = [{ code: "dayOut", km: 9 }];
  assert.ok(trailReasons(easy, t, 6, { ascent_m: 300, descent_m: 300, duration_min: 200 })
    .some((r) => r.text.startsWith("trails.whyDayOut")));
});
