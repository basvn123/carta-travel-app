#!/usr/bin/env node
// T1100 (ROADMAP D13): the way-there pick on 50 origin and destination pairs.
//
// For five homes and ten places it prices every way the app prices (the train,
// the coach and the car through lib/travelWay.js groundReturn, the flight from
// a swept file) and prints, per pair, the way the card opened on before
// (the cheapest) and the way lib/wayChoice.js picks now, with the door-to-door
// hours and the price a person.
//
//   node scripts/way_choice_pairs.mjs                       fixture fares (a
//        distance stand-in, FIXTURE_FARE below), from tests/fixtures/wayPairs.json
//   node scripts/way_choice_pairs.mjs --flights-dir <dir>   real sweep files
//        (<dir>/<IATA>.json, the data/flights/ shape) for the homes' airports;
//        a pair without a swept flight is priced on the ground ways only
//   node scripts/way_choice_pairs.mjs --write-fixture       rebuild the pairs
//        fixture from public/app_data.json
//   --json                                                  the rows as JSON
//
// Run from continent-app/. Pure Node, no network.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { groundReturn, partyOf, flightPerSeat } from "../src/lib/travelWay.js";
import { chooseWay, wayKm, transferMinutesOf, legDuration } from "../src/lib/wayChoice.js";
import { cheapestReturnAnyMonth, legCost } from "../src/lib/flights/flights.js";

const APP = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = join(APP, "tests/fixtures/wayPairs.json");

// The homes: a town and the airport its sweep file flies from.
export const HOMES = [
  { name: "Brussels", lat: 50.8467, lon: 4.3525, iso2: "BE", country: "Belgium", airport: "BRU" },
  { name: "Amsterdam", lat: 52.3728, lon: 4.8936, iso2: "NL", country: "Netherlands", airport: "AMS" },
  { name: "Paris", lat: 48.8566, lon: 2.3522, iso2: "FR", country: "France", airport: "CDG" },
  { name: "Munich", lat: 48.1374, lon: 11.5755, iso2: "DE", country: "Germany", airport: "MUC" },
  { name: "Madrid", lat: 40.4168, lon: -3.7038, iso2: "ES", country: "Spain", airport: "MAD" },
];
// Bergen, Amalfi and Taormina are the audit's cases (P-31); the rest spread
// the distances from an hour away to the far corners.
export const PLACES = ["BGO", "gem:amalfi-coast", "gem:taormina", "PRG", "LIS", "SPU", "INN", "gem:bruges", "gem:annecy", "CGN"];

/** A stand-in return fare a seat for the fixture run, NOT a measured price:
 *  50 euro plus 9 cents a straight km. Only the rule is tested with it; the
 *  real check reads the sweep (--flights-dir). */
export const FIXTURE_FARE = (km) => Math.round(50 + 0.09 * km);

const KEEP = ["id", "city", "country", "iso2", "tier", "lat", "lon", "city_lat", "city_lon", "anchor_airport", "iata", "transfer", "local_transport"];

function writeFixture() {
  const data = JSON.parse(readFileSync(join(APP, "public/app_data.json"), "utf8"));
  const places = PLACES.map((id) => {
    const d = data.destinations[id];
    if (!d) throw new Error(`no destination ${id} in app_data.json`);
    const row = {};
    for (const k of KEEP) if (d[k] !== undefined) row[k] = d[k];
    if (row.local_transport) row.local_transport = { road_connected: d.local_transport.road_connected, car_needed: d.local_transport.car_needed };
    return row;
  });
  const out = {
    _about: "T1100 (D13): ten places from public/app_data.json (generated 2026-06-07) and five homes for the way-there pick check. Rebuild with node scripts/way_choice_pairs.mjs --write-fixture.",
    homes: HOMES,
    places,
  };
  writeFileSync(FIXTURE, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${FIXTURE}: ${HOMES.length} homes x ${places.length} places`);
}

/** Every pair's ways, the old pick (cheapest) and the new one. */
export function runPairs({ homes, places }, { flightFor, party = partyOf({ group_size: 2 }) } = {}) {
  const rows = [];
  for (const home of homes) {
    for (const dest of places) {
      const ways = [];
      const fl = flightFor(home, dest);
      if (fl) {
        const pp = flightPerSeat(fl.perSeat, party);
        if (pp > 0) ways.push({ mode: "plane", perPerson: pp, ...(fl.minutes ? { minutes: fl.minutes } : {}) });
      }
      for (const mode of ["train", "bus", "car"]) {
        const r = groundReturn(dest, home, mode, party);
        if (r && r.perPerson > 0) ways.push({ mode, perPerson: r.perPerson, hours: r.hours });
      }
      const km = wayKm(home, dest);
      const choice = chooseWay(ways, { km, transferMinutes: transferMinutesOf(dest) });
      rows.push({
        from: home.name, to: dest.city || dest.id, id: dest.id, km,
        before: choice?.cheapest || null, after: choice?.pick || null, reason: choice?.reason || null,
        ways: (choice?.rows || []).map((w) => ({ mode: w.mode, eur: Math.round(w.perPerson), door_h: w.doorHours == null ? null : Math.round(w.doorHours * 10) / 10 })),
      });
    }
  }
  return rows;
}

export function fixtureFlights() {
  return (home, dest) => {
    if ((dest.anchor_airport || dest.iata) === home.airport) return null;
    const km = wayKm(home, dest);
    return km != null && km > 150 ? { perSeat: FIXTURE_FARE(km) } : null;
  };
}

function sweepFlights(dir) {
  const files = new Map();
  return (home, dest) => {
    if (!files.has(home.airport)) {
      const p = join(dir, `${home.airport}.json`);
      files.set(home.airport, existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
    }
    const file = files.get(home.airport);
    const to = dest.anchor_airport || dest.iata;
    const r = file && to ? cheapestReturnAnyMonth(file, to) : null;
    if (!r) return null;
    return {
      perSeat: legCost(r.out, { paying: 1 }).perSeat + legCost(r.back, { paying: 1 }).perSeat,
      minutes: legDuration(r.out),
    };
  };
}

function main(argv) {
  if (argv.includes("--write-fixture")) return writeFixture();
  const fx = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const i = argv.indexOf("--flights-dir");
  const flightFor = i >= 0 ? sweepFlights(argv[i + 1]) : fixtureFlights();
  const rows = runPairs(fx, { flightFor });
  if (argv.includes("--json")) return console.log(JSON.stringify(rows, null, 1));
  const fmt = (w) => `${w.mode} ${w.eur}e ${w.door_h ?? "?"}h`;
  for (const r of rows) {
    const flag = r.before !== r.after ? " *" : "";
    console.log(`${r.from.padEnd(9)} ${String(r.to).padEnd(22)} ${String(r.km).padStart(5)} km  before ${String(r.before).padEnd(5)} after ${String(r.after).padEnd(5)} (${r.reason})${flag}  | ${r.ways.map(fmt).join(", ")}`);
  }
  const changed = rows.filter((r) => r.before !== r.after).length;
  const count = (k) => rows.reduce((m, r) => ({ ...m, [r[k]]: (m[r[k]] || 0) + 1 }), {});
  console.log(`\n${rows.length} pairs (${i >= 0 ? "sweep fares" : "FIXTURE fares, a distance stand-in"}); pick changed on ${changed}.`);
  console.log("before (cheapest):", JSON.stringify(count("before")));
  console.log("after  (wayChoice):", JSON.stringify(count("after")));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
