// T570 + T571: Ask Carta's chats on this device, and the place outside
// Carta's Europe that a question names. Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import {
  KEY, MAX_CHATS, titleOf, loadChats, saveChats, upsertChat, removeChat, groupChats, mergeChats,
} from "../src/lib/ask/sessions.js";
import { outsidePlace } from "../src/lib/ask/outside.js";

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const chat = (id, at, q = "Warm in May") => ({ id, title: q, at, turns: [{ id: `${id}1`, q, at }] });

test("a chat's title is its first question, cut at a word", () => {
  assert.equal(titleOf("  Warm and quiet  in May "), "Warm and quiet in May");
  const long = "I want to plan a trip to dubai in november, the cheapest way possible, with the best flights";
  const t = titleOf(long);
  assert.ok(t.length <= 64 && t.endsWith("..."), t);
  assert.ok(!t.includes("possi..."), "cut at a word");
});

test("chats save, load newest first, and survive bad storage", () => {
  const s = memory();
  let list = upsertChat([], chat("a", 100));
  list = upsertChat(list, chat("b", 300));
  list = upsertChat(list, { ...chat("a", 500), turns: [{ id: "x", q: "Porto or Lisbon", at: 500 }] });
  saveChats(list, s);
  const back = loadChats(s);
  assert.deepEqual(back.map((c) => c.id), ["a", "b"]);
  assert.equal(back[0].turns[0].q, "Porto or Lisbon");
  s.setItem(KEY, "{not json");
  assert.deepEqual(loadChats(s), []);
  assert.deepEqual(loadChats({ getItem() { throw new Error("blocked"); } }), []);
  assert.doesNotThrow(() => saveChats(list, { setItem() { throw new Error("full"); } }));
});

test("an empty chat is never kept, and the list is capped", () => {
  assert.deepEqual(upsertChat([], { id: "e", at: 1, turns: [] }), []);
  let list = [];
  for (let i = 0; i < MAX_CHATS + 5; i++) list = upsertChat(list, chat(`c${i}`, i));
  assert.equal(list.length, MAX_CHATS);
  assert.equal(list[0].id, `c${MAX_CHATS + 4}`);
  assert.deepEqual(removeChat(list, list[0].id).length, MAX_CHATS - 1);
});

test("chats group into today, the last 7 days and older", () => {
  const now = new Date(2026, 9, 22, 15, 0).getTime();
  const g = groupChats([chat("t", now - 3600000), chat("w", now - 3 * 86400000), chat("o", now - 30 * 86400000)], now);
  assert.deepEqual([g.today.map((c) => c.id), g.week.map((c) => c.id), g.older.map((c) => c.id)], [["t"], ["w"], ["o"]]);
});

test("a destination outside Carta's Europe is named, a European one is not", () => {
  const dubai = { type: "plan", places: [], facets: { month: 11 }, unknown: ["dubai", "way", "possible"] };
  assert.equal(outsidePlace("I want to plan a trip to dubai in november, the cheapest way possible", dubai), "Dubai");
  assert.equal(outsidePlace("Een week naar Marrakech in maart", { places: [], facets: {}, unknown: ["marrakech"] }), "Marrakech");
  assert.equal(outsidePlace("Flights to New York in May", { places: [], facets: {}, unknown: ["new", "york"] }), "New York");
  // Known place, an unknown word elsewhere, or nothing unknown: no claim.
  assert.equal(outsidePlace("A week in Porto, cheapest way", { places: ["porto"], facets: {}, unknown: ["way"] }), null);
  assert.equal(outsidePlace("Warm in the cheapest way", { places: [], facets: {}, unknown: ["way"] }), null);
  assert.equal(outsidePlace("Warm in November", { places: [], facets: { month: 11 }, unknown: [] }), null);
  // A verb after "to" is not a place (T572 end check).
  assert.equal(outsidePlace("Where to stay there?", { places: [], facets: {}, unknown: ["stay"] }), null);
  assert.equal(outsidePlace("Wat is er te doen in de buurt", { places: [], facets: {}, unknown: ["doen"] }), null);
});

test("warm in a month keeps the warm places and lets the month's best list go", async () => {
  const { findFacts } = await import("../src/lib/ask/rank.js");
  // climate.m: [high, low, rain, score] for each month; best: the best months.
  const clim = (novHigh, best) => ({ best, m: Array.from({ length: 12 }, (_, i) => [i === 10 ? novHigh : 15, 8, 50, 50]) });
  const row = (id, novHigh, best, i) => ({ id, city: id, iso2: id.slice(0, 2).toUpperCase(), lat: 30 + i * 3, lon: i * 3, climate: clim(novHigh, best), rating: { score: 7 } });
  const rows = [row("tenerife", 23, [3, 4], 0), row("cyprus", 22, [4, 5], 1), row("malta", 20, [5], 2), row("berlin", 8, [11], 3)];
  const byId = new Map(rows.map((p) => [p.id, p]));
  const f = findFacts({ type: "find", facets: { warm: true, month: 11 }, unknown: [] }, { rows, byId, guided: null, today: new Date(2026, 9, 22) });
  assert.deepEqual(f.relaxed, ["month"]);
  assert.deepEqual(f.picks.map((p) => p.id).sort(), ["cyprus", "malta", "tenerife"]);
});

// T572: a follow-up that names no place is about the last answer's place.
test("a follow-up that points back or asks nothing of its own binds to the last place", async () => {
  const { bindFollowUp, pointsBack } = await import("../src/lib/ask/followup.js");
  const prev = { id: "OPO", city: "Porto" };
  const find = (facets = {}, unknown = []) => ({ type: "find", places: [], compare: [], facets, unknown });
  // Points back, in four languages.
  for (const q of ["Where to stay there?", "Wat is er daar te doen?", "Was kann man dort essen?", "Que faire là-bas ?"]) {
    assert.ok(pointsBack(q), q);
    const b = bindFollowUp(q, find({}, ["stay"]), prev);
    assert.deepEqual([b.type, b.places, b.followOf, b.unknown], ["about", ["OPO"], "OPO", []], q);
  }
  // Asks nothing of its own: words the parser could not place.
  assert.equal(bindFollowUp("What about food?", find({}, ["food"]), prev).followOf, "OPO");
  // when and plan keep their type with the place.
  assert.deepEqual(bindFollowUp("Plan 5 days there", { ...find(), type: "plan", budget: { days: 5 } }, prev).type, "plan");
  // Its own search, a place of its own, a budget or no last place: untouched.
  const warm = find({ warm: true, month: 11 });
  assert.equal(bindFollowUp("Warm in November", warm, prev), warm);
  const porto = { ...find(), type: "about", places: ["LIS"] };
  assert.equal(bindFollowUp("And Lisbon?", porto, prev), porto);
  const budget = { ...find(), type: "budget" };
  assert.equal(bindFollowUp("1500 for two there", budget, prev), budget);
  const q = find({}, ["stay"]);
  assert.equal(bindFollowUp("Where to stay?", q, null), q);
  // The French article is not "là".
  assert.equal(pointsBack("Que faire à la plage"), false);
});

// T575: the device's chats and the account's, as one list.
test("device and account chats merge: newer wins, tombstones delete, device-only chats go up", () => {
  const row = (id, at, extra = {}) => ({ chat_id: id, title: id, turns: [{ q: id }], updated_at: new Date(at).toISOString(), deleted_at: null, ...extra });
  const local = [chat("a", 500), chat("b", 100), chat("c", 300), chat("d", 900)];
  const rows = [
    row("a", 200),                                              // device newer: upload a
    row("b", 400),                                              // account newer: take b
    row("c", 250, { deleted_at: new Date(250).toISOString() }), // deleted, device changed after: keep and upload c
    row("d", 100, { deleted_at: new Date(1000).toISOString() }),// deleted after the device's change: drop d
    row("e", 600),                                              // account only: take e
  ];
  const { list, upload } = mergeChats(local, rows);
  assert.deepEqual(list.map((c) => c.id), ["e", "a", "b", "c"]);
  assert.equal(list.find((c) => c.id === "b").at, 400);
  assert.deepEqual(upload.map((c) => c.id).sort(), ["a", "c"]);
  // First sign-in: every device chat goes up.
  assert.deepEqual(mergeChats([chat("x", 1), chat("y", 2)], []).upload.map((c) => c.id), ["x", "y"]);
});

// T583: the short reply. The written answer keeps its first three sentences
// without note marks, a plain line stands in when none came, the reveal
// ends in time, and "Got one in mind?" offers the first places by name.
test("the reply keeps three sentences, drops note marks, and paces the reveal", async () => {
  const { trimSentences, replyText, shortLine, revealPace, placeChips, MAX_SENTENCES } = await import("../src/lib/ask/reply.js");
  const s = [1, 2, 3, 4, 5].map((n) => ({ text: `Sentence ${n}.`, cites: [n] }));
  assert.equal(MAX_SENTENCES, 3);
  assert.equal(trimSentences(s).length, 3);
  assert.equal(replyText(s), "Sentence 1. Sentence 2. Sentence 3.");
  assert.equal(replyText("Ohrid is cheap [1]. Bitola too [2]. Struga is by the lake [3]. Skopje is busy [4]."),
    "Ohrid is cheap. Bitola too. Struga is by the lake.");
  assert.deepEqual(trimSentences(null), []);
  const t = (k, v) => (k === "askChat.short.one" ? `${v.place} looks like a good fit.` : `${v.places} look like a good fit.`);
  assert.equal(shortLine(["Ohrid"], { t, lang: "en" }), "Ohrid looks like a good fit.");
  assert.equal(shortLine(["Ohrid", "Bitola", "Struga"], { t, lang: "en" }), "Ohrid, Bitola, and Struga look like a good fit.");
  assert.equal(shortLine([], { t }), "");
  // About 30 ms a word; a long answer speeds up so it ends under 1.5 s.
  assert.equal(revealPace(20), 30);
  assert.ok(revealPace(120) * 120 <= 1500);
  assert.ok(revealPace(10000) >= 8);
  const picks = ["a", "b", "b", "c", "d"].map((id) => ({ id, dest: { city: id.toUpperCase() } }));
  assert.deepEqual(placeChips(picks), [{ id: "a", city: "A" }, { id: "b", city: "B" }, { id: "c", city: "C" }]);
  assert.deepEqual(placeChips([{ id: "x" }]), []);
});

test("a loosened filter is no longer said in the answer", async () => {
  const { composeAnswer } = await import("../src/lib/ask/compose.js");
  const t = (k, v = {}) => `${k}${JSON.stringify(v)}`;
  const labels = { month: (m) => `M${m}`, vibe: (v) => v, area: (a) => a, country: (c) => c, budget: (b) => b, extra: (x) => x };
  const facts = { type: "find", count: 2, relaxed: ["month"], picks: [], notes: [] };
  const a = composeAnswer(facts, { type: "find", facets: { warm: true, month: 11 } }, { t, labels });
  assert.equal(a.note, null);
  assert.ok(!JSON.stringify(a).includes("ask.relaxed"));
});
