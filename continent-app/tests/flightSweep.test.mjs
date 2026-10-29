// T514: the sweep's job planner and the file it publishes.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  flattenRoutes, jobsForMinute, nextPause, routesInMinute, NEAR_CYCLE, FAR_CYCLE, FIND_CYCLE, NEAR_DAYS, FAR_WEEKS, km,
  PAUSE_BASE_MS, PAUSE_MAX_MS, lateJobsForMinute, lateJobsForRoute, lateFillOrder, LATE_CYCLE, LATE_WEEKS,
} from "../workers/flight-sweep/src/plan.mjs";
import { buildFile, buildIndex, nextBatch, priceOk, routeMoves } from "../workers/flight-sweep/src/publish.mjs";
import { ingestRows, tokenOk, MAX_ROWS } from "../workers/flight-sweep/src/ingest.mjs";

const ALL_YEAR = 4095;
const routes = {
  BRU: { BCN: ALL_YEAR, LIS: ALL_YEAR, FAO: 0b000001111000 }, // FAO: April to July only
  BCN: { BRU: ALL_YEAR },
  LIS: { BRU: ALL_YEAR },
};
const airports = { BRU: [50.9, 4.48], CRL: [50.46, 4.45], BCN: [41.3, 2.08], LIS: [38.77, -9.13], FAO: [37.01, -7.97] };
const NOW = Date.UTC(2026, 9, 21, 12, 0); // 21 October 2026, noon

test("routes flatten sorted, discovered routes join as all-year", () => {
  const list = flattenRoutes(routes, [["BRU", "FAO"], ["CRL", "LIS"]]);
  assert.deepEqual(list.map(([o, d]) => o + d), ["BCNBRU", "BRUBCN", "BRUFAO", "BRULIS", "LISBRU", "CRLLIS"]);
  assert.equal(list.at(-1)[2], ALL_YEAR);
});

test("over a near cycle every route gets its near days once (T780)", () => {
  const list = flattenRoutes(routes);
  const near = new Map();
  for (let m = 0; m < NEAR_CYCLE; m++) {
    for (const j of jobsForMinute(list, {}, NOW + m * 60000)) {
      if (j.tier === "near") near.set(j.o + j.d, (near.get(j.o + j.d) || 0) + 1);
    }
  }
  assert.equal(near.get("BRUBCN"), NEAR_DAYS.length);
  assert.equal(near.get("LISBRU"), NEAR_DAYS.length);
  // FAO flies April to July: nothing to search in late October.
  assert.equal(near.get("BRUFAO"), undefined);
});

test("over a far cycle every route gets 24 far days, in weeks 3 to 26", () => {
  const list = flattenRoutes(routes);
  const days = [];
  for (let m = 0; m < FAR_CYCLE; m++) {
    for (const j of jobsForMinute(list, {}, NOW + m * 60000)) {
      if (j.tier === "far" && j.o + j.d === "BRUBCN") days.push(j.date);
    }
  }
  assert.equal(days.length, FAR_WEEKS);
  assert.ok(days.every((d) => d >= "2026-11-04" && d <= "2027-04-30"));
  // FAO's far days fall only in its April to July season.
  const fao = [];
  for (let m = 0; m < FAR_CYCLE; m++) {
    for (const j of jobsForMinute(list, {}, NOW + m * 60000)) if (j.o + j.d === "BRUFAO") fao.push(j.date);
  }
  assert.ok(fao.length > 0 && fao.every((d) => ["04", "05", "06", "07"].includes(d.slice(5, 7))));
});

test("dormant routes are left to the find tier", () => {
  const list = flattenRoutes(routes);
  const dormant = new Set(["BRUBCN"]);
  let near = 0;
  let found = 0;
  for (let m = 0; m < FIND_CYCLE; m += 1) {
    for (const j of jobsForMinute(list, airports, NOW + m * 60000, dormant)) {
      if (j.o + j.d !== "BRUBCN") continue;
      if (j.tier === "find") found++; else near++;
    }
  }
  assert.equal(near, 0);
  assert.equal(found, 1);
});

test("the find tier skips pairs closer than 150 km and known routes", () => {
  const list = flattenRoutes(routes);
  const finds = [];
  for (let m = 0; m < FIND_CYCLE; m++) {
    for (const j of jobsForMinute(list, airports, NOW + m * 60000)) if (j.tier === "find") finds.push(j.o + j.d);
  }
  assert.ok(km(airports.BRU, airports.CRL) < 150);
  assert.ok(!finds.includes("BRUCRL") && !finds.includes("CRLBRU"));
  assert.ok(!finds.includes("BRUBCN"));
  // Faro to Lisbon is about 220 km: far enough to look for a flight.
  assert.ok(finds.includes("CRLBCN") && finds.includes("FAOLIS"));
});

test("the published file keeps the cheapest flight per day and marks empty days", () => {
  const rows = [
    { dest: "BCN", date: "2026-11-18", price: 87, airline: "VY", dep: "21:55", arr: "23:59", stops: 0, checked: 1761080400 },
    { dest: "BCN", date: "2026-11-20", price: null, airline: null, dep: null, arr: null, stops: null, checked: 1761080400 },
  ];
  const back = [
    { origin: "BCN", date: "2026-11-25", price: 64, airline: "FR", dep: "06:30", arr: "08:40", stops: 0, checked: 1761080400 },
  ];
  const file = buildFile("BRU", rows, "2026-10-21T21:07:00Z", back);
  assert.equal(file.v, 1);
  assert.equal(file.from, "BRU");
  assert.deepEqual(file.to.BCN["2026-11-18"], [87, "VY", "21:55", "23:59", 0, 29351340]);
  assert.equal(file.to.BCN["2026-11-20"], null);
  assert.deepEqual(file.back.BCN["2026-11-25"], [64, "FR", "06:30", "08:40", 0, 29351340]);
});

test("the index names every airline and says which have a logo", () => {
  const idx = buildIndex({ BRU: 40 }, [
    { code: "VY", name: "Vueling", logo: 1 },
    { code: "FR", name: "Ryanair", logo: 0 },
  ], "2026-10-21T21:07:00Z");
  assert.deepEqual(Object.keys(idx.airlines), ["FR", "VY"]);
  assert.deepEqual(idx.airlines.VY, { name: "Vueling", logo: true });
  assert.equal(idx.airlines.FR.logo, false);
  assert.equal(idx.origins.BRU, 40);
});

// T645: the publish gate leaves out implausible prices and reports big moves.
test("priceOk: zero, negative and above the distance ceiling are out", () => {
  assert.equal(priceOk(0, 500), false);
  assert.equal(priceOk(-5, 500), false);
  assert.equal(priceOk(87, 1300), true);
  assert.equal(priceOk(8700, 1300), false);           // cents read as euros
  assert.equal(priceOk(1200, null), true);
  assert.equal(priceOk(2000, null), false);
});

test("buildFile leaves rejected days out and counts them", () => {
  const airports = { BRU: [50.9, 4.48], BCN: [41.3, 2.08] };
  const stats = {};
  const file = buildFile("BRU", [
    { dest: "BCN", date: "2026-11-18", price: 87, airline: "VY", dep: "21:55", arr: "23:59", stops: 0, checked: 1 },
    { dest: "BCN", date: "2026-11-19", price: 8700, airline: "VY", dep: "21:55", arr: "23:59", stops: 0, checked: 1 },
    { dest: "BCN", date: "2026-11-20", price: null, checked: 1 },
  ], "2026-10-23T20:00:00Z", [], airports, stats);
  assert.deepEqual(Object.keys(file.to.BCN), ["2026-11-18", "2026-11-20"]);
  assert.equal(file.to.BCN["2026-11-20"], null);
  assert.equal(stats.rejected, 1);
});

test("routeMoves reports a route median that moved over 40%", () => {
  const f = (p) => ({ to: { BCN: { a: [p], b: [p + 2] }, LIS: { a: [60] } } });
  assert.deepEqual(routeMoves(f(50), f(52)), []);
  assert.deepEqual(routeMoves(f(50), f(150)).map((m) => m.dest), ["BCN"]);
});

// T739: publish works through a queue so one run stays under 1,000 calls.
test("nextBatch starts a queue, carries the rest and keeps its start time", () => {
  const codes = Array.from({ length: 150 }, (_, i) => `A${String(i).padStart(3, "0")}`);
  const first = nextBatch(null, [...codes, "A000"], 1000, 60);
  assert.equal(first.batch.length, 60);
  assert.equal(first.rest.length, 90);
  assert.equal(first.started, 1000);
  const second = nextBatch({ queue: first.rest, started: first.started }, ["NEW"], 2000, 60);
  assert.equal(second.batch[0], "A060");
  assert.equal(second.started, 1000);           // the queue's start, not this run's
  const last = nextBatch({ queue: second.rest, started: 1000 }, [], 3000, 60);
  assert.equal(last.rest.length, 0);
  assert.equal(nextBatch({ queue: [], started: 1 }, ["X"], 4000).started, 4000);
});

test("a refusal pauses an hour, a refusal soon after doubles it, up to a day (T780)", () => {
  const H = 3600000;
  assert.deepEqual(nextPause(NOW), { until: NOW + PAUSE_BASE_MS, level: 0 });
  // Blocked again 10 minutes after the last pause ended: two hours.
  assert.deepEqual(nextPause(NOW, NOW - 10 * 60000, 0), { until: NOW + 2 * H, level: 1 });
  assert.equal(nextPause(NOW, NOW - 60000, 9).until, NOW + PAUSE_MAX_MS);
  // Quiet for 3 hours since the last pause: back to one hour.
  assert.deepEqual(nextPause(NOW, NOW - 3 * H, 4), { until: NOW + H, level: 0 });
});

test("the near cycle stays inside the app's near fare age (T780)", () => {
  const age = JSON.parse(readFileSync(new URL("../config/pricing.json", import.meta.url)))
    .rules["flights.max_age_days"].value;
  assert.ok(NEAR_CYCLE * 60000 < age.near * 86400000);
  assert.ok(FAR_CYCLE * 60000 < age.far * 86400000);
});

test("each route has exactly one minute a cycle, spread evenly when there are fewer routes (T780)", () => {
  for (const [cycle, n] of [[10, 25], [20, 7], [20160, 10094]]) {
    const seen = new Array(n).fill(0);
    let most = 0;
    for (let m = 0; m < cycle; m++) {
      const rs = routesInMinute(m, cycle, n);
      most = Math.max(most, rs.length);
      rs.forEach((r) => seen[r]++);
    }
    assert.ok(seen.every((c) => c === 1), `cycle ${cycle}, ${n} routes`);
    assert.ok(most <= Math.ceil(n / cycle), `cycle ${cycle}: at most ${Math.ceil(n / cycle)} a minute`);
  }
});

test("the late tier picks up where the far tier stops, weeks 27 to 40, each route once in 4 weeks (T798)", () => {
  const list = flattenRoutes(routes);
  const DAY = 86400000;
  const aheadOf = (j, at) => (Date.parse(j.date) - Math.floor(at / DAY) * DAY) / DAY;
  let farMost = 0;
  let lateLeast = Infinity;
  const lateDays = new Map();
  for (let m = 0; m < LATE_CYCLE; m++) {
    const at = NOW + m * 60000;
    if (m < FAR_CYCLE) {
      for (const j of jobsForMinute(list, airports, at)) if (j.tier === "far") farMost = Math.max(farMost, aheadOf(j, at));
    }
    for (const j of lateJobsForMinute(list, at)) {
      const key = j.o + j.d;
      lateDays.set(key, (lateDays.get(key) || 0) + 1);
      const ahead = aheadOf(j, at);
      lateLeast = Math.min(lateLeast, ahead);
      assert.ok(ahead < 14 + 7 * (FAR_WEEKS + LATE_WEEKS), `${j.date} is ${ahead} days out`);
    }
  }
  // On any day, the far tier's last date comes before the late tier's first.
  assert.ok(farMost < lateLeast, `far up to ${farMost}, late from ${lateLeast}`);
  assert.equal(lateLeast, 14 + 7 * FAR_WEEKS);
  // All-year routes get every one of their LATE_WEEKS days once; FAO flies April to July only.
  assert.equal(lateDays.get("BRUBCN"), LATE_WEEKS);
  assert.ok(lateDays.get("BRUFAO") > 0 && lateDays.get("BRUFAO") < LATE_WEEKS);
});

test("the late cycle stays inside the app's late fare age, which starts where the far tier ends (T798)", () => {
  const age = JSON.parse(readFileSync(new URL("../config/pricing.json", import.meta.url)))
    .rules["flights.max_age_days"].value;
  assert.ok(LATE_CYCLE * 60000 < age.late * 86400000);
  assert.equal(age.late_after_days, 14 + 7 * FAR_WEEKS - 1);
});

test("ingest keeps fares that look like fares and drops the rest (T798)", () => {
  const now = Date.UTC(2026, 9, 28, 12);
  const good = { o: "BRU", d: "BCN", date: "2027-06-15", price: 41, airline: "VY", airlineName: "Vueling",
    flightNo: "VY8481", dep: "07:00", arr: "09:05", stops: 0 };
  const { rows, dropped } = ingestRows({ rows: [
    good,
    { o: "BRU", d: "BCN", date: "2027-06-22", price: null },
    { ...good, o: "bru" },
    { ...good, d: "BRU" },
    { ...good, date: "2026-10-01" },
    { ...good, date: "2029-01-01" },
    { ...good, price: 41.5 },
    { ...good, price: "41" },
  ] }, now);
  assert.equal(rows.length, 2);
  assert.equal(dropped, 6);
  assert.deepEqual(rows[0], good);
  assert.equal(rows[1].airline, null, "no flight: no airline");
  assert.throws(() => ingestRows({}, now));
  assert.throws(() => ingestRows({ rows: new Array(MAX_ROWS + 1).fill(good) }, now));
});

test("ingest needs the exact bearer token (T798)", async () => {
  assert.equal(await tokenOk("Bearer s3cret", "s3cret"), true);
  assert.equal(await tokenOk("Bearer s3cre", "s3cret"), false);
  assert.equal(await tokenOk("s3cret", "s3cret"), false);
  assert.equal(await tokenOk("Bearer ", ""), false, "no secret set: nobody gets in");
  assert.equal(await tokenOk(null, "s3cret"), false);
});

test("the fill takes exactly the routes the late cycle does not reach in its span, and each still gets its turn within a cycle (T819)", () => {
  for (const [n, span] of [[10094, 7 * 1440], [10094, 3 * 1440], [7, 7 * 1440]]) {
    for (const at of [NOW, NOW + 12345 * 60000, NOW + 39000 * 60000]) {
      const fill = new Set(lateFillOrder(n, at, span));
      const cycle = new Set();
      const m0 = Math.floor(at / 60000);
      for (let m = m0; m < m0 + span; m++) for (const r of routesInMinute(m, LATE_CYCLE, n)) cycle.add(r);
      for (let r = 0; r < n; r++) assert.ok(fill.has(r) !== cycle.has(r), `n ${n}: route ${r} in exactly one`);
    }
  }
  // Every route's next turn after the fill window comes within one cycle.
  assert.equal(lateFillOrder(10094, NOW, LATE_CYCLE).length, 0, "a span of a whole cycle leaves nothing to fill");
});

test("a route's late jobs are the ones its minute would give (T819)", () => {
  const list = flattenRoutes(routes);
  for (let m = 0; m < LATE_CYCLE; m++) {
    const rs = routesInMinute(Math.floor(NOW / 60000) + m, LATE_CYCLE, list.length);
    if (!rs.length) continue;
    const at = NOW + m * 60000;
    assert.deepEqual(lateJobsForMinute(list, at), rs.flatMap((r) => lateJobsForRoute(list, r, at)));
  }
});
