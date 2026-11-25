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
import { boundFrom, budgetOf, candidateBound, priorityPull, pullRange, pullRoom, rankTrips } from "../src/lib/recommend/rank.js";
import { budgetRulerFor } from "../src/lib/budgetBasis.js";
import { missingLines } from "../src/lib/recommend/budgetCompass.js";
import RECOMMEND from "../config/recommend.json" with { type: "json" };
import { priceInSlices } from "../src/planner/finder/priceSlices.js";
import { buildTrips, priceFloor } from "../src/lib/recommend/trips.js";
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

// ---- generated candidate sets (owner decision 2026-11-25, "go on") ----------
// Many made-up lists, each priced in a random order: under a budget on either
// basis (guide or ceiling) and with balance, price or comfort first, the rank
// 1 (and every next card) shown early must be the final one. The trips carry
// true price floors as trips.js priceFloor makes them (beds and days exact,
// the flight at most its fare); the order is rankTrips' own (rank.js), with
// the real budget ruler, priorityPull and ceiling.

const mkRandom = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function makeSet(rnd) {
  const n = 3 + Math.floor(rnd() * 12);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const kind = pick([null, "total", "day"]);
  const budget = kind === "total" ? { kind, eur: pick([400, 600, 800, 1000]), mode: pick(["cap", "soft"]) } : kind === "day" ? { kind, eur: pick([60, 90, 120]), mode: pick(["cap", "soft"]) } : null;
  const settings = { priority: pick(["balance", "price", "comfort"]), guide: { budget }, avoidIso2: [] };
  // Close scores make the budget sink and the price pull decide the order.
  const spread = pick([0.4, 0.08, 0.03]);
  const trips = [];
  for (let i = 0; i < n; i++) {
    const nights = 7;
    const flight = rnd() < 0.3 ? null : 40 + Math.round(rnd() * 300);
    const stay = rnd() < 0.05 ? null : 150 + Math.round(rnd() * 600);
    const food = rnd() < 0.05 ? null : 100 + Math.round(rnd() * 300);
    const local = Math.round(rnd() * 80);
    const slots = [["flight", flight], ["stay", stay], ["food", food], ["local", local], ["activities", null]].map(([id, eur]) => ({ id, eur, eurGroup: eur, owner: "carta", pick: id === "flight" && eur != null ? { facts: { stops: pick([0, 1]), out: { minutes: 90 + Math.round(rnd() * 200) } } } : null }));
    const perPerson = slots.reduce((a, x) => a + (x.eur ?? 0), 0);
    const t = {
      id: `s${i}`, iso2: pick(["PT", "ES", "IT", "GR"]), shape: pick(["one", "towns"]), nights, party: { head: 1 },
      gateway: { minutes: 30 + Math.round(rnd() * 60) }, slots, total: { perPerson, group: perPerson },
      part: Math.round((0.9 - rnd() * spread) * 1000) / 1000, qualified: rnd() < 0.85, been: rnd() < 0.1,
    };
    Object.defineProperty(t, "quote", { value: { parts: { beds: stay ?? 0, days: (food ?? 0) + local } }, enumerable: false });
    // A true floor: beds, food and local fares (or less), the flight at most its fare.
    const anyCase = (stay ?? 0) + (food != null ? food : 0) + local * rnd();
    const fl = flight == null ? (rnd() < 0.5 ? false : null) : null;
    t.floor = {
      perPerson: anyCase * (rnd() < 0.5 ? 1 : rnd()),
      full: anyCase + (flight == null ? rnd() * 999 : flight * (rnd() < 0.5 ? 1 : rnd())),
      day: ((stay ?? 0) + (food ?? 0) + local) / nights,
      stay: stay != null, food: food != null, flight: fl,
    };
    t.floor.full = Math.min(t.floor.full, flight == null ? Infinity : perPerson);
    trips.push(t);
  }
  return { settings, trips };
}

/** rankTrips' order on made-up trips: the same ruler, sink, pull and sort. */
function rankMade(trips, settings) {
  const pull = priorityPull(trips, settings);
  const out = trips.map((t) => {
    const budget = budgetRulerFor(t, budgetOf(settings), t.quote);
    const unpriced = Boolean(budget) && (!Number.isFinite(budget.delta) || missingLines(t, budget.kind).length > 0);
    const sink = budget && !unpriced && budget.delta > 0 ? (RECOMMEND.budget.sinkPer100 * budget.delta) / 100 : 0;
    const shift = pull.get(t.id) || 0;
    const x = { ...t, budget, score: t.part - sink / 10 + shift };
    for (const [k, v] of [["quote", t.quote], ["unpriced", unpriced], ["shift", shift]]) Object.defineProperty(x, k, { value: v, enumerable: false });
    return x;
  });
  return out.sort((a, b) => (Number(b.qualified) - Number(a.qualified)) || (Number(a.unpriced) - Number(b.unpriced)) || (Number(a.been) - Number(b.been)) || (b.score - a.score) || a.id.localeCompare(b.id));
}

test("G12 early, generated sets: a rank 1 proven early is the final rank 1, under any budget and priority", () => {
  const rnd = mkRandom(20261125);
  let early = 0;
  let proven = 0;
  const SETS = 600;
  for (let s = 0; s < SETS; s++) {
    const { settings, trips } = makeSet(rnd);
    const visible = (xs) => budgetSplit(xs, settings.guide.budget).list;
    const boundOf = (t) => boundFrom({ id: t.id, qualified: t.qualified, been: t.been, part: t.part }, t.floor, settings);
    const order = rnd() < 0.5 ? trips.map((_, i) => i).sort(() => rnd() - 0.5) : pricingOrder(trips.map(boundOf));
    // Every bound holds for its trip once the whole list is ranked.
    const whole = rankMade(trips, settings);
    for (const t of trips) {
      const b = boundOf(t);
      const x = whole.find((y) => y.id === t.id);
      assert.ok(x.score <= b.hi + 1e-9 && x.score >= b.lo - 1e-9, `set ${s} ${t.id}: score within its bounds`);
      if (!x.unpriced) assert.ok(x.score <= b.hiFull + 1e-9, `set ${s} ${t.id}: fully priced, within its best bound`);
      if (b.unpriced != null) assert.equal(x.unpriced, b.unpriced, `set ${s} ${t.id}: "Not yet" foretold`);
      if (b.out) assert.ok(!visible(whole).some((y) => y.id === t.id), `set ${s} ${t.id}: a ceiling takes it out`);
    }
    let pinned = [];
    let firstAt = null;
    for (let n = 1; n < trips.length; n++) {
      const ranked = rankMade(order.slice(0, n).map((i) => trips[i]), settings);
      const later = order.slice(n).map((i) => boundOf(trips[i]));
      const next = pinTop(visible(ranked), later, { pinned, room: pullRoom(settings), pull: pullRange(ranked, later, settings) });
      assert.deepEqual(next.slice(0, pinned.length), pinned, `set ${s}: a shown card keeps its slot`);
      if (next.length && firstAt == null) firstAt = n;
      pinned = next;
    }
    const final = diverseOrder(visible(whole)).map((x) => x.id);
    assert.deepEqual(final.slice(0, pinned.length), pinned, `set ${s}: the early cards are the final cards`);
    if (pinned.length) proven += 1;
    if (firstAt != null) early += 1;
  }
  console.log(`# generated: ${SETS} sets, rank 1 proven before the last trip was priced in ${early}`);
  assert.ok(early > SETS / 4, "the proof is not vacuous: it settles early in many sets");
  assert.ok(proven === early);
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
  // G12 "go on" (owner 2026-11-25): budgets on both bases, both modes, and price first.
  "couple, city, a day budget": { party: { kind: "couple", adults: 2 }, when: { mode: "months", months: [5], nights: 6 }, guide: { likes: ["food", "culture"], budget: { kind: "day", eur: 90 } } },
  "solo, a tight day ceiling, price first": { party: { kind: "solo", adults: 1 }, priority: "price", when: { mode: "months", months: [10], nights: 5 }, guide: { likes: ["culture"], budget: { kind: "day", eur: 70, mode: "cap" } } },
  "couple, price first, a trip budget": { party: { kind: "couple", adults: 2 }, priority: "price", when: { mode: "months", months: [6], nights: 7 }, guide: { likes: ["beach"], budget: { kind: "total", eur: 800 } } },
  "family, comfort, a day budget": { party: { kind: "family", adults: 2, kids: 1, kidAges: [8] }, priority: "comfort", when: { mode: "months", months: [7], nights: 7 }, guide: { likes: ["nature"], budget: { kind: "day", eur: 60 } } },
};

/** The finder's own loop (finderHooks.js useTripFinder), with or without the price floors. */
async function runEarly(raw, { floors = true, order = null } = {}) {
  const settings = normalizeSettings({ answered: ["who", "when", "from"], ...raw });
  const input = { data: { ...data }, settings, origin: { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" }, flights, today: "2026-11-25" };
  const opts = { settings, data: input.data };
  const rank = (xs) => rankTrips(xs, opts);
  const visible = (xs) => budgetSplit(xs, settings.guide?.budget).list;
  const bounds = new Map();
  const floorOf = new Map();
  const boundOf = (c) => {
    if (!bounds.has(c)) {
      const floor = floors ? priceFloor(c, input) : null;
      floorOf.set(c, floor);
      bounds.set(c, candidateBound(c, { ...opts, floor }));
    }
    return bounds.get(c);
  };
  let pinned = [];
  let firstAt = null;
  const built = await priceInSlices(input, {
    sliceMs: -1,
    yieldFrame: async () => {},
    order: (cands) => (order ? order(cands.map(boundOf)) : pricingOrder(cands.map(boundOf))),
    onSome: (some, pending) => {
      const ranked = rank(some);
      const later = pending.map(boundOf);
      const next = pinTop(visible(ranked), later, { pinned, room: pullRoom(settings), pull: floors ? pullRange(ranked, later, settings) : null });
      assert.deepEqual(next.slice(0, pinned.length), pinned, "a shown card keeps its slot");
      if (next.length && firstAt == null) firstAt = some.length;
      pinned = next;
    },
  });
  return { settings, input, rank, visible, bounds, floorOf, built, pinned, firstAt };
}

for (const [name, raw] of Object.entries(CASES)) {
  test(`G12 early, the real engine (${name}): every early card is the whole list's card for that slot`, { skip }, async () => {
    const before = await runEarly(raw, { floors: false });
    const { settings, input, rank, visible, bounds, floorOf, built, pinned, firstAt } = await runEarly(raw);
    const whole = buildTrips({ ...input, data: input.data });
    assert.deepEqual(built.map((x) => x.id), whole.map((x) => x.id), "priced in another order, returned in candidate order");
    const final = diverseOrder(visible(rank(built))).map((x) => x.id);
    assert.deepEqual(final.slice(0, pinned.length), pinned, "the early cards are the whole list's own top cards");
    assert.deepEqual(final.slice(0, before.pinned.length), before.pinned, "and without the floors too");
    // A candidate's bound and floor hold for the trip once priced.
    const ranked = rank(built);
    const kind = settings.guide.budget ? (settings.guide.budget.kind === "total" ? "total" : "day") : null;
    for (const [c, b] of bounds) {
      const x = ranked.find((t) => t.id === b.id);
      if (!x) continue;
      assert.ok(x.score <= b.hi + 1e-9, `${b.id}: score within its best bound`);
      assert.ok(x.score >= b.lo - 1e-9, `${b.id}: score within its worst bound`);
      if (!x.unpriced) assert.ok(x.score <= b.hiFull + 1e-9, `${b.id}: fully priced, score within its best bound`);
      if (b.unpriced != null) assert.equal(Boolean(x.unpriced), b.unpriced, `${b.id}: "Not yet" known before pricing`);
      assert.equal(x.qualified, b.qualified);
      const f = floorOf.get(c);
      assert.ok(x.total.perPerson >= f.perPerson, `${b.id}: the floor ${f.perPerson} never passes the total ${x.total.perPerson}`);
      const noFlight = x.slots.some((sl) => sl.id === "flight" && sl.eur == null);
      if (!noFlight) assert.ok(x.total.perPerson >= f.full, `${b.id}: with its flight, the floor ${f.full} never passes the total ${x.total.perPerson}`);
      if (f.flight === false) assert.ok(noFlight, `${b.id}: no fare anywhere, so its flight is "Not yet"`);
      if (kind === "day" && Number.isFinite(x.budget?.delta)) assert.ok(Math.abs(x.budget.delta + x.budget.eur - f.day) < 0.01, `${b.id}: the day spend is known before pricing`);
      if (b.out) assert.ok(!visible(ranked).some((t) => t.id === b.id), `${b.id}: a ceiling takes it out, as foretold`);
    }
    console.log(`# ${name}: ${built.length} trips, rank 1 settled after ${firstAt ?? built.length} priced (${before.firstAt ?? built.length} without floors), ${pinned.length} settled before the last (${before.pinned.length})`);
  });
}

test("G12 early, the real engine: any pricing order, rank 1 shown early is the final rank 1", { skip }, async () => {
  // A shuffled order (not the best reachable first) stresses the proof: it
  // must hold whatever is priced first.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const raw of Object.values(CASES)) {
    for (let r = 0; r < 2; r++) {
      const shuffle = (bs) => bs.map((_, i) => i).sort(() => rnd() - 0.5);
      const { rank, visible, built, pinned } = await runEarly(raw, { order: shuffle });
      const final = diverseOrder(visible(rank(built))).map((x) => x.id);
      assert.deepEqual(final.slice(0, pinned.length), pinned);
    }
  }
});
