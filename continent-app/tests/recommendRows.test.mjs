// G12 plan rethink, lane R2: themed rows from the trips already priced.
// Never an empty row, a "Not yet" total never wins Cheapest, a ceiling
// keeps every row under it, at most 4 rows, rows per start.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { themedRows, startOf, rowWhy, ROWS_BY_START, MAX_ROWS } from "../src/lib/recommend/rows.js";

const trip = (id, eur, { mins = 120, hi = 22, crowd = 2, month = 5, out = false, delta = null } = {}) => ({
  id, iso2: "IT", shape: "one", month, score: 0.5, total: { group: eur, perPerson: eur / 2 },
  slots: [{ id: "flight", eur: out ? null : 100 }, { id: "stay", eur: 200 }],
  budget: delta == null ? null : { eur: 1000, delta },
  _m: mins, _hi: hi, _c: crowd,
});
const acc = {
  minutes: (x) => x._m,
  highs: (x) => (x._hi == null ? null : { hi: x._hi }),
  crowd: (x) => x._c,
};

const pool = [
  trip("a", 1500, { mins: 300, hi: 18 }),
  trip("b", 1400, { mins: 280, hi: 19 }),
  trip("c", 1300, { mins: 260, hi: 17 }),
  trip("d", 1200, { mins: 240, hi: 16 }),
  trip("e", 1100, { mins: 220, hi: 15 }),
  trip("f", 1000, { mins: 200, hi: 14 }),
  trip("g", 900, { mins: 90, hi: 26, crowd: 1 }),
  trip("h", 800, { mins: 80, hi: 27, crowd: 0 }),
  trip("i", 700, { mins: 100, hi: 25, crowd: 1 }),
  trip("x", 100, { mins: 60, out: true }),
];
const topIds = ["a", "b", "c", "d", "e", "f"];

test("R2: the start decides the rows", () => {
  assert.equal(startOf({}), "open");
  assert.equal(startOf({ when: { mode: "months", months: [5] } }), "when");
  assert.equal(startOf({ when: { mode: "any" }, answered: ["when"] }), "when");
  assert.equal(startOf({ guide: { budget: { eur: 900 } } }), "budget");
  const open = themedRows(pool, { ...acc, topIds, settings: {} }).map((r) => r.key);
  assert.ok(open.every((k) => ROWS_BY_START.open.includes(k)));
  assert.ok(open.includes("warm"));
  const when = themedRows(pool, { ...acc, topIds, settings: { when: { mode: "months", months: [5] } } }).map((r) => r.key);
  assert.ok(when.includes("quiet") && !when.includes("warm"));
});

test("R2: a total with a Not yet line never wins Cheapest", () => {
  const rows = themedRows(pool, { ...acc, topIds, settings: {} });
  const cheap = rows.find((r) => r.key === "cheapest");
  assert.ok(cheap);
  assert.equal(cheap.trips[0].id, "i");
  assert.ok(!cheap.trips.some((x) => x.id === "x"));
});

test("R2: never an empty row: fewer than 2 trips beyond the top set, no row", () => {
  // Only one warm trip outside the top set.
  const few = pool.map((x) => (["h", "i", "x"].includes(x.id) ? { ...x, _hi: 10 } : x));
  assert.ok(!themedRows(few, { ...acc, topIds, settings: {} }).some((r) => r.key === "warm"));
  assert.deepEqual(themedRows([pool[0]], { ...acc, settings: {} }), []);
  assert.deepEqual(themedRows(null), []);
  for (const r of themedRows(pool, { ...acc, topIds, settings: {} })) assert.ok(r.trips.length >= 2 && r.extra >= 2);
});

test("R2: a ceiling keeps every row under it", () => {
  const capped = pool.map((x, i) => ({ ...x, budget: { eur: 1000, delta: i % 2 ? 50 : -50 } }));
  const rows = themedRows(capped, { ...acc, topIds: [], settings: { guide: { budget: { eur: 1000, mode: "cap" } } } });
  for (const r of rows) for (const x of r.trips) assert.ok(x.budget.delta <= 0, `${r.key} holds ${x.id} over the ceiling`);
  // A guide (soft) budget keeps them, sunk by the rank.
  const soft = themedRows(capped, { ...acc, topIds: [], settings: { guide: { budget: { eur: 1000, mode: "soft" } } } });
  assert.ok(soft.some((r) => r.trips.some((x) => x.budget.delta > 0)));
});

test("R2: at most 4 rows, and the warm row names the shared month", () => {
  const rows = themedRows(pool, { ...acc, topIds, settings: {}, max: 2 });
  assert.ok(rows.length <= 2);
  assert.ok(themedRows(pool, { ...acc, topIds, settings: {} }).length <= MAX_ROWS);
  const warm = themedRows(pool, { ...acc, topIds, settings: {} }).find((r) => r.key === "warm");
  assert.equal(warm.month, 5);
});

test("R2: a row card's why is the row's reason, honest about money", () => {
  const rows = themedRows(pool, { ...acc, topIds, settings: {} });
  const cheap = rows.find((r) => r.key === "cheapest");
  assert.deepEqual(rowWhy(cheap, pool[8], acc), { key: "tf.row.less", eur: 800 });
  // Not cheaper than the best pick: no money claim, the trip's own reason instead.
  assert.equal(rowWhy(cheap, pool[0], acc), null);
  // A best pick whose total leaves a line out compares with nothing.
  assert.equal(rowWhy({ ...cheap, best: pool[9] }, pool[8], acc), null);
  const near = rows.find((r) => r.key === "near");
  assert.deepEqual(rowWhy(near, pool[7], acc), { key: "tf.row.time", minutes: 80 });
});

test("G12 B5: Close by falls back to km from home when the flight times are missing, labelled as distance", () => {
  const km = { g: 900, h: 400, i: 1200, x: 300 };
  const untimed = pool.map((x) => ({ ...x, _m: null }));
  const opts = { ...acc, minutes: () => null, km: (x) => km[x.id] ?? null, topIds };
  const near = themedRows(untimed, opts).find((r) => r.key === "near");
  assert.ok(near, "a distance row instead of none");
  assert.equal(near.basis, "km");
  assert.deepEqual(near.trips.map((x) => x.id), ["x", "h", "g", "i"]);
  assert.deepEqual(rowWhy(near, near.trips[1], opts), { key: "tf.row.km", km: 400 });
  // With enough clock times the row stays a travel time.
  const timed = themedRows(pool, { ...acc, km: (x) => km[x.id] ?? null, topIds }).find((r) => r.key === "near");
  assert.equal(timed.basis, "");
});
