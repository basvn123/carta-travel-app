// T458: a shared trip link is input from a stranger. These tests feed the
// decoder hostile payloads (prototype keys as stop ids, markup in the name,
// absurd prices and party sizes, a party over the planner's cap, garbage
// bytes) and check that what comes out is a draft the planner can price,
// or nothing.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { encodeTripShare, decodeTripShare } from "../src/lib/shareLink.js";

const roundTrip = async (draft) => decodeTripShare(await encodeTripShare(draft));

test("prototype keys never become stops", async () => {
  const out = await roundTrip({
    stops: [
      { destinationId: "__proto__", nights: 2 },
      { destinationId: "constructor", nights: 2 },
      { destinationId: "prototype", nights: 2 },
      { destinationId: "hasOwnProperty", nights: 2 },
      { destinationId: "toString", nights: 2 },
      { destinationId: "PRN_ok", nights: 3 },
    ],
  });
  assert.ok(out, "a link with one good stop still opens");
  assert.deepEqual(out.stops.map((s) => s.destinationId), ["PRN_ok"]);
});

test("markup in the trip name stays text, capped in length", async () => {
  const label = '<img src=x onerror="alert(1)">'.repeat(10);
  const out = await roundTrip({ stops: [{ destinationId: "PRN_a", nights: 2 }], label });
  assert.equal(typeof out.label, "string");
  assert.ok(out.label.length <= 80);
});

test("prices and party sizes are clamped", async () => {
  const out = await roundTrip({
    stops: [{ destinationId: "PRN_a", nights: 9999 }, { destinationId: "PRN_b", nights: -4 }],
    groupSize: 500,
    children: 500,
    babies: -3,
    ownLegs: { 0: { mode: "train", eur: 1e12 }, 7: { mode: "train", eur: 5 }, "-1": { mode: "fly", eur: 5 } },
    ownStays: { PRN_a: 1e15, PRN_b: -20, __proto__: 5 },
    ownFlight: { airline: "x".repeat(500), mode: "rocket", costTotal: "Infinity", costOut: -1 },
  });
  assert.equal(out.stops[0].nights, 30);
  assert.equal(out.stops[1].nights, 1);
  assert.equal(out.groupSize, 20);
  assert.ok(out.children <= 19 && out.children >= 0);
  assert.equal(out.babies, 0);
  assert.deepEqual(Object.keys(out.ownLegs), ["0"]);
  assert.ok(out.ownLegs[0].eur <= 99999);
  assert.deepEqual(Object.keys(out.ownStays), ["PRN_a"]);
  assert.ok(out.ownStays.PRN_a <= 99999);
  assert.equal(out.ownFlight.mode, "fly");
  assert.ok(out.ownFlight.airline.length <= 60);
  assert.equal(out.ownFlight.costTotal, null);
  assert.equal(out.ownFlight.costOut, 0);
});

test("garbage never throws", async () => {
  for (const raw of ["", "x", "0.", "1.!!!!", "2.abc", "0." + "A".repeat(30000), "0.bnVsbA", "0.W10", "0.e30"]) {
    assert.equal(await decodeTripShare(raw), null, `payload ${raw.slice(0, 12)}`);
  }
});

// Logic wave 0a (C9): the payload itself carries only what the decoder keeps,
// and never the sender's start. Read the raw bytes, not the decoded draft.
async function rawPayload(payload) {
  const b64 = payload.slice(2).replace(/-/g, "+").replace(/_/g, "/");
  let bytes = Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  if (payload[0] === "1") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

test("the payload carries no extra fields and no home start; party counts stay", async () => {
  const payload = await encodeTripShare({
    stops: [{ destinationId: "PRN_a", nights: 3, note: "my flat key under the mat" }],
    groupSize: 4, children: 1, babies: 0,
    anchorId: "BRU", anchorOrigin: "BRU", homeTown: "Ghent", userId: "u-1",
    drive_home: { lat: 51.05, lon: 3.72, name: "Ghent" },
  });
  const raw = await rawPayload(payload);
  for (const k of ["anchorOrigin", "homeTown", "userId", "drive_home"]) assert.equal(k in raw, false, k);
  assert.equal("note" in raw.stops[0], false);
  assert.equal(raw.groupSize, 4);
  assert.equal(raw.children, 1);
  assert.equal(raw.anchorId, "BRU");
  const out = await decodeTripShare(payload);
  assert.equal(out.anchorOrigin, null);
  assert.equal(out.groupSize, 4);
});
