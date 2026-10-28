// T764: the taste profile wired into the app. Run: npm test
// The sign-in merge as useAccountSync applies it (mergeAccountChoices and the
// write-back test), the chip's words, and the local storage form through
// lib/urlState.js (encodeState writes `ty`, decodeState reads it back).
import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyTaste, mergeAccountChoices, tasteNeedsWriteBack, lifestyleKey, tasteChipWords,
  tasteChipText, tasteListText, normalizeTaste,
} from "../src/lib/taste.js";
import { encodeState, decodeState } from "../src/lib/urlState.js";

const t = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(",")})` : k);

test("sign-in merge: a local taste the account does not have is kept", () => {
  const local = { group_size: 2, taste: { likes: ["hiking"], size: "village" } };
  const incoming = { group_size: 4 };
  const out = mergeAccountChoices(local, incoming);
  assert.equal(out.group_size, 4, "every other choice: the account wins as before");
  assert.deepEqual(out.taste.likes, ["hiking"]);
  assert.equal(out.taste.size, "village");
  assert.ok(tasteNeedsWriteBack(local.taste, incoming.taste), "the account learns the local taste");
});

test("sign-in merge: the account wins key by key, local fills the gaps", () => {
  const local = { taste: { party: "solo", likes: ["hiking"], quiet: "quiet", asked: { lakes: "no" } } };
  const incoming = { taste: { party: "family", size: "town", asked: { beach: "yes" } } };
  const out = mergeAccountChoices(local, incoming);
  assert.equal(out.taste.party, "family");
  assert.equal(out.taste.size, "town");
  assert.deepEqual(out.taste.likes, ["hiking"]);
  assert.equal(out.taste.quiet, "quiet");
  assert.deepEqual(out.taste.asked, { lakes: "no", beach: "yes" }, "a no given on either device holds");
  assert.ok(tasteNeedsWriteBack(local.taste, incoming.taste));
});

test("sign-in merge: nothing to write back when the account already says it all", () => {
  const account = { party: "couple", likes: ["food"], size: "city", quiet: "lively" };
  assert.ok(!tasteNeedsWriteBack(emptyTaste(), account));
  assert.ok(!tasteNeedsWriteBack({ party: "solo" }, account), "the account's party wins, nothing new");
  assert.ok(!tasteNeedsWriteBack(null, null));
  const out = mergeAccountChoices({ taste: null }, { taste: account });
  assert.deepEqual(out.taste, normalizeTaste(account));
});

test("sign-in merge: an account with no settings keeps the local taste", () => {
  const out = mergeAccountChoices({ taste: { likes: ["lakes"] } }, undefined);
  assert.deepEqual(out.taste.likes, ["lakes"]);
  assert.ok(tasteNeedsWriteBack({ likes: ["lakes"] }, undefined));
});

test("the Lifestyle preset key", () => {
  assert.equal(lifestyleKey("Cafe & culture"), "cafe_culture");
  assert.equal(lifestyleKey("Backpacker"), "backpacker");
  assert.equal(lifestyleKey(""), null);
  assert.equal(lifestyleKey(null), null);
  assert.equal(normalizeTaste({ lifestyle: lifestyleKey("Cafe & culture") }).lifestyle, "cafe_culture");
});

test("the chip: at most three words, then +n", () => {
  assert.equal(tasteChipText(null, t), "taste.chipEmpty");
  const one = { likes: ["hiking"], size: "village", quiet: "quiet" };
  assert.equal(tasteChipText(one, t), "taste.chip(list=taste.like.hiking, taste.size.village, taste.quiet.quiet)");
  const five = { likes: ["hiking", "lakes"], size: "village", quiet: "quiet", noCar: true };
  assert.deepEqual(tasteChipWords(five), { keys: ["taste.like.hiking", "taste.like.lakes", "taste.size.village"], more: 2 });
  assert.equal(tasteChipText(five, t), "taste.chipMore(list=taste.like.hiking, taste.like.lakes, taste.size.village,n=2)");
  assert.equal(tasteListText(five, t), "taste.listMore(list=taste.like.hiking, taste.like.lakes, taste.size.village,n=2)");
  assert.equal(tasteListText(null, t), "");
});

test("the chip never reads empty for a set taste", () => {
  assert.deepEqual(tasteChipWords({ party: "family" }).keys, ["taste.party.family"]);
  assert.deepEqual(tasteChipWords({ lifestyle: "cafe_culture" }).keys, ["lifestyle.profileCafeCulture"]);
  assert.deepEqual(tasteChipWords({ size: "mix" }).keys, [], "a mix is no preference");
});

test("urlState: the taste rides the query and the local mirror as ty", () => {
  const taste = { party: "couple", likes: ["hiking", "lakes"], size: "village", quiet: "quiet", noCar: true, asked: { beach: "no" } };
  const qs = encodeState({ choices: { taste } });
  const q = new URLSearchParams(qs);
  assert.ok(q.get("ty"), "written");
  const back = decodeState(qs);
  assert.deepEqual(back.taste, normalizeTaste(taste));
  assert.equal(new URLSearchParams(encodeState({ choices: { taste: emptyTaste() } })).get("ty"), null, "nothing set, nothing written");
  assert.equal(decodeState("g=2").taste, undefined, "a link without ty says nothing about the taste");
});
