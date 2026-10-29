// T806 to T808: kept trips, their price since, and the shared shortlist.
// kept.js (the record, the flight it watches, the drop), keptStore.js (skips
// per answer set, the one-shot plan, with a stand-in localStorage) and
// together.js (the link round trip, a vote, the order). Pure, no DOM.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { DROP_MIN, biggestDrop, dropOf, flightLeg, flightNow, keptRecord } from "../src/lib/recommend/kept.js";
import { decodeTogether, encodeTogether, listId, pickOf, standing, startTogether, togetherUrl, vote } from "../src/lib/recommend/together.js";

class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
const store = await import("../src/lib/recommend/keptStore.js");

const minute = () => Math.floor(Date.now() / 60000) - 30;
/** A swept file with one day each way to LJU at these fares. */
const file = (outFare, backFare, from = "BRU") => ({
  from,
  checked: minute(),
  to: { LJU: { "2027-05-10": [outFare, "FR", "07:00", "09:00", 0, minute()] } },
  back: { LJU: { "2027-05-17": [backFare, "FR", "10:00", "12:00", 0, minute()] } },
});

const trip = (over = {}) => ({
  id: "tf_abc",
  country: "Slovenia",
  iso2: "SI",
  places: [{ id: "ljubljana", nights: 7 }],
  nights: 7,
  month: 5,
  dates: { out: "2027-05-10", back: "2027-05-17" },
  party: { head: 2, adults: 2, babies: 0 },
  gateway: { iata: "LJU", minutes: 20 },
  slots: [{ id: "flight", owner: "carta", eur: 230, eurGroup: 460, pick: { id: "swept", facts: { source: "swept" } } }],
  total: { perPerson: 1100, group: 2200 },
  state: {},
  ...over,
});

test("a kept trip watches its swept flight for the whole party", () => {
  const leg = flightLeg(trip());
  assert.deepEqual(leg, { iata: "LJU", out: "2027-05-10", back: "2027-05-17", paying: 2 });
  const then = flightNow(leg, file(100, 120));
  const lower = flightNow(leg, file(80, 120));
  assert.equal(then - lower, 40, "20 less a seat, two seats");
});

test("no flight to watch: own flight, driving, no dates, no gateway", () => {
  assert.equal(flightLeg(trip({ slots: [{ id: "flight", owner: "you", eur: 200 }] })), null);
  assert.equal(flightLeg(trip({ slots: [{ id: "flight", owner: "carta", pick: { facts: { source: "drive" } } }] })), null);
  assert.equal(flightLeg(trip({ dates: null })), null);
  assert.equal(flightLeg(trip({ gateway: null })), null);
});

test("the record keeps the card's figures and the flight it was priced with", () => {
  const r = keptRecord(trip(), { name: "Ljubljana", image: "x.jpg", origin: "BRU", plan: { order: ["ljubljana"] }, file: file(100, 120) });
  assert.equal(r.id, "tf_abc");
  assert.equal(r.total.perPerson, 1100);
  assert.equal(r.flight.then, flightNow(flightLeg(trip()), file(100, 120)));
  assert.equal(r.origin, "BRU");
  assert.deepEqual(r.plan.order, ["ljubljana"]);
  // No swept file at keep time: kept, but nothing to watch.
  assert.equal(keptRecord(trip(), { file: null }).flight, null);
});

test("a drop is the same flight, cheaper, a person, from the threshold up", () => {
  const r = keptRecord(trip(), { origin: "BRU", file: file(100, 120) });
  const d = dropOf(r, file(70, 110));
  assert.deepEqual(d, { perPerson: 40, group: 80, total: 1060 });
  assert.equal(dropOf(r, file(100 - (DROP_MIN - 1), 120)), null, "under the threshold");
  assert.equal(dropOf(r, file(130, 120)), null, "a rise is not a drop");
  assert.equal(dropOf(r, { from: "BRU", to: {}, back: {} }), null, "the flight is gone");
  assert.equal(dropOf(r, file(50, 50, "AMS")), null, "another home airport's file");
});

test("the biggest drop wins", () => {
  const a = keptRecord(trip(), { origin: "BRU", file: file(100, 120) });
  const b = { ...keptRecord(trip({ id: "tf_b" }), { origin: "BRU", file: file(150, 120) }) };
  const best = biggestDrop([a, b], { BRU: file(80, 120) });
  assert.equal(best.record.id, "tf_b");
  assert.equal(best.drop.perPerson, 70);
});

test("keep, unkeep and skips per answer set", () => {
  store.keep({ id: "a" });
  store.keep({ id: "b" });
  store.keep({ id: "a", again: true });
  assert.deepEqual(store.readKept().map((r) => r.id), ["a", "b"], "kept again moves to the top");
  store.unkeep("a");
  assert.deepEqual(store.readKept().map((r) => r.id), ["b"]);
  store.writeSkips("k1", ["x"]);
  store.writeSkips("k2", ["y", "z"]);
  assert.deepEqual(store.readSkips("k1"), ["x"]);
  assert.deepEqual(store.readSkips("k2"), ["y", "z"]);
  store.writeSkips("k1", []);
  assert.deepEqual(store.readSkips("k1"), []);
});

test("a held plan is read once, and only fresh", () => {
  store.holdPlan({ order: ["ljubljana"], tripId: "tf_abc" });
  assert.equal(store.takePlan().tripId, "tf_abc");
  assert.equal(store.takePlan(), null, "read once");
  store.holdPlan({ order: ["ljubljana"] });
  assert.equal(store.takePlan(Date.now() + 3 * 60 * 1000), null, "too old");
});

const rec = (id, name) => ({ id, name, country: "Slovenia", iso2: "SI", image: null, nights: 7, month: 5, dates: { out: "2027-05-10", back: "2027-05-17" }, total: { perPerson: 900 }, party: { head: 2 } });

test("the link carries the shortlist and the picks, and nothing else", () => {
  const list = startTogether([rec("a", "Bled"), rec("b", "Piran"), rec("c", "Kranj")]);
  assert.deepEqual(list.people, [{ keep: ["a", "b", "c"], skip: [] }]);
  const back = decodeTogether(encodeTogether(list));
  assert.deepEqual(back, list);
  assert.equal(decodeTogether("not a code"), null);
  assert.equal(decodeTogether(encodeTogether({ trips: [list.trips[0]], people: [] })), null, "one trip is no shortlist");
  const url = togetherUrl(list, "https://carta.example/plan#old");
  assert.ok(url.startsWith("https://carta.example/plan#together="));
  assert.equal(listId(list.trips), listId([...list.trips].reverse()));
});

test("a newcomer joins with their first pick, and agreed trips rise", () => {
  let list = startTogether([rec("a", "Bled"), rec("b", "Piran"), rec("c", "Kranj")]);
  list = { ...list, people: vote(list.people, 1, "c", "keep") };
  list = { ...list, people: vote(list.people, 1, "a", "skip") };
  assert.equal(pickOf(list.people, 1, "c"), "keep");
  const order = standing(list);
  assert.deepEqual(order.map((x) => x.trip.id), ["c", "b", "a"]);
  assert.equal(order[0].all, true);
  assert.equal(order[0].voters, 2);
  // Picking the same again clears it.
  const cleared = vote(list.people, 1, "c", null);
  assert.equal(pickOf(cleared, 1, "c"), null);
});
