// T792: the slot registry and the non-flight adapters of the trip finder
// (lib/recommend/slots.js). The adapters wrap the price engine and never
// price anything themselves, so every option here is checked against a
// fresh quoteTrip of the same trip with that one setting changed.
// Run: npm test (continent-app/). Uses public/app_data.json; skips without it.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  SLOT_ROWS, ADAPTERS, defaultPick, ownerOf, buildSlots, prepareState, chooseOption, slotTotals,
} from "../src/lib/recommend/slots.js";
import { quoteTrip } from "../src/lib/price/trip.js";
import { wizardPlannerState } from "../src/lib/tripTotal.js";
import { PROFILES } from "../src/lib/lifestyleProfiles.js";

const DATA = new URL("../public/app_data.json", import.meta.url);
const have = existsSync(DATA);
const data = have ? JSON.parse(readFileSync(DATA, "utf8")) : null;
const skip = have ? false : "public/app_data.json is not on this machine";

/** Ljubljana 3 nights and Bled 4, two people, the way the trip finder builds it. */
function trip(ctx = {}, over = {}) {
  const handOver = {
    startDate: "2027-05-09", groupSize: 2, transport: "auto", baggage: "priority",
    stops: [{ destinationId: "LJU", nights: 3 }, { destinationId: "gem:bled", nights: 4 }],
    ...over,
  };
  const c = { data, priority: "balance", ...ctx };
  const state = prepareState(wizardPlannerState(handOver, { lifestyle: c.lifestyle || null }), c);
  const quote = quoteTrip(state, { data });
  return { state, quote, ctx: c, slots: buildSlots({ trip: null, quote, state, ctx: c }) };
}
const slot = (slots, id) => slots.find((s) => s.id === id);

test("the registry: five slots in order, things to do not yet", () => {
  assert.deepEqual(SLOT_ROWS.map((r) => r.id), ["flight", "stay", "food", "local", "activities"]);
  assert.equal(SLOT_ROWS.find((r) => r.id === "activities").status, "notYet");
  for (const r of SLOT_ROWS) assert.ok(r.labelKey.startsWith("tf.slot."), r.id);
  // Question 7 ticks every pickable live slot by default; never a notYet one.
  assert.deepEqual(defaultPick(), ["flight", "stay", "local"]);
});

test("question 7's answer is the slot's owner", () => {
  const row = (id) => SLOT_ROWS.find((r) => r.id === id);
  assert.equal(ownerOf(row("stay"), ["flight"]), "you");
  assert.equal(ownerOf(row("stay"), ["flight", "stay"]), "carta");
  assert.equal(ownerOf(row("food"), []), "carta", "food is not offered, so it stays Carta's");
  assert.equal(ownerOf(row("activities"), ["activities"]), "you", "a notYet slot cannot be Carta's pick");
});

test("every trip has every slot; things to do is NotYet and out of the sum", { skip }, () => {
  const { slots } = trip();
  assert.deepEqual(slots.map((s) => s.id), SLOT_ROWS.map((r) => r.id));
  const acts = slot(slots, "activities");
  assert.equal(acts.eur, null);
  assert.equal(acts.options, null);
  assert.equal(acts.quality, "missing");
  const t = slotTotals(slots);
  assert.equal(t.perPerson, slots.filter((s) => s.eur != null).reduce((n, s) => n + s.eur, 0));
});

test("stay, food and getting around add up to the engine's own parts", { skip }, () => {
  const { slots, quote } = trip();
  const { parts } = quote;
  const sum = ["stay", "food", "local"].reduce((n, id) => n + slot(slots, id).eurGroup, 0);
  const engine = parts.beds + parts.days + parts.transfers + parts.between + parts.car;
  assert.ok(Math.abs(sum - engine) <= 2, `${sum} against ${engine} (whole-euro rounding only)`);
  for (const id of ["stay", "food", "local"]) {
    const s = slot(slots, id);
    assert.equal(s.eur, Math.round(s.eurGroup / 2), `${id} is per person`);
    assert.ok(s.eur > 0, `${id} has a price`);
  }
});

test("a stay option costs what the engine quotes for that tier", { skip }, () => {
  const { slots } = trip();
  const s = slot(slots, "stay");
  assert.equal(s.pick.id, "room", "balance picks the guesthouse room");
  assert.deepEqual(s.options.map((o) => o.id), ["room", "private", "hotel3"]);
  assert.equal(s.options.find((o) => o.id === "room").delta, 0);
  for (const o of s.options) {
    const again = trip({ stayTier: o.id });
    assert.equal(o.eurGroup, Math.round(again.quote.parts.beds), `${o.id} is the engine's beds`);
  }
  const hotel = s.options.find((o) => o.id === "hotel3");
  const priv = s.options.find((o) => o.id === "private");
  assert.ok(hotel.eur > priv.eur, "a hotel costs more than a hostel room");
});

test("a food option costs what the engine quotes at that Lifestyle", { skip }, () => {
  const { slots } = trip({ lifestyle: PROFILES.Easygoing });
  const f = slot(slots, "food");
  assert.equal(f.pick.id, "mix");
  const out = f.options.find((o) => o.id === "out");
  const cook = f.options.find((o) => o.id === "cook");
  assert.ok(out.eur > cook.eur, "eating out costs more than cooking");
  const foodie = trip({ lifestyle: PROFILES.Foodie });
  assert.equal(out.eurGroup, slot(foodie.slots, "food").eurGroup);
});

test("a hire car option is the trip quoted with a hire car", { skip }, () => {
  const { slots } = trip();
  const l = slot(slots, "local");
  assert.equal(l.pick.id, "public");
  const car = l.options.find((o) => o.id === "car");
  assert.ok(car && car.eur > l.eur, "a hire car adds its hire");
  const noCar = trip({ noCar: true });
  assert.deepEqual(slot(noCar.slots, "local").options.map((o) => o.id), ["public"]);
});

test("a slot the traveller chooses still counts at its typical price", { skip }, () => {
  const carta = trip();
  const yours = trip({ pick: ["flight"] });
  const a = slot(carta.slots, "stay");
  const b = slot(yours.slots, "stay");
  assert.equal(b.owner, "you");
  assert.equal(b.pick, null);
  assert.equal(b.eur, a.eur);
  assert.equal(slotTotals(yours.slots).perPerson, slotTotals(carta.slots).perPerson);
});

test("choosing an option swaps the slot's price and its deltas", { skip }, () => {
  const s = slot(trip().slots, "stay");
  const hotel = chooseOption(s, "hotel3");
  assert.equal(hotel.pick.id, "hotel3");
  assert.equal(hotel.eur, s.options.find((o) => o.id === "hotel3").eur);
  assert.equal(hotel.options.find((o) => o.id === "hotel3").delta, 0);
  assert.ok(hotel.options.find((o) => o.id === "room").delta < 0);
  assert.equal(chooseOption(s, "castle"), s);
});

test("a new row and its adapter add a slot with no other change", { skip }, () => {
  const rows = [...SLOT_ROWS, {
    id: "insurance", order: 60, labelKey: "tf.slot.insurance", adapter: "insurance", pickable: true, status: "live",
  }];
  const adapters = { ...ADAPTERS, insurance: { price: () => ({ eurGroup: 50, pick: null, options: null, because: null, quality: "modelled" }) } };
  const base = trip();
  const slots = buildSlots({ trip: null, quote: base.quote, state: base.state, ctx: base.ctx }, { rows, adapters });
  assert.equal(slots.length, SLOT_ROWS.length + 1);
  assert.equal(slot(slots, "insurance").eur, 25);
  assert.equal(slotTotals(slots).perPerson, slotTotals(base.slots).perPerson + 25);
  assert.ok(defaultPick(rows).includes("insurance"));
});
