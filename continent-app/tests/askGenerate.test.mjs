// T556: the written Ask Carta answer. The checker keeps a sentence only when
// it cites real notes, uses figures the notes carry and names no place the
// notes do not; the Workers AI Function never calls a model without its
// Neurons counter, stops at the cap, serves a repeat from the cache and
// settles the count; writeAnswer streams only checked sentences; and every
// golden question's pack stays small enough for about 400 free answers a day.
// Run: npm test (continent-app/). No network: the model and KV are fakes.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { splitSentences, verifyAnswer, cleanModelText } from "../src/lib/ask/verify.js";
import { buildPack, wirePack, readWirePack, systemPrompt, userPrompt, MAX_NOTES, MAX_ANSWER_TOKENS } from "../src/lib/ask/context.js";
import { writeAnswer } from "../src/lib/ask/generate.js";
import { onRequestPost, CAP, MODELS, neurons, pieceOf } from "../functions/api/ask/answer.js";

const PACK = {
  v: 1, lang: "en", question: "porto or lisbon in may",
  notes: [
    { n: 1, text: "Porto, Portugal; May: 19° by day, 60 mm rain; ~€101 est. a person a day; score 9.1 of 10" },
    { n: 2, text: "Lisbon, Portugal; May: 19° by day, 31 mm rain; ~€112 est. a person a day; score 9.1 of 10" },
    { n: 3, text: "Lisbon's Alfama is the oldest quarter, a maze of lanes below the castle." },
  ],
  places: [{ id: "OPO", city: "Porto" }, { id: "LIS", city: "Lisbon" }],
};
const KNOWN = ["Porto", "Lisbon", "Seville", "Madrid", "Nice"];

test("sentences split on end marks, never inside 9.1 or est.", () => {
  const { sentences } = splitSentences("Both score 9.1 [1][2]. Porto costs ~€101 est. a person a day [1]. Lisbon is drier. [2]");
  assert.equal(sentences.length, 3);
  assert.deepEqual(sentences[0].cites, [1, 2]);
  assert.equal(sentences[1].text, "Porto costs ~€101 est. a person a day.");
  assert.deepEqual(sentences[2].cites, [2]);
  assert.equal(cleanModelText("<think>hmm</think>Hi"), "Hi");
});

test("the checker drops invented figures, places and uncited sentences", () => {
  const good = "Lisbon is drier in May, with 31 mm of rain against 60 mm in Porto [1][2]. Porto is the cheaper of the two at ~€101 est. a person a day [1].";
  const r = verifyAnswer(good, PACK, KNOWN);
  assert.equal(r.kept.length, 2);
  assert.equal(r.withdrawn, false);
  const bad = verifyAnswer("Porto costs €80 a day [1]. Seville is warmer [2]. Lisbon is lovely. Both score 9.1 [1][2]. Lisbon has the Alfama [3].", PACK, KNOWN);
  assert.deepEqual(bad.failed.map((s) => s.why[0]), ["figure:80", "place:Seville", "nocite"]);
  assert.equal(bad.withdrawn, true, "3 of 5 failing withdraws the answer");
  assert.equal(verifyAnswer("Porto is nice [7].", PACK, KNOWN).failed[0].why[0], "badcite");
});

test("wire packs are checked before anything runs", () => {
  const w = wirePack(PACK);
  assert.deepEqual(readWirePack(w), w);
  assert.equal(readWirePack({ ...w, v: 9 }), null);
  assert.equal(readWirePack({ ...w, lang: "xx" }), null);
  assert.equal(readWirePack({ ...w, notes: Array(MAX_NOTES + 1).fill("x") }), null);
  assert.equal(readWirePack({ ...w, notes: ["x".repeat(301)] }), null);
  assert.equal(readWirePack({ ...w, question: "x".repeat(201) }), null);
  assert.match(userPrompt(w), /\[3\] Lisbon's Alfama/);
  assert.match(systemPrompt("de"), /German/);
});

test("stream lines in both Workers AI shapes", () => {
  assert.equal(pieceOf('data: {"response":"Hi"}'), "Hi");
  assert.equal(pieceOf('data: {"choices":[{"delta":{"content":"Yo"}}]}'), "Yo");
  assert.equal(pieceOf("data: [DONE]"), null);
});

// ---- The Function, with a fake model and a fake KV --------------------------

function fakeKV() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); } };
}
function fakeAI(text, calls) {
  return {
    run: async (id, opts) => {
      calls.push({ id, opts });
      const enc = new TextEncoder();
      const parts = text.match(/.{1,12}/g);
      return new ReadableStream({
        start(c) {
          for (const p of parts) c.enqueue(enc.encode(`data: ${JSON.stringify({ response: p })}\n\n`));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        },
      });
    },
  };
}
let ipN = 0;
async function call(env, body = wirePack(PACK)) {
  const pending = [];
  const request = new Request("https://carta.test/api/ask/answer", {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.0.0.${ipN++}` },
  });
  const res = await onRequestPost({ request, env, waitUntil: (p) => pending.push(p) });
  const text = await res.text();
  await Promise.all(pending);
  return { res, text };
}
const ANSWER = "Lisbon is drier in May [2]. Porto is cheaper at ~€101 est. a person a day [1].";

test("no counter, no model: the Function refuses without the ASK binding", async () => {
  const calls = [];
  const { res, text } = await call({ AI: fakeAI(ANSWER, calls) });
  assert.equal(res.status, 503);
  assert.match(text, /nocap/);
  assert.equal(calls.length, 0);
});

test("answers, caches, settles the count, and stops at the cap", async () => {
  const calls = [];
  const ASK = fakeKV();
  const env = { AI: fakeAI(ANSWER, calls), ASK };
  const first = await call(env);
  assert.equal(first.res.status, 200);
  assert.match(first.text, /event: done/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, MODELS[0].id);
  const day = [...ASK.m.keys()].find((k) => k.startsWith("n:"));
  const used = Number(ASK.m.get(day));
  assert.ok(used > 0 && used < 25, `one answer took ${used} Neurons`);
  const again = await call(env);
  assert.match(again.text, /"cached":true/);
  assert.equal(calls.length, 1, "a repeat is served from the cache");
  ASK.m.set(day, String(CAP));
  const capped = await call(env, { ...wirePack(PACK), question: "porto or lisbon in june" });
  assert.equal(capped.res.status, 429);
  assert.match(capped.text, /cap/);
  assert.equal(calls.length, 1);
});

test("writeAnswer streams only checked sentences from the server", async () => {
  const calls = [];
  const env = { AI: fakeAI("Lisbon is drier in May [2]. Seville is hotter [1]. Porto is cheaper at ~€101 est. a person a day [1]. Both score 9.1 [1][2].", calls), ASK: fakeKV() };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => onRequestPost({
    request: new Request(`https://carta.test${url}`, { ...init, headers: { ...init.headers, "cf-connecting-ip": "10.1.1.1" } }),
    env, waitUntil: () => {},
  });
  try {
    const seen = [];
    const r = await writeAnswer(PACK, { knownPlaces: KNOWN, onSentence: (s) => seen.push(s.text) });
    assert.equal(r.state, "done");
    assert.equal(r.backend, "server");
    assert.deepEqual(seen, ["Lisbon is drier in May.", "Porto is cheaper at ~€101 est. a person a day.", "Both score 9.1."]);
  } finally { globalThis.fetch = realFetch; }
});

test("writeAnswer says why when the server cannot write", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('event: error\ndata: {"reason":"cap"}\n\n', { status: 429 });
  try {
    assert.equal((await writeAnswer(PACK)).state, "cap");
  } finally { globalThis.fetch = realFetch; }
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  try {
    assert.equal((await writeAnswer(PACK)).state, "error");
  } finally { globalThis.fetch = realFetch; }
});

test("writeAnswer uses the on-device model first when it is ready", async () => {
  const onDevice = {
    isReady: () => true,
    generate: async ({ onToken, system }) => { assert.match(system, /English/); for (const p of ANSWER.split(" ")) onToken(`${p} `); },
  };
  const r = await writeAnswer(PACK, { knownPlaces: KNOWN, onDevice });
  assert.equal(r.backend, "device");
  assert.equal(r.sentences.length, 2);
});

// ---- Golden packs: small enough for the free allowance ----------------------

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const HAVE = existsSync(pub("app_data.json")) && existsSync(pub("search/guided.json")) && existsSync(pub("search_index.json"));

test("every golden question's pack fits about 400 free answers a day", { skip: !HAVE && "public/app_data.json not on this machine" }, async () => {
  const { buildAskVocab, parseIntent } = await import("../src/lib/ask/intent.js");
  const { answerFacts } = await import("../src/lib/ask/rank.js");
  const { composeAnswer } = await import("../src/lib/ask/compose.js");
  const { makeLabels } = await import("../src/lib/guidedSearch.js");
  const { computeCosts } = await import("../src/lib/costIndex.js");
  const { en } = await import("../src/i18n/en.js");
  const t = (k, v) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? String(v[x]) : m));
  const data = JSON.parse(readFileSync(pub("app_data.json"), "utf8"));
  const costs = computeCosts(data.destinations, {});
  const rows = Object.values(data.destinations).map((d) => ({ ...d, cost: costs.get(d.id) }));
  const byId = new Map(rows.map((p) => [p.id, p]));
  const guided = JSON.parse(readFileSync(pub("search/guided.json"), "utf8"));
  const index = JSON.parse(readFileSync(pub("search_index.json"), "utf8"));
  const countries = [...new Map(rows.map((p) => [p.iso2, p.country])).entries()];
  const labels = { ...makeLabels({ t, lang: "en", guided, countries }), place: (id) => byId.get(id)?.city || id };
  const golden = JSON.parse(readFileSync(new URL("./fixtures/ask-golden.json", import.meta.url), "utf8"));
  const now = new Date(`${golden.now}T12:00:00`);
  const vocab = buildAskVocab({ rows, guided, index, countries, t, lang: "en" });
  let worst = 0; let sum = 0; let n = 0;
  for (const c of golden.cases.filter((x) => x.lang === "en")) {
    const intent = parseIntent(c.q, { vocab, lang: "en", now });
    const facts = answerFacts(intent, { rows, byId, guided, today: now });
    const answer = composeAnswer(facts, intent, { t, lang: "en", labels });
    const pack = buildPack({ question: c.q, lang: "en", facts, answer, labels: { monthsText: (d) => (d.climate?.best || []).map(labels.month).join(", ") } });
    assert.ok(readWirePack(wirePack(pack)), `${c.q}: the pack is not a valid wire pack`);
    const tin = Math.ceil((systemPrompt("en").length + userPrompt(pack).length) / 3.5);
    const cost = neurons(MODELS[0], tin, MAX_ANSWER_TOKENS);
    worst = Math.max(worst, cost); sum += cost; n += 1;
  }
  console.log(`ask packs: ${n} English golden questions, worst case ${worst} Neurons, mean ${(sum / n).toFixed(1)}, so ${Math.floor(CAP / (sum / n))} answers a day at the cap`);
  assert.ok(worst <= 25, `worst pack ${worst} Neurons`);
});
