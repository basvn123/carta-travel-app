// The personal match (T765, lib/match.js). Run: npm test
// Empty taste, one like, a conflict and the 55% floor, plus the promise that
// a taste reorders and never hides.
import test from "node:test";
import assert from "node:assert/strict";
import { fit, forYou, showMatch, strongMatch, sortForYou, MATCH } from "../src/lib/match.js";

const profile = (likes, extra = {}) => ({
  likes: Object.fromEntries(Object.entries(likes).map(([k, v]) => [k, [v, { n: 1 }]])),
  size: "village",
  crowd_by_month: [0, 0, 0, 1, 1, 2, 3, 3, 2, 1, 0, 0],
  car_need: false,
  ...extra,
});
const place = (score, likes, extra) => ({ rating: { score }, taste: profile(likes, extra) });

test("an empty taste returns null everywhere", () => {
  assert.equal(fit(null, profile({ hiking: 0.9 })), null);
  assert.equal(fit({ party: "couple" }, profile({ hiking: 0.9 })), null);
  assert.equal(forYou(place(8, { hiking: 0.9 }), {}), null);
});

test("one like: F is the place's value, the bar is p", () => {
  const f = fit({ likes: ["hiking"] }, profile({ hiking: 0.86 }));
  assert.equal(f.pct, 86);
  assert.equal(f.bars.length, 1);
  assert.equal(f.bars[0].p, 0.86);
  assert.equal(f.top[0].key, "hiking");
});

test("weights: a like is 1, size and quiet are 0.5 each", () => {
  const f = fit({ likes: ["hiking"], size: "village" }, profile({ hiking: 0.4 }));
  // (1 x 0.4 + 0.5 x 1) / 1.5
  assert.equal(f.F.toFixed(4), (0.9 / 1.5).toFixed(4));
});

test("a conflict multiplies F and is listed on its own", () => {
  const quietAug = fit({ likes: ["hiking"], quiet: "quiet" }, profile({ hiking: 0.9 }), 8);
  assert.equal(quietAug.conflicts.length, 1);
  assert.equal(quietAug.conflicts[0].key, "busy");
  const quietJan = fit({ likes: ["hiking"], quiet: "quiet" }, profile({ hiking: 0.9 }), 1);
  assert.equal(quietJan.conflicts.length, 0);
  assert.ok(quietAug.F < quietJan.F);
  const car = fit({ likes: ["hiking"], noCar: true }, profile({ hiking: 0.9 }, { car_need: true }));
  assert.equal(car.conflicts[0].key, "car");
  assert.equal(car.F.toFixed(4), (0.9 * MATCH.conflicts.car).toFixed(4));
  const heat = fit({ likes: ["hiking"] }, profile({ hiking: 0.9 }), 7, { avoidHeat: true, tmax: 33 });
  assert.equal(heat.conflicts[0].key, "heat");
  for (const c of Object.values(MATCH.conflicts)) assert.ok(c >= 0.6 && c <= 1, "factors stay in 0.6 to 1");
});

test("the 55% floor: below it no match shows; 70% is strong", () => {
  assert.ok(!showMatch(fit({ likes: ["beach"] }, profile({ beach: 0.54 }))));
  assert.ok(showMatch(fit({ likes: ["beach"] }, profile({ beach: 0.55 }))));
  assert.ok(!strongMatch(fit({ likes: ["beach"] }, profile({ beach: 0.69 }))));
  assert.ok(strongMatch(fit({ likes: ["beach"] }, profile({ beach: 0.7 }))));
  assert.ok(!showMatch(null));
});

test("forYou moves a place by at most lambda/2 points", () => {
  const best = forYou(place(8, { hiking: 1 }), { likes: ["hiking"] });
  const worst = forYou(place(8, { hiking: 0 }), { likes: ["hiking"] });
  assert.equal(best - 8, MATCH.lambda / 2);
  assert.equal(8 - worst, MATCH.lambda / 2);
});

test("forYou reads the month score when a month is set", () => {
  const p = { rating: { score: 8, month_scores: { 7: 6 } }, taste: profile({ hiking: 0.5 }) };
  assert.equal(forYou(p, { likes: ["hiking"] }, 7), 6);
  assert.equal(forYou(p, { likes: ["hiking"] }, 3), 8);
});

test("sortForYou never drops a place", () => {
  const list = [place(7, { lakes: 0.9 }), place(9, { lakes: 0.1 }), { rating: { score: 8.5 } }, { rating: null }];
  const out = sortForYou(list, { likes: ["lakes"] });
  assert.equal(out.length, list.length);
  assert.equal(out[0], list[1], "9.0 at 10% lakes = 8.2 beats 7.0 at 90% = 7.8");
  assert.equal(sortForYou(list, null).length, 4);
});
