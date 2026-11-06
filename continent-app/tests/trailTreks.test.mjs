// T1184 (ROADMAP D24): the trek a trail page shows, from the fixture wire.
// Run: npm test  (from continent-app/)
//
// tests/fixtures/trail_treks/{DE,AT}.json at the repo root are the inputs of
// tests/test_trail_treks.py; the trek records below are what
// pipeline/trails/treks.py builds from them (Werdenfelser Weg and the
// cross-border Grenzsteig, filed in DE).
import test from "node:test";
import assert from "node:assert/strict";
import { trekOfRow, trekTotals, trekCountry } from "../src/lib/treks.js";

const WERDENFELS = {
  id: "trek-r777", name: "Werdenfelser Weg", cc: "DE", countries: ["DE"],
  how: ["name", "superroute", "registry"], order: "name", n: 5, km: 40, up: 2000, down: 1750,
  min: 900, days: 5, missing: [5], osm: 777, wd: "Q999",
  stages: [
    { id: 102, i: 1, name: "Werdenfelser Weg Etappe 1", cc: "DE", km: 8, up: 400, min: 180 },
    { id: 104, i: 2, name: "Werdenfelser Weg Etappe 2", cc: "DE", km: 8, up: 400, min: 180 },
    { id: 101, i: 3, name: "Werdenfelser Weg Etappe 3", cc: "DE", km: 8, up: 400, min: 180 },
    { id: 103, i: 4, name: "Werdenfelser Weg Etappe 4", cc: "DE", km: 8, up: 400, min: 180 },
    { id: 105, i: 6, name: "Werdenfelser Weg Etappe 6", cc: "DE", km: 8, up: 400, min: 180 },
  ],
  _src: "osm", _asof: "2026-11-06",
};
const ISAR = {
  id: "trek-r4242", name: "Isarsteig", cc: "DE", row: 200, n: 2, km: 16, up: 800, days: 2,
  stages: [
    { id: 201, i: 1, name: "Isarsteig 1", cc: "DE", km: 8, up: 400 },
    { id: 202, i: 2, name: "Isarsteig 2", cc: "DE", km: 8, up: 400 },
  ],
};
const TREKS = [WERDENFELS, ISAR];

test("a stage row finds its trek by its own pointer", () => {
  const row = { id: 101, country: "DE", trek: { id: "trek-r777", cc: "DE", i: 3, n: 5 } };
  assert.equal(trekOfRow(TREKS, row), WERDENFELS);
});

test("a published parent row finds the trek it heads", () => {
  assert.equal(trekOfRow(TREKS, { id: 200, country: "DE", h: { cls: "parent" } }), ISAR);
});

test("a row with no trek gets none, and a stale pointer gets none", () => {
  assert.equal(trekOfRow(TREKS, { id: 600, country: "AT" }), null);
  assert.equal(trekOfRow(TREKS, { id: 9, trek: { id: "trek-gone", cc: "DE" } }), null);
  assert.equal(trekOfRow(null, { id: 9 }), null);
});

test("a cross-border stage reads the trek from the file that holds it", () => {
  assert.equal(trekCountry({ id: 502, country: "AT", trek: { id: "trek-x", cc: "DE" } }), "DE");
  assert.equal(trekCountry({ id: 200, country: "de" }), "DE");
});

test("the totals are the record's, and the gap is kept", () => {
  assert.deepEqual(trekTotals(WERDENFELS),
    { n: 5, km: 40, up: 2000, days: 5, noKm: 0, missing: [5] });
});

test("totals fall back to the stages and never count fewer days than stages", () => {
  const t = { stages: [{ id: 1, km: 7.6, up: 300 }, { id: 2, up: 100 }], days: 1 };
  assert.deepEqual(trekTotals(t), { n: 2, km: 8, up: 400, days: 2, noKm: 1, missing: [] });
});
