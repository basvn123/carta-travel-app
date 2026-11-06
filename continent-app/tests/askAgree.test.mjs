// T1101 (E6): the written Ask answer and the cards agree. 20 representative
// questions, the model stubbed by recorded answers (a good one, and for some
// questions a bad one the model once gave or could give). For each: every
// place the shown text names is a card on screen, in the cards' order where
// the answer ranks them, with that place's own figures and months. A bad
// recording must never reach the traveller. No network.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { buildPack } from "../src/lib/ask/context.js";
import { writeAnswer } from "../src/lib/ask/generate.js";
import { replyText, SHOWN_PLACES } from "../src/lib/ask/reply.js";
import { namedIn } from "../src/lib/ask/agree.js";

const D = (id, city, country, score, best) => ({ id, city, country, rating: { score }, climate: { best } });
const CAT = {
  TOR: D("TOR", "Castel di Tora", "Italy", 8.4, [6, 7]), ESZ: D("ESZ", "Esztergom", "Hungary", 7.9, [5, 6]),
  OPO: D("OPO", "Porto", "Portugal", 9.1, [5, 6]), LIS: D("LIS", "Lisbon", "Portugal", 9.1, [5, 6]),
  SVQ: D("SVQ", "Seville", "Spain", 8.8, [3, 4]), ATH: D("ATH", "Athens", "Greece", 8.6, [4, 5]),
  KRK: D("KRK", "Krakow", "Poland", 8.7, [5, 6]), PRG: D("PRG", "Prague", "Czechia", 9.0, [5, 6]),
  BLQ: D("BLQ", "Bologna", "Italy", 8.5, [4, 5]), NCE: D("NCE", "Nice", "France", 8.9, [5, 6]),
  OHD: D("OHD", "Ohrid", "North Macedonia", 8.2, [6, 7]), SPU: D("SPU", "Split", "Croatia", 8.8, [6, 7]),
};
const KNOWN = Object.values(CAT).map((d) => d.city);
// q, type, ranked picks (ids), month words in the question, good recording, bad recording
const CASES = [
  ["quiet lake with good walks in June under 120 a day", "find", ["TOR", "ESZ", "OHD", "SPU"],
    "Castel di Tora is a calm lake town with a score of 8.4 of 10 [1]. Esztergom follows on 7.9 [2].",
    "Castel di Tora is a calm lake town [1]. Esztergom is also fine [3]."],
  ["warm beach in October under 80 euros a day", "find", ["SPU", "ATH", "SVQ", "NCE"],
    "Split scores 8.8 of 10 [1]. Athens scores 8.6 [2].", "Nice scores 8.9 of 10 [4]. Split scores 8.8 [1]."],
  ["porto or lisbon in may", "compare", ["OPO", "LIS"],
    "Lisbon scores 9.1 [2] and Porto scores 9.1 [1].", "Porto scores 9.1 [1] and Lisbon 7.5 [2]."],
  ["cheap city for a long weekend in May", "budget", ["KRK", "PRG", "BLQ", "ATH"],
    "Krakow scores 8.7 of 10 [1]. Prague scores 9.0 [2].", "Prague scores 9.0 [2]. Krakow scores 8.7 [1]."],
  ["best time to visit Seville", "when", ["SVQ"], "Seville is best in March and April [1].", "Seville is best in August [1]."],
  ["where is quiet and warm in June", "find", ["OHD", "SPU", "NCE"],
    "Ohrid scores 8.2 of 10 [1]. Split scores 8.8 [2].", "Ohrid scores 8.2 of 10 [1]. Athens is hot [2]."],
  ["foodie trip in Italy in April", "find", ["BLQ", "TOR"], "Bologna scores 8.5 of 10 [1].", "Bologna scores 9.9 of 10 [1]."],
  ["somewhere with history for 5 days", "plan", ["ATH", "PRG", "KRK"],
    "Athens scores 8.6 of 10 [1]. Prague scores 9.0 [2].", "Prague scores 9.0 [2]. Athens scores 8.6 [1]."],
  ["quiet village near the sea in May", "find", ["OHD", "SPU"], "Ohrid scores 8.2 of 10 [1].", "Split scores 8.8 of 10 [1]. Ohrid scores 8.2 [2]."],
  ["romantic city in June", "find", ["PRG", "NCE", "LIS"], "Prague scores 9.0 of 10 [1]. Nice scores 8.9 [2].", "Lisbon scores 9.1 of 10 [3]. Prague scores 9.0 [1]."],
  ["sunny escape in March", "find", ["SVQ", "ATH"], "Seville scores 8.8 of 10 [1].", "Seville is best in July [1]."],
  ["compare Krakow and Prague", "compare", ["KRK", "PRG"], "Krakow scores 8.7 [1] and Prague scores 9.0 [2].", "Krakow scores 8.7 [1] and Prague scores 8.0 [2]."],
  ["lake town for hiking", "find", ["TOR", "OHD", "ESZ"], "Castel di Tora scores 8.4 of 10 [1].", "Esztergom scores 7.9 of 10 [3]. Castel di Tora scores 8.4 [1]."],
  ["what is good in May", "find", ["PRG", "KRK", "OPO", "LIS"], "Prague scores 9.0 of 10 [1]. Krakow scores 8.7 [2].", "Prague scores 9.0 of 10 [1]. Lisbon scores 9.1 [4]."],
  ["wine and food under 100 a day", "budget", ["BLQ", "SVQ", "OPO"], "Bologna scores 8.5 of 10 [1].", "Bologna scores 8.5 of 10 [1]. Porto scores 9.1 [3]."],
  ["city break in November", "find", ["SVQ", "LIS", "ATH"], "Seville scores 8.8 of 10 [1]. Lisbon scores 9.1 [2].", "Athens scores 8.6 of 10 [3]. Seville scores 8.8 [1]."],
  ["old towns by train in Spain", "find", ["SVQ"], "Seville scores 8.8 of 10 [1].", "Seville scores 8.8 of 10 [1]. Prague scores 9.0 [1]."],
  ["islands and beaches in Croatia", "find", ["SPU"], "Split scores 8.8 of 10 [1].", "Split is best in January [1]."],
  ["best months for Athens", "when", ["ATH"], "Athens is best in April and May [1].", "Athens is best in September [1]."],
  ["Nice or Split in June", "compare", ["NCE", "SPU"], "Nice scores 8.9 [1] and Split scores 8.8 [2].", "Nice scores 8.9 [1] and Bologna scores 8.5 [2]."],
];

const sse = (text) => `data: ${JSON.stringify({ t: text })}\n\nevent: done\ndata: {"cached":false}\n\n`;
async function run(type, ids, q, recorded) {
  const picks = ids.map((id) => ({ id, dest: CAT[id] }));
  const facts = { type, picks, query: {}, relaxed: [] };
  const pack = buildPack({ question: q, lang: "en", facts, answer: { picks: [], notes: [], lead: "" },
    passages: [], labels: { monthsText: (d) => d.climate.best.map((m) => ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m]).join(", ") } });
  // Fixtures cite [n] for the n-th ranked pick; the pack numbers its notes (lead and comparisons first).
  const cite = (t) => t.replace(/\[(\d+)\]/g, (m, n) => `[${pack.notes.findIndex((x) => x.destId === ids[n - 1]) + 1}]`);
  const cards = picks.slice(0, SHOWN_PLACES).map((p) => ({ id: p.id, city: p.dest.city }));
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(sse(cite(recorded)), { status: 200 });
  try {
    const r = await writeAnswer(pack, { knownPlaces: KNOWN, cards, type });
    return { r, cards, text: replyText(r.sentences) };
  } finally { globalThis.fetch = real; }
}

for (const [q, type, ids, good, bad] of CASES) {
  test(`answer and cards agree: ${q}`, async () => {
    const g = await run(type, ids, q, good);
    assert.equal(g.r.state, "done", `good recording shows: ${JSON.stringify([g.r, g.cards])}`);
    const cardNames = g.cards.map((c) => c.city);
    const named = namedIn(g.text, KNOWN).sort((a, b) => a.at - b.at).map((x) => x.name);
    for (const n of named) assert.ok(cardNames.includes(n), `${n} is named but has no card`);
    if (type !== "compare") {
      const idx = named.map((n) => cardNames.indexOf(n));
      assert.deepEqual(idx, [...idx].sort((a, b) => a - b), "text follows card order");
    }
    // The bad recording either stops entirely or loses its offending sentence.
    const b = await run(type, ids, q, bad);
    if (b.r.state === "done") {
      const bn = namedIn(b.text, KNOWN).map((x) => x.name);
      for (const n of bn) assert.ok(b.cards.map((c) => c.city).includes(n), `${n} reached the traveller without a card`);
      assert.ok(!/ 7\.5 | 9\.9 | 8\.0 |July|August|January|September/.test(b.text), `a wrong number or month reached the traveller: ${b.text}`);
    } else {
      assert.equal(b.r.state, "withdrawn");
      assert.deepEqual(b.r.sentences, []);
    }
  });
}

test("the live failure: a note-named place without a card never reaches the traveller", async () => {
  const q = CASES[0][0];
  const ids = ["TOR", "ESZ", "OHD", "SPU"];
  // Half the sentences fail: withdrawn, the cards and facts answer stay.
  const half = await run("find", ids, q, "Split is a lake town [4]. Castel di Tora scores 8.4 of 10 [1].");
  assert.equal(half.r.state, "withdrawn");
  assert.equal(half.text, "");
  // One bad sentence in four: only it is dropped.
  const one = await run("find", ids, q, "Castel di Tora scores 8.4 of 10 [1]. Esztergom scores 7.9 [2]. Ohrid scores 8.2 [3]. Split is a lake town [4].");
  assert.equal(one.r.state, "done");
  assert.ok(!/Split/.test(one.text));
  assert.equal(one.r.sentences.length, 3);
});

test("a text that reorders a ranking is withdrawn, a comparison keeps the asked order", async () => {
  const rev = await run("find", ["PRG", "KRK"], "city in May", "Krakow scores 8.7 of 10 [2]. Prague scores 9.0 [1].");
  assert.equal(rev.r.state, "withdrawn");
  assert.equal(rev.r.reordered, true);
  const cmp = await run("compare", ["PRG", "KRK"], "krakow or prague in may", "Krakow scores 8.7 of 10 [2]. Prague scores 9.0 [1].");
  assert.equal(cmp.r.state, "done");
});

test("a figure from another place's row is dropped", async () => {
  const r = await run("find", ["PRG", "KRK", "ATH", "NCE"], "city in May", "Prague scores 8.7 of 10 [2]. Krakow scores 8.7 [2]. Athens scores 8.6 [3]. Nice is warm [4].");
  assert.ok(!/Prague scores 8\.7/.test(r.text));
});
