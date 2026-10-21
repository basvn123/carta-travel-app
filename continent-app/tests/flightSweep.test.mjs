// T514: the sweep's job planner and the file it publishes.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import {
  flattenRoutes, jobsForMinute, NEAR_CYCLE, FAR_CYCLE, NEAR_DAYS, FAR_WEEKS, km,
} from "../workers/flight-sweep/src/plan.mjs";
import { buildFile, buildIndex } from "../workers/flight-sweep/src/publish.mjs";

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

test("over 12 hours every route gets its 7 near days once", () => {
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

test("over a week every route gets 24 far days, in weeks 3 to 26", () => {
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
  for (let m = 0; m < 43200; m += 1) {
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
  for (let m = 0; m < 43200; m++) {
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
