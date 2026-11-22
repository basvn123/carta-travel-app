// PT-E9 (ROADMAP G4, logic audit E9): parity test, written first as `todo` so a wave
// shows its effect as a diff. One state-scope model: a share link carries no person key, the load order keeps the traveller's own state. Joins tests/urlPlaces.test.mjs once the engine lands.
// Every test here is { todo: true } while it fails on today's code: CI stays green, the
// engine wave flips each one to a plain test in the commit that makes it pass.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E9).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { encodeState } from "../src/lib/urlState.js";
import { tripForShare } from "../src/lib/shareKeys.js";

test("E9: a share link from Explore and from Together decodes with no person key (J-P4)", { todo: true }, async () => {
  const { shareLink, personKeys } = await import("../src/lib/shareScope.js");
  const url = shareLink({ from: "explore", state: { homePoint: { lat: 50.8467, lon: 4.3525 }, shortlist: ["gem:annecy"], party: { adults: 2 }, taste: { likes: ["hiking"] } } });
  for (const k of personKeys) assert.ok(!new URL(url, "https://carta.test").searchParams.has(k), k);
});

test("E9: a trip share drops the home keys before encoding (J-14)", () => {
  const out = tripForShare({ anchorOrigin: "BRU", homeTown: "Brussels", drive_home: 1, dh: 1, stops: [{ city: "Annecy" }] });
  assert.deepEqual(Object.keys(out), ["stops"]);
});

test("E9: persistState keeps the country and region in the address hash", { todo: true }, async () => {
  const { persistState } = await import("../src/lib/urlState.js");
  assert.match(persistState({ hash: "#country=IT&region=X" }, encodeState({})), /country=IT&region=X/);
});

test("E9: the G-1 load order replay keeps On my own as 1 adult", { todo: true }, async () => {
  const { loadInitialState } = await import("../src/lib/urlState.js");
  const s = loadInitialState({ search: "?g=1", stored: { group_size: 2 } });
  assert.equal(s.group_size, 1);
});
