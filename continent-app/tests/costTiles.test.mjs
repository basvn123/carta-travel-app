// T820: the trip overview's four cost tiles (Flights, Getting around, Stay,
// Food) are sums of quoteTrip()'s parts, so they add up to the total to the
// cent for every shape of trip, and every receipt line lands in one tile.
// Run: npm test (continent-app/). Pure: no app data needed.
import test from "node:test";
import assert from "node:assert/strict";
import { costTiles, tileOfLine } from "../src/lib/price/tiles.js";

const base = (over = {}) => ({
  parts: { travel: 0, flights: 0, transfers: 0, drive: 0, between: 0, car: 0, daytrips: 0, beds: 0, days: 0, ...over.parts },
  flight: over.flight ?? { combinable: true },
  cartaFlight: over.cartaFlight ?? { out: { cost: { total: 1 } }, back: { cost: { total: 1 } } },
  travelSplit: over.travelSplit ?? { legacy: false, out: 0, back: 0 },
  grandTotal: 0,
});
const withTotal = (p) => ({ ...p, grandTotal: Math.round(Object.values(p.parts).reduce((n, v) => n + v, 0) * 100) / 100 });
const sum = (tiles) => Math.round(tiles.reduce((n, t) => n + t.eur, 0) * 100) / 100;

const SHAPES = {
  "carta flight, one stop, 2 people": { parts: { flights: 412.4, transfers: 38.2, beds: 1197, days: 571.76 } },
  "own fare typed": { flight: { own: true, cost_total: 300 }, cartaFlight: {}, parts: { travel: 300, transfers: 20.5, beds: 800, days: 410.33 } },
  "drive trip with car hire": { flight: { driving: true }, cartaFlight: {}, parts: { drive: 182.37, car: 64.1, between: 12.5, beds: 640, days: 320.01 } },
  "three stops with hops": { parts: { flights: 233.33, transfers: 41, between: 87.65, beds: 1501.11, days: 702.29 } },
  "four people with children, cents everywhere": { parts: { flights: 999.99, transfers: 0.01, between: 33.33, car: 0, beds: 2222.22, days: 1111.11 } },
  "a stop with day trips (T843)": { parts: { flights: 412.4, transfers: 38.2, between: 16.26, daytrips: 48.6, beds: 1197, days: 571.76 } },
};

for (const [name, shape] of Object.entries(SHAPES)) {
  test(`tiles add up to the total: ${name}`, () => {
    const priced = withTotal(base(shape));
    const tiles = costTiles(priced);
    assert.equal(tiles.length, 4);
    assert.deepEqual(tiles.map((t) => t.key), ["travel", "around", "stay", "food"]);
    assert.equal(sum(tiles), priced.grandTotal);
    // Every part is in exactly one tile.
    const seen = tiles.flatMap((t) => t.parts);
    assert.equal(new Set(seen).size, seen.length);
    assert.equal(seen.length, 9);
  });
}

test("a drive trip's first tile is driving and holds the drive", () => {
  const tiles = costTiles(withTotal(base(SHAPES["drive trip with car hire"])));
  assert.equal(tiles[0].driving, true);
  assert.equal(tiles[0].eur, 182.37);
  assert.equal(tiles[1].eur, 76.6);
});

test("no flight found marks the travel tile missing, never as a €0 price", () => {
  const tiles = costTiles(withTotal(base({ cartaFlight: { out: null, back: null }, parts: { beds: 500, days: 200 } })));
  assert.equal(tiles[0].missing, true);
  assert.equal(tiles[0].empty, false);
  assert.equal(tiles[1].empty, true);
});

test("one way paid by the traveller is not missing", () => {
  const tiles = costTiles(withTotal(base({ cartaFlight: { out: null, back: { cost: { total: 90 } } }, travelSplit: { legacy: false, out: 120, back: 0 }, parts: { travel: 120, flights: 90 } })));
  assert.equal(tiles[0].missing, false);
  assert.equal(tiles[0].eur, 210);
});

test("no priced trip gives no tiles", () => {
  assert.deepEqual(costTiles(null), []);
  assert.deepEqual(costTiles({}), []);
});

test("every receipt line has a tile", () => {
  for (const k of ["out", "back", "travel", "transfers", "between", "car", "beds", "days"]) {
    assert.ok(["travel", "around", "stay", "food"].includes(tileOfLine(k)));
  }
  assert.equal(tileOfLine("drive", true), "travel");
  assert.equal(tileOfLine("drive", false), "around");
});
