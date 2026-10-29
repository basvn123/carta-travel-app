// T812: Getting there offers the day's flights as up to three rows, the one
// the trip is priced on first, each priced for the party by the planner's
// own legCost; a picked row becomes a one-flight live answer that the trip's
// price (quoteTrip through pickLeg) then takes. Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flightChoices, pickedLive, sameFlight } from "../src/planner/wizard/flightChoices.js";
import { legCost, pickLeg } from "../src/lib/flights/flights.js";
import { BABY_LAP_FEE_LEG } from "../src/lib/party.js";

const LIVE = JSON.parse(readFileSync(new URL("./fixtures/tf1-live-BRU-LJU.json", import.meta.url), "utf8"));
const party = { paying: 2, babies: 0, bagKey: "cabin" };

test("the current flight leads, then at most two others of the day", () => {
  const f0 = LIVE.flights[1];
  const current = { ...f0, date: "2026-11-21", from: "BRU", to: "LJU", cost: legCost(f0, party) };
  const rows = flightChoices(current, LIVE, party);
  assert.ok(rows.length <= 3 && rows.length >= 2);
  assert.equal(rows[0].current, true);
  assert.ok(sameFlight(rows[0].leg, current));
  assert.equal(rows[0].total, current.cost.total);
  const keys = rows.map((r) => `${r.leg.airline}${r.leg.dep}`);
  assert.equal(new Set(keys).size, keys.length, "no flight twice");
  // The cheapest other flight of the day is offered, priced for the party.
  const cheapest = [...LIVE.flights].filter((f) => !sameFlight(f, current)).sort((a, b) => a.price - b.price)[0];
  const row = rows.find((r) => sameFlight(r.leg, cheapest));
  assert.ok(row);
  assert.equal(row.total, legCost(cheapest, party).total);
});

test("a baby's lap fee is in every other row's figure", () => {
  const rows = flightChoices(null, LIVE, { ...party, babies: 1 });
  assert.ok(rows.length > 0);
  for (const r of rows) assert.equal(r.total, legCost(r.leg, party).total + BABY_LAP_FEE_LEG);
});

test("no answer and no flight: no rows", () => {
  assert.deepEqual(flightChoices(null, null, party), []);
});

test("a picked flight is the one the trip prices, and only on its own day", () => {
  const pick = { ...LIVE.flights[2], date: "2026-11-21", from: "BRU", to: "LJU", checked: LIVE.checked };
  const entries = pickedLive({ out: pick, back: null });
  assert.equal(entries.length, 1);
  const [key, answer] = entries[0];
  assert.equal(key, "BRU-LJU-2026-11-21");
  const live = new Map(entries);
  const leg = pickLeg({ file: null, live: live.get("BRU-LJU-2026-11-21"), dir: "out", airport: "LJU", date: "2026-11-21", rank: "price" });
  assert.ok(sameFlight(leg, pick));
  assert.equal(leg.price, pick.price);
  assert.equal(answer.flights.length, 1);
  // The trip moved a day: the pick keys the old day and is not read.
  assert.equal(live.get("BRU-LJU-2026-11-22"), undefined);
});
