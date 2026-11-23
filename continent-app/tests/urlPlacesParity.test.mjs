// PT-E9 (ROADMAP G4, logic audit E9): parity test. One state-scope model: a share link carries
// no person key, the load order keeps the traveller's own state. Written first as `todo` so a
// wave shows its effect as a diff; logic wave 2 (E9 phase A) turned each into a plain test.
// Inputs are the audit's own (.work/2026-11-17-app-logic-audit/proposal-simplify.md E9).
// Run: node --test tests/<file> (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { encodeState, persistState, loadInitialState } from "../src/lib/urlState.js";
import { tripForShare, shareViewUrl } from "../src/lib/shareKeys.js";
import { togetherUrl } from "../src/lib/recommend/together.js";
import { personUrlKeys, stripUrlKeys } from "../src/lib/stateKeys.js";
import { withFlags } from "../src/lib/flags.js";
import { withWindow, replayJourneys } from "../scripts/eval/lib/state-engine.mjs";

// The keys that name the person and may never ride in a share link: the table's person keys.
const PERSON = personUrlKeys();

test("E9: a share link from Explore and from Together decodes with no person key (J-P4)", () => {
  const sender = {
    activeTab: "explore",
    favorites: new Set(["gem:annecy"]),
    countryFilter: ["IT"],
    choices: { group_size: 2, drive_home: { lat: 50.8467, lon: 4.3525, name: "Brussels" }, taste: { likes: ["hiking"] }, origin: "BRU" },
  };
  const run = withWindow({ search: "" }, () => { persistState(sender); return window.location.href; });
  const explore = shareViewUrl(run.result);
  const together = togetherUrl({ trips: [{ id: "t1" }, { id: "t2" }], people: [{ keep: ["t1"], skip: [] }] }, run.result);
  for (const url of [explore, together]) {
    const q = new URL(url, "https://carta.test").searchParams;
    for (const k of PERSON) assert.ok(!q.has(k), `${k} in ${url}`);
  }
  assert.match(explore, /cf=IT/);
});

test("E9: a trip share drops the home keys before encoding (J-14)", () => {
  const out = tripForShare({ anchorOrigin: "BRU", homeTown: "Brussels", drive_home: 1, dh: 1, stops: [{ city: "Annecy" }] });
  assert.deepEqual(Object.keys(out), ["stops"]);
});

test("E9: persistState keeps the country and region in the address hash", () => {
  const run = withWindow({ hash: "#country=IT&region=X" }, () => persistState({ activeTab: "explore" }));
  assert.match(run.hash, /country=IT&region=X/);
});

test("E9: the G-1 load order replay keeps On my own as 1 adult", () => {
  const j = replayJourneys("new").reloadHeld;
  assert.equal(j.styleAdults, 1);
  // ... and with the flag at old it is the audit's defect, so a flip back is a real undo.
  assert.equal(replayJourneys("old").reloadHeld.styleAdults, 4);
});

test("E9: a recipient keeps their own shortlist and home point when a link names others (J-3)", () => {
  const mine = encodeState({ favorites: new Set(["gem:mine"]), choices: { group_size: 1, drive_home: { lat: 40.4168, lon: -3.7038, name: "Madrid" } } });
  const link = "?fav=gem:theirs&dh=52.3702,4.8952,Amsterdam&g=4";
  for (const which of ["old", "new"]) {
    const init = withWindow({ search: link, local: { "continent.state.v1": mine } }, () => withFlags({ E9: which }, () => loadInitialState())).result;
    assert.deepEqual([...init.favorites], ["dest:gem:mine"], which);
    assert.equal(init.drive_home.name, "Madrid", which);
  }
});

test("E9: the keys that leave the address are exactly the shortlist, the home point and the taste", () => {
  assert.deepEqual([...stripUrlKeys()].sort(), ["dh", "fav", "ty"]);
});
