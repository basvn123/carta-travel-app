// G12 early results (owner decision 2026-11-25, "Show results early"): a top
// card shows as soon as no trip still to price can take its slot, and it
// never moves (lib/recommend/early.js, rank.js candidateBound, diversify.js
// pinned, planner/finder/priceSlices.js order). The rules are pinned on
// hand-built trips; then the real engine on the published catalogue checks
// that every card settled early is the card the whole list puts in that slot.
// Run: npm test (continent-app/). The catalogue tests skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pinTop, pricingOrder } from "../src/lib/recommend/early.js";
import { diverseOrder, diversify } from "../src/lib/recommend/diversify.js";
import { candidateBound, pullRoom, rankTrips } from "../src/lib/recommend/rank.js";
import { priceInSlices } from "../src/planner/finder/priceSlices.js";
import { buildTrips } from "../src/lib/recommend/trips.js";
import { budgetSplit } from "../src/lib/recommend/budgetCompass.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";

const slot = (id, eur) => ({ id, eur, owner: "carta" });
const trip = (id, score, { iso2 = id.toUpperCase(), shape = "one", qualified = true, unpriced = false, been = false, total = 1000, shift = 0, notYet = false } = {}) => {
  const x = { id, score, iso2, shape, qualified, slots: [slot("flight", notYet ? null : 100), slot("stay", 300)], total: { group: total, perPerson: total / 2 }, ...(been ? { been: true } : {}) };
  Object.defineProperty(x, "unpriced", { value: unpriced, enumerable: false });
  Object.defineProperty(x, "shift", { value: shift, enumerable: false });
  return x;
};
const bound = (id, hi, { lo = -Infinity, qualified = true, been = false } = {}) => ({ id, hi, lo, qualified, been });

test("G12 early: rank 1 shows only once no trip still to price can beat it", () => {
  const pool = [trip("a", 0.8)];
  assert.deepEqual(pinTop(pool, [bound("b", 0.81)]), [], "a trip still to price could still reach more");
  assert.deepEqual(pinTop(pool, [bound("b", 0.79)]).slice(0, 1), ["a"], "nothing left can reach it");
  assert.deepEqual(pinTop(pool, [bound("b", 0.95, { qualified: false })]).slice(0, 1), ["a"], "a trip that does not fit the answers never comes first");
  assert.deepEqual(pinTop(pool, [bound("b", 0.95, { been: true })]).slice(0, 1), ["a"], "a country been to comes after a new one");
  assert.deepEqual(pinTop(pool, [bound("b", 0.79)], { room: 0.03 }), [], "the price pull can still move both");
  assert.deepEqual(pinTop(pool, [bound("b", 0.7)], { room: 0.03 }).slice(0, 1), ["a"]);
  assert.deepEqual(pinTop(pool, [bound("b", 0.1)], { room: Infinity }), [], "a flight lever: nothing is bounded");
});

test("G12 early: under a budget a trip with a Not yet line never settles ahead of one still to price", () => {
  const pool = [trip("a", 0.9, { unpriced: true })];
  assert.deepEqual(pinTop(pool, [bound("b", 0.1)]), [], "b may turn out fully priced, and those come first");
  assert.deepEqual(pinTop(pool, []).slice(0, 1), ["a"], "with nothing left to price it is rank 1");
});

test("G12 early: the next slots of the diverse top set settle only when certain", () => {
  // a is rank 1; b shares a's country, c differs. With nothing left to
  // price the slots follow diversify exactly.
  const pool = [trip("a", 0.9, { iso2: "PT" }), trip("b", 0.88, { iso2: "PT" }), trip("c", 0.8, { iso2: "ES" })];
  const all = pinTop(pool, [], { k: 3 });
  assert.deepEqual(all, diversify(pool, { k: 3 }).map((x) => x.id));
  // A trip still to price that could be as good and unlike a: the second slot waits.
  assert.deepEqual(pinTop(pool, [bound("d", 0.9)], { k: 3 }), [], "rank 1 itself is not settled");
  assert.deepEqual(pinTop(pool, [bound("d", 0.85)], { k: 3 }), ["a"], "d could take the second slot (it is unlike a)");
  // b's third slot: 0.7 x 0.88 - 0.3 x 1 (same country, shape and maybe band
  // as a) = 0.316 at worst; d unlike everything reaches 0.7 x 0.5 = 0.35.
  assert.deepEqual(pinTop(pool, [bound("d", 0.5)], { k: 3 }), ["a", "c"], "d could still take the third slot from b");
  assert.deepEqual(pinTop(pool, [bound("d", 0.3)], { k: 3 }), all, "d can no longer reach any slot");
});

test("G12 early: shown cards keep their slots, and the list continues from them", () => {
  const pool = [trip("a", 0.9), trip("b", 0.95), trip("c", 0.7)];
  // b now scores best (say it came back from Show them again); a was shown first.
  assert.deepEqual(pinTop(pool, [], { pinned: ["a"], k: 2 }).slice(0, 1), ["a"], "a shown card is never displaced");
  const order = diverseOrder(pool, { pinned: ["a"] }).map((x) => x.id);
  assert.equal(order[0], "a", "rank 1 stays where it was shown");
  assert.deepEqual(new Set(order), new Set(["a", "b", "c"]), "the later trip goes below, nothing is lost");
  assert.deepEqual(diverseOrder(pool, { pinned: ["gone", "a"] }).map((x) => x.id)[0], "a", "a pinned trip no longer listed is passed over");
  assert.deepEqual(diverseOrder(pool).map((x) => x.id), diverseOrder(pool, { pinned: [] }).map((x) => x.id), "no pins: as before");
});

test("G12 early: pricing starts with the trips that can reach the most", () => {
  const order = pricingOrder([bound("a", 0.5), bound("b", 0.9), bound("c", 0.99, { qualified: false }), bound("d", 0.95, { been: true }), bound("e", 0.7)]);
  assert.deepEqual(order, [1, 4, 0, 3, 2]);
});

// ---- the real engine ----------------------------------------------------------

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";
const flights = JSON.parse(readFileSync(new URL("./fixtures/tf1-flights-BRU.json", import.meta.url), "utf8"));
const at = Math.floor(Date.now() / 60000) - 30;
for (const side of [flights.to, flights.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
flights.checked = at;
flights.from = "BRU";

const CASES = {
  "couple, food, May, balance": { party: { kind: "couple", adults: 2 }, when: { mode: "months", months: [5], nights: 7 }, guide: { likes: ["food"] } },
  "family, beach, any time, price first": { party: { kind: "family", adults: 2, kids: 2, kidAges: [6, 9] }, priority: "price", when: { mode: "any", nights: 7 }, guide: { likes: ["beach", "nature"] } },
  "solo, culture, a ceiling": { party: { kind: "solo", adults: 1 }, when: { mode: "months", months: [6], nights: 5 }, guide: { likes: ["culture"], budget: { kind: "total", eur: 900, mode: "cap" } } },
  "couple, comfort, a guide budget": { party: { kind: "couple", adults: 2 }, priority: "comfort", when: { mode: "months", months: [9], nights: 7 }, guide: { likes: ["nature"], budget: { kind: "total", eur: 1200 } } },
};

for (const [name, raw] of Object.entries(CASES)) {
  test(`G12 early, the real engine (${name}): every early card is the whole list's card for that slot`, { skip }, async () => {
    const settings = normalizeSettings({ answered: ["who", "when", "from"], ...raw });
    const input = { data: { ...data }, settings, origin: { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" }, flights, today: "2026-11-25" };
    const opts = { settings, data: input.data };
    const rank = (xs) => rankTrips(xs, opts);
    const visible = (xs) => budgetSplit(xs, settings.guide?.budget).list;
    const bounds = new Map();
    const boundOf = (c) => { if (!bounds.has(c)) bounds.set(c, candidateBound(c, opts)); return bounds.get(c); };
    let pinned = [];
    let firstAt = null;
    let n = 0;
    const built = await priceInSlices(input, {
      sliceMs: -1,
      yieldFrame: async () => {},
      order: (cands) => pricingOrder(cands.map(boundOf)),
      onSome: (some, pending) => {
        n = some.length;
        const ranked = rank(some);
        const next = pinTop(visible(ranked), pending.map(boundOf), { pinned, room: pullRoom(settings) });
        assert.deepEqual(next.slice(0, pinned.length), pinned, "a shown card keeps its slot");
        if (next.length && firstAt == null) firstAt = n;
        pinned = next;
      },
    });
    const whole = buildTrips({ ...input, data: input.data });
    assert.deepEqual(built.map((x) => x.id), whole.map((x) => x.id), "priced in another order, returned in candidate order");
    const final = diverseOrder(visible(rank(built))).map((x) => x.id);
    assert.deepEqual(final.slice(0, pinned.length), pinned, "the early cards are the whole list's own top cards");
    // A candidate's bound holds for the trip once priced.
    const ranked = rank(built);
    const cands = [...bounds.keys()];
    for (const c of cands) {
      const b = bounds.get(c);
      const x = ranked.find((t) => t.id === b.id);
      if (!x) continue;
      assert.ok(x.score <= b.hi + 1e-9, `${b.id}: score within its best bound`);
      assert.ok(x.score >= b.lo - 1e-9, `${b.id}: score within its worst bound`);
      assert.equal(x.qualified, b.qualified);
    }
    console.log(`# ${name}: ${built.length} trips, rank 1 settled after ${firstAt ?? built.length} priced, ${pinned.length} settled before the last`);
  });
}
