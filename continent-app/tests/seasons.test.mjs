// T1202 (D18): seasons and closures. lib/season.js reads the destination's
// `season` block (pipeline/harvest_seasons.py); the plan flow's candidates
// never suggest a place in a month it is shut (medium or high confidence).
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { closedMonths, openIn, seasonItems } from "../src/lib/season.js";
import { bestMonth, buildCandidates } from "../src/lib/recommend/candidates.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const data = existsSync(pub("app_data.json")) ? JSON.parse(readFileSync(pub("app_data.json"), "utf8")) : null;
const skip = data ? false : "public/app_data.json is not on this machine";
const BRUSSELS = { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" };
const SUMMER = { open: [6, 7, 8, 9], conf: "high", why: "ferry", _src: "osm_seasons", _asof: "2026-11-07" };

test("closed months are the complement of the open ones; none without a block", () => {
  assert.deepEqual(closedMonths(SUMMER), [1, 2, 3, 4, 5, 10, 11, 12]);
  assert.deepEqual(closedMonths({ open: [12, 1, 2] }), [3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(closedMonths(null), []);
  assert.deepEqual(closedMonths({ items: [] }), []);
  assert.deepEqual(closedMonths({ open: Array.from({ length: 12 }, (_, i) => i + 1) }), []);
  assert.deepEqual(closedMonths({ open: [0, 13, "5"] }), []);
});

test("openIn skips only medium or high confidence; a low one is still suggested", () => {
  assert.equal(openIn({ season: SUMMER }, 5), false);
  assert.equal(openIn({ season: SUMMER }, 7), true);
  assert.equal(openIn({ season: { ...SUMMER, conf: "medium" } }, 1), false);
  assert.equal(openIn({ season: { ...SUMMER, conf: "low" } }, 1), true);
  assert.equal(openIn({}, 1), true);
  assert.equal(openIn({ season: SUMMER }, null), true);
});

test("seasonal items need a name and a part-year month list", () => {
  const items = seasonItems({ items: [
    { n: "Knorrhuette", k: "hut", open: [6, 7, 8, 9, 10], conf: "high" },
    { n: "", k: "lift", open: [1], conf: "low" },
    { n: "All year", k: "ferry", open: Array.from({ length: 12 }, (_, i) => i + 1), conf: "high" },
  ] });
  assert.deepEqual(items.map((r) => r.n), ["Knorrhuette"]);
});

test("bestMonth does not choose a month the first place is shut", () => {
  const d = { season: { open: [7, 8], conf: "high" }, taste: { tmax_by_month: [5, 6, 10, 14, 19, 23, 26, 26, 21, 15, 9, 6] } };
  // 18 C asked: May (19 C) would win, but the place opens in July.
  const m = bestMonth([d], "mild", "2026-10-28");
  assert.ok([7, 8].includes(m), `month ${m}`);
  const open = bestMonth([{ ...d, season: null }], "mild", "2026-10-28");
  assert.ok(![7, 8].includes(open), `without a season block: ${open}`);
});

const settings = (places, start = "2027-05-08", end = "2027-05-15") => normalizeSettings({
  answered: ["who", "when"],
  party: { kind: "couple", adults: 2 },
  when: { mode: "exact", start, end, nights: 7 },
  guide: { shapes: ["one"], likes: ["food"] },
  places,
});

test("the plan flow skips a place in a month it is shut, and suggests it when open", { skip }, () => {
  const dests = data.destinations;
  const id = Object.keys(dests).find((k) => dests[k].iso2 === "HR" && dests[k].tier === "gem" && dests[k].image?.url
    && (dests[k].categories || []).includes("island"));
  assert.ok(id, "a Croatian island in the catalogue");
  const d = dests[id];
  const town = { kind: "place", id, name: d.city, iso2: d.iso2, country: d.country };
  const seeded = { ...data, destinations: { ...dests, [id]: { ...d, season: SUMMER } } };
  const build = (s, catalogue) => buildCandidates({ data: catalogue, settings: s, origin: BRUSSELS, flights: null, today: "2026-10-30" });
  const has = (trips) => trips.some((c) => c.places.some((p) => p.id === id));

  // May: open before the seeding, shut after it.
  assert.ok(has(build(settings([town]), data)), "suggested in May with no season block");
  const may = build(settings([town]), seeded);
  assert.ok(!has(may), "not suggested in May once its ferries run Jun to Sep only");
  assert.ok(may.length > 0, "the trips go on from the other places of its country");
  // July: open.
  assert.ok(has(build(settings([town], "2027-07-10", "2027-07-17"), seeded)), "suggested in July");
  // Low confidence: still suggested in May.
  const low = { ...data, destinations: { ...dests, [id]: { ...d, season: { ...SUMMER, conf: "low" } } } };
  assert.ok(has(build(settings([town]), low)), "a low-confidence season does not hide the place");
});
