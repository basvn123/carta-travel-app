// T570 + T571: Ask Carta's chats on this device, and the place outside
// Carta's Europe that a question names. Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import {
  KEY, MAX_CHATS, titleOf, loadChats, saveChats, upsertChat, removeChat, groupChats,
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
