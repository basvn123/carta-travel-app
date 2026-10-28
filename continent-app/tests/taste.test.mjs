// The traveller's taste profile (T764, lib/taste.js). Run: npm test
// Reading, writing and the sign-in merge: a local taste the account does
// not have is kept, and the account wins key by key.
import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyTaste, normalizeTaste, isEmptyTaste, hasMatchSignal, toggleLike, setTasteAnswer,
  recordAsked, mergeTaste, encodeTaste, decodeTaste, tasteSummaryKeys, learnFacet, MAX_LIKES,
} from "../src/lib/taste.js";

test("normalize drops unknown values and caps likes at three", () => {
  const t = normalizeTaste({ party: "aliens", likes: ["hiking", "lakes", "bogus", "food", "ski"], size: "huge", quiet: "quiet", noCar: "yes" });
  assert.equal(t.party, null);
  assert.deepEqual(t.likes, ["hiking", "lakes", "food"]);
  assert.equal(t.size, null);
  assert.equal(t.quiet, "quiet");
  assert.equal(t.noCar, null);
  assert.deepEqual(normalizeTaste(null), emptyTaste());
});

test("empty and match signal", () => {
  assert.ok(isEmptyTaste(null));
  assert.ok(isEmptyTaste(emptyTaste()));
  assert.ok(!isEmptyTaste({ party: "couple" }));
  assert.ok(!hasMatchSignal({ party: "couple" }), "who comes alone weighs nothing");
  assert.ok(!hasMatchSignal({ noCar: true }), "no car alone is a conflict, not a fit");
  assert.ok(!hasMatchSignal({ size: "mix" }), "a mix is no preference");
  assert.ok(hasMatchSignal({ likes: ["beach"] }));
  assert.ok(hasMatchSignal({ quiet: "quiet" }));
});

test("toggleLike refuses a fourth pick and removes on a second tap", () => {
  let t = emptyTaste();
  for (const k of ["beach", "food", "city", "ski"]) t = toggleLike(t, k);
  assert.equal(t.likes.length, MAX_LIKES);
  assert.ok(!t.likes.includes("ski"));
  t = toggleLike(t, "food");
  assert.deepEqual(t.likes, ["beach", "city"]);
});

test("setTasteAnswer with null is No preference", () => {
  const t = setTasteAnswer({ size: "village" }, "size", null);
  assert.equal(t.size, null);
});

test("sign-in merge: local kept where the account is silent, account wins key by key", () => {
  const local = { party: "family", likes: ["beach"], size: "village", quiet: "quiet", asked: { lakes: "no" } };
  const account = { party: "couple", likes: [], size: null, lifestyle: "foodie", asked: { ski: "yes" } };
  const m = mergeTaste(local, account);
  assert.equal(m.party, "couple", "the account wins a key it has");
  assert.deepEqual(m.likes, ["beach"], "an empty account list keeps the local likes");
  assert.equal(m.size, "village");
  assert.equal(m.quiet, "quiet");
  assert.equal(m.lifestyle, "foodie");
  assert.deepEqual(m.asked, { lakes: "no", ski: "yes" });
});

test("sign-in merge: an empty local taste takes the account whole, and the reverse", () => {
  const account = { party: "solo", likes: ["hiking", "food"], quiet: "lively" };
  assert.deepEqual(mergeTaste(null, account), normalizeTaste(account));
  assert.deepEqual(mergeTaste(account, null), normalizeTaste(account));
});

test("encode and decode round trip", () => {
  const t = normalizeTaste({ party: "family", likes: ["hiking", "lakes"], size: "village", quiet: "quiet", lifestyle: "backpacker", noCar: true, asked: { food: "no", ski: "yes" } });
  assert.deepEqual(decodeTaste(encodeTaste(t)), t);
  assert.deepEqual(decodeTaste("garbage;;=x"), emptyTaste());
});

test("summary keys follow likes, size, quiet", () => {
  assert.deepEqual(tasteSummaryKeys({ likes: ["hiking"], size: "village", quiet: "quiet" }),
    ["taste.like.hiking", "taste.size.village", "taste.quiet.quiet"]);
});

test("learning asks once, after five saves share a facet, never again after a no", () => {
  const lakePlace = { taste: { likes: { lakes: [0.9, {}], beach: [0.1, {}] } } };
  const saved = Array.from({ length: 5 }, () => lakePlace);
  assert.equal(learnFacet({ likes: ["hiking"] }, saved.slice(0, 4)), null, "four is not enough");
  assert.equal(learnFacet({ likes: ["hiking"] }, saved), "lakes");
  assert.equal(learnFacet({ likes: ["lakes"] }, saved), null, "already picked");
  const no = recordAsked({ likes: ["hiking"] }, "lakes", false);
  assert.equal(learnFacet(no, saved), null, "a no is never asked again");
  const yes = recordAsked({ likes: ["hiking"] }, "lakes", true);
  assert.deepEqual(yes.likes, ["hiking", "lakes"]);
});

// T766: "Help me choose" ranks with the trip's likes, never rewriting the profile.
test("a trip's likes stand in for the saved ones, for this trip only", async () => {
  const { tripTaste, tripLikesDiffer } = await import("../src/lib/taste.js");
  const saved = { likes: ["hiking"], size: "village", quiet: "quiet" };
  const trip = tripTaste(saved, ["beach", "romantic", "food"]);
  assert.deepEqual(trip.likes, ["beach", "food"]);
  assert.equal(trip.size, "village");
  assert.deepEqual(saved.likes, ["hiking"]);
  assert.deepEqual(tripTaste(saved, []).likes, ["hiking"]);
  assert.equal(tripLikesDiffer(saved, ["beach"]), true);
  assert.equal(tripLikesDiffer(saved, ["hiking"]), false);
  assert.equal(tripLikesDiffer(saved, []), false);
});
