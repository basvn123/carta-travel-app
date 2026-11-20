// G12 map view round 2: the match's points, the new sorts, the Score and
// match filters and the quick chips. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fit, matchPoints } from "../src/lib/match.js";
import {
  sortExtra, scoreOk, matchOk, quickOn, quickPatch, quickChips, sortOptionsFor, MATCH_MIN,
} from "../src/browse/filters/filterModel.js";

const LIKES = ["hiking", "culture", "food", "beach", "nightlife", "nature", "wine", "city"];
const profile = (likes, extra = {}) => ({
  likes: Object.fromEntries(Object.entries(likes).map(([k, v]) => [k, [v, { n: 1 }]])),
  size: "village",
  crowd_by_month: [0, 0, 0, 1, 1, 2, 3, 3, 2, 1, 0, 0],
  car_need: true,
  ...extra,
});

// A small seeded generator, so a failure can be replayed.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

test("match points add up to the shown % for random tastes, conflicts included", () => {
  const r = rng(7);
  let checked = 0;
  for (let i = 0; i < 400; i += 1) {
    const likes = LIKES.filter(() => r() < 0.4);
    const taste = {
      likes,
      size: ["village", "town", "city", "mix", null][Math.floor(r() * 5)],
      quiet: ["quiet", "lively", null][Math.floor(r() * 3)],
      noCar: r() < 0.3,
    };
    const prof = profile(Object.fromEntries(LIKES.map((k) => [k, Math.round(r() * 1000) / 1000])));
    const month = 1 + Math.floor(r() * 12);
    const f = fit(taste, prof, month);
    if (!f) continue;
    const m = matchPoints(f);
    assert.ok(m, "points for every fit");
    const sum = m.rows.reduce((s, x) => s + x.points, 0);
    assert.equal(sum - m.conflict, f.pct, `taste ${JSON.stringify(taste)} month ${month}`);
    assert.ok(m.conflict >= 0);
    if (!f.conflicts.length) assert.equal(m.conflict, 0);
    // The shares are the weights over the whole: they add up to 1.
    assert.ok(Math.abs(m.rows.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
    // The two tags sit on the two rows with the most points.
    const tagged = m.rows.filter((x) => x.tag);
    assert.ok(tagged.length <= 2);
    const top = [...m.rows].sort((a, b) => b.points - a.points);
    if (tagged.length) assert.equal(tagged.find((x) => x.tag === "strongest").points, top[0].points);
    checked += 1;
  }
  assert.ok(checked > 100, `${checked} fits checked`);
});

test("match points: one like is all the points", () => {
  const f = fit({ likes: ["hiking"] }, profile({ hiking: 0.86 }));
  const m = matchPoints(f);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].points, 86);
  assert.equal(m.rows[0].tag, "strongest");
  assert.equal(matchPoints(null), null);
});

const P = (id, extra = {}) => ({ id, city: id, rating: { score: 7 }, cost: { dayEur: 50 }, city_lat: 50, city_lon: 4, ...extra });

test("price high to low: dearest first, no figure last, ties keep their order", () => {
  const rows = [P("a", { cost: { dayEur: 40 } }), P("b", { cost: null }), P("c", { cost: { dayEur: 90 } }), P("d", { cost: { dayEur: 40 } })];
  assert.deepEqual(sortExtra(rows, "costDesc").map((p) => p.id), ["c", "a", "d", "b"]);
});

test("distance: nearest to the From place first; no home keeps the order", () => {
  const home = { lat: 50.85, lon: 4.35, name: "Brussels" };
  const rows = [P("far", { city_lat: 41.9, city_lon: 12.5 }), P("near", { city_lat: 51.2, city_lon: 4.4 }), P("mid", { city_lat: 48.85, city_lon: 2.35 }), P("none", { city_lat: null, city_lon: null })];
  assert.deepEqual(sortExtra(rows, "distance", { home }).map((p) => p.id), ["near", "mid", "far", "none"]);
  assert.deepEqual(sortExtra(rows, "distance").map((p) => p.id), ["far", "near", "mid", "none"]);
});

test("hidden gems first, each part in the order it came", () => {
  const gem = (id) => P(id, { rating: { score: 6, hidden_gem: true } });
  const rows = [P("a"), gem("g1"), P("b"), gem("g2")];
  assert.deepEqual(sortExtra(rows, "gemsFirst").map((p) => p.id), ["g1", "g2", "a", "b"]);
  assert.deepEqual(sortExtra(rows, "beauty").map((p) => p.id), ["a", "g1", "b", "g2"]);
});

test("Distance is offered only with a From place, and names it", () => {
  assert.ok(!sortOptionsFor(false).some((o) => o.key === "distance"));
  const d = sortOptionsFor(true, { name: "Brussels" }).find((o) => o.key === "distance");
  assert.deepEqual(d.args, { place: "Brussels" });
  assert.equal(sortOptionsFor(true, { name: "Brussels" })[0].key, "foryou");
  assert.equal(sortOptionsFor(false).at(-1).key, "name");
});

test("Score 8+: a Score of 8 or more; no Score never passes", () => {
  assert.equal(scoreOk(P("a", { rating: { score: 8 } }), 8), true);
  assert.equal(scoreOk(P("a", { rating: { score: 7.99 } }), 8), false);
  assert.equal(scoreOk(P("a", { rating: null }), 8), false);
  assert.equal(scoreOk(P("a", { rating: null }), null), true);
});

test("Match 70%+: the fit reaches 0.7; no fit never passes; no taste holds nothing back", () => {
  const taste = { likes: ["hiking"] };
  const fitOf = (p) => fit(taste, p.taste);
  assert.equal(matchOk({ taste: profile({ hiking: 0.7 }) }, MATCH_MIN, fitOf), true);
  assert.equal(matchOk({ taste: profile({ hiking: 0.69 }) }, MATCH_MIN, fitOf), false);
  assert.equal(matchOk({ taste: null }, MATCH_MIN, fitOf), false);
  assert.equal(matchOk({ taste: null }, MATCH_MIN, null), true);
  assert.equal(matchOk({ taste: null }, null, fitOf), true);
});

test("quick chips: each patch turns its own chip on and off again", () => {
  const xf = { picks: [], temps: [], budget: null, minScore: null, minMatch: null };
  for (const id of ["score8", "budget", "warm", "water", "hiking", "gems", "match", "saved"]) {
    const on = quickPatch(id, true, xf);
    const st = { xf: { ...xf, ...(on.xf || {}) }, gemOnly: !!on.gemOnly, showFavOnly: !!on.showFavOnly };
    assert.equal(quickOn(id, st), true, `${id} on`);
    const off = quickPatch(id, false, st.xf);
    const st2 = { xf: { ...st.xf, ...(off.xf || {}) }, gemOnly: off.gemOnly ?? st.gemOnly, showFavOnly: off.showFavOnly ?? st.showFavOnly };
    assert.equal(quickOn(id, st2), false, `${id} off`);
  }
});

test("quick chips: an active chip moves to the front; warm needs a month, match a taste", () => {
  const xf = { picks: ["hiking"], temps: [], budget: null, minScore: null, minMatch: null };
  const ids = quickChips({ xf, gemOnly: false, showFavOnly: false, hasMonth: false, hasTaste: false }).map((c) => c.id);
  assert.equal(ids[0], "hiking");
  assert.ok(!ids.includes("warm") && !ids.includes("match"));
  const all = quickChips({ xf, gemOnly: true, showFavOnly: false, hasMonth: true, hasTaste: true }).map((c) => c.id);
  assert.deepEqual(all.slice(0, 2), ["hiking", "gems"]);
  assert.equal(all.length, 8);
});
