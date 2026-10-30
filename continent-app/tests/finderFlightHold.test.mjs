// T855: the trip finder's priced flight survives the hand-over into the
// planner. The card prices the flight it found: Google Flights' fare for
// the exact days, a live one the traveller took in the picker, or the
// swept day nearest each trip day (the leg keeps its own date). planOf
// hands every one of those over (plan.flights), and quoteTrip prices a
// held leg for its direction before looking the day up again, so the
// planner's total is the card's and Review never says "Add your fare" for
// a trip the finder priced with a flight (row T802-c). After Finish the
// planned trip holds the same legs as its flightPicks.
// Run: npm test (continent-app/). The finder cases skip without public/.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { findTrips } from "../src/lib/recommend/rank.js";
import { slotTotals } from "../src/lib/recommend/slots.js";
import { chooseFlight, optionsFor } from "../src/lib/recommend/adapters/flight.js";
import { quoteTrip, PLANNER_BAG } from "../src/lib/tripTotal.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { withPlan, planState } from "../src/planner/finder/handoff.js";
import { planOf } from "../src/planner/finder/planOf.js";
import { withSlot } from "../src/planner/finder/finderText.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const read = (p) => (existsSync(pub(p)) ? JSON.parse(readFileSync(pub(p), "utf8")) : null);
const data = read("app_data.json");
const skip = data ? false : "public/app_data.json is not on this machine";
const countryInsights = read("country_insights.json")?.countries || null;
const layerIndexes = data ? {
  trails: read("trails/index.json"), beaches: read("beaches/index.json"), lakes: read("lakes/index.json"),
  mountains: read("mountains/index.json"), cycling: read("cycling/index.json"),
} : {};

function sweep(minutesAgo = 30) {
  const f = fixture("tf1-flights-BRU.json");
  const at = Math.floor(Date.now() / 60000) - minutesAgo;
  for (const side of [f.to, f.back]) {
    for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  }
  f.checked = at;
  return f;
}
const flights = data ? sweep() : null;
const BRU = { iata: "BRU", lat: 50.85, lon: 4.35, name: "Brussels" };
const appData = data ? { ...data, flights, meta: { ...data.meta, selected_origin: "BRU" } } : null;

const answers = (start, end) => normalizeSettings({
  answered: ["who", "when"], party: { kind: "couple", adults: 2 }, priority: "balance",
  when: { mode: "exact", start, end, nights: 7 },
  guide: { shapes: ["towns"], likes: ["hiking", "food"], weather: "mild", reach: "short", avoid: ["crowds"], budget: { kind: "total", eur: 1200 } },
});
const trips = (s) => findTrips({ data, countryInsights, layerIndexes, settings: s, origin: BRU, flights, today: "2026-10-28" });

function wizardHandOver(plan) {
  const stops = plan.order.map((id) => ({ destinationId: id, nights: plan.nights[id], activities: [] }));
  return {
    startDate: plan.startDate, groupSize: plan.party.adults, children: plan.party.children, babies: plan.party.babies,
    stayTier: "home", transport: "auto", pace: "balanced", baggage: PLANNER_BAG,
    anchorId: null, anchorOrigin: null, returnAnchorId: null,
    ownFlight: { airline: "", mode: "fly", costTotal: 0, costOut: 0, costBack: 0, outDate: plan.startDate, retDate: plan.endDate },
    carHome: null, legModes: {}, ownLegs: {}, ownStays: {}, label: plan.country, stops,
  };
}

/** The wizard's Review quote for a seeded trip, and its request. */
function review(trip, planEdit = (p) => p) {
  const plan = planEdit(planOf(trip));
  const state = planState(withPlan(wizardHandOver(plan), plan), plan);
  return { plan, state, q: quoteTrip(state, { data: appData, countryInsights }) };
}

/** What Finish hands the planned trip each way (GuidedTripWizard pricedFlight). */
function pricedFlight(q, dir) {
  const leg = q.cartaFlight?.[dir];
  const qq = q.cartaFlight?.queries?.[dir === "out" ? 0 : 1];
  if (!leg || !qq || !Number.isFinite(leg.price)) return null;
  const { cost, ...flight } = leg;
  const own = flight.flightDate || flight.date;
  return { ...flight, date: qq.date, ...(own && own !== qq.date ? { flightDate: own } : {}), from: qq.o, to: qq.d };
}

/** The planned trip after Finish: the same request, no finder plan, the picks it carries. */
function plannedTrip(state, q) {
  const { handedFlights, liveFlights, ...rest } = state;
  return quoteTrip({ ...rest, flightPicks: { out: pricedFlight(q, "out"), back: pricedFlight(q, "back") } }, { data: appData, countryInsights });
}

const near = (a, b) => Math.abs(a - b) <= 0.01;

test("T855: a fare on the nearest swept day reaches Review and the planned trip, card total to the cent", { skip }, () => {
  // 5 to 12 December: the sweep has no fare for the exact days of most trips.
  const top = trips(answers("2026-12-05", "2026-12-12")).slice(0, 10);
  let nearest = 0;
  for (const t of top) {
    const facts = t.slots.find((s) => s.id === "flight")?.pick?.facts;
    if (facts?.source !== "swept") continue;
    const { plan, state, q } = review(t);
    assert.ok(plan.flights?.out && plan.flights?.back, `${t.id}: both legs handed over`);
    assert.ok(q.cartaFlight?.out?.cost && q.cartaFlight?.back?.cost, `${t.id}: Review prices both ways (no Add your fare)`);
    assert.ok(near(q.perPerson, t.total.perPerson), `${t.id}: Review ${q.perPerson} against the card's ${t.total.perPerson}`);
    if (facts.out.date !== t.dates.out || facts.back.date !== t.dates.back) {
      nearest += 1;
      assert.equal(q.cartaFlight.out.date, facts.out.date, `${t.id}: the out leg keeps its own day`);
      assert.equal(q.cartaFlight.back.date, facts.back.date, `${t.id}: the home leg keeps its own day`);
    }
    const after = plannedTrip(state, q);
    assert.ok(after.cartaFlight?.out?.cost && after.cartaFlight?.back?.cost, `${t.id}: the trip page prices both ways`);
    assert.ok(near(after.perPerson, t.total.perPerson), `${t.id}: trip page ${after.perPerson} against the card's ${t.total.perPerson}`);
  }
  assert.ok(nearest >= 2, `${nearest} trips priced on a nearest day`);
});

test("T855: a live fare taken in the picker reaches Review and the planned trip", { skip }, async () => {
  const t0 = trips(answers("2026-11-21", "2026-11-28")).find((t) => t.gateway?.iata === "LJU" && t.slots[0].eur != null);
  assert.ok(t0, "the Slovenia trip");
  const live = fixture("tf1-live-BRU-LJU.json");
  const opts = await optionsFor(t0, { fetchDay: async () => live });
  const t = withSlot(t0, chooseFlight(t0, opts.out.groups.quickest[0]), slotTotals);
  const { plan, state, q } = review(t);
  assert.equal(plan.flights.out.source, "live");
  assert.equal(q.cartaFlight.out.source, "live");
  assert.equal(q.cartaFlight.out.price, opts.out.groups.quickest[0].facts.price);
  assert.ok(near(q.perPerson, t.total.perPerson), `Review ${q.perPerson} against the card's ${t.total.perPerson}`);
  assert.ok(near(plannedTrip(state, q).perPerson, t.total.perPerson), "the trip page holds it");
});

test("T855: a trip the finder priced with no fare hands no flight and changes nothing", { skip }, () => {
  const t = trips(answers("2027-01-09", "2027-01-16")).find((x) => !x.slots.find((s) => s.id === "flight")?.pick?.facts?.out);
  assert.ok(t, "a trip with no flight fare");
  const { plan, q } = review(t);
  assert.equal(plan.flights, null);
  assert.ok(near(q.perPerson, t.total.perPerson), `Review ${q.perPerson} against the card's ${t.total.perPerson}`);
});

test("T855: a held leg holds only its own day and home; a pick beats the finder's leg; its airport wins", { skip }, () => {
  const t = trips(answers("2026-11-21", "2026-11-28")).find((x) => x.slots.find((s) => s.id === "flight")?.pick?.facts?.source === "swept");
  const base = review(t);
  const out = base.plan.flights.out;
  // The trip's dates moved: the finder's leg no longer stands for that day.
  const moved = review(t, (p) => ({ ...p, flights: { out: { ...out, date: "2026-11-20", price: 1 }, back: p.flights.back } }));
  assert.notEqual(moved.q.cartaFlight.out?.price, 1, "the day is looked up again");
  // Another home airport: not held.
  const other = review(t, (p) => ({ ...p, flights: { out: { ...out, from: "CRL", price: 1 }, back: p.flights.back } }));
  assert.notEqual(other.q.cartaFlight.out?.price, 1);
  // The finder flew to another airport than the routed anchor: the planner flies there too.
  const gw = review(t, (p) => ({ ...p, flights: { out: { ...out, to: "TSF", price: 7 }, back: p.flights.back } }));
  assert.equal(gw.q.cartaFlight.inAirport, "TSF");
  assert.equal(gw.q.cartaFlight.queries[0].d, "TSF");
  assert.equal(gw.q.cartaFlight.out.price, 7);
  // A pick made on Getting there beats the finder's leg.
  const pick = { ...out, price: 3, airline: "XX", dep: "12:00", arr: "14:00", source: "live" };
  delete pick.flightDate;
  const picked = quoteTrip({ ...base.state, flightPicks: { out: pick, back: null } }, { data: appData, countryInsights });
  assert.equal(picked.cartaFlight.out.price, 3);
  assert.equal(picked.cartaFlight.back.price, base.q.cartaFlight.back.price, "the other way keeps the finder's");
  // A pick outside the flight preferences falls back to the lookup.
  const late = quoteTrip({ ...base.state, flightPicks: { out: pick, back: null }, flightPrefs: { direct: false, after: 15, before: 24 } }, { data: appData, countryInsights });
  assert.notEqual(late.cartaFlight.out?.price, 3);
});

test("T855: planOf hands the card's legs in the planner's pick shape; a typed fare or a drive hands none", () => {
  const leg = (date, from, to, price) => ({ date, from, to, price, airline: "SN", flightNo: "SN1", dep: "07:00", arr: "09:00", stops: 0, minutes: 120, checked: 1761700000000, source: "swept" });
  const trip = (source, out, back) => ({
    id: "tf_x", iso2: "SI", country: "Slovenia", places: [{ id: "a", nights: 7 }],
    dates: { out: "2026-12-05", back: "2026-12-12" }, party: { adults: 2 },
    slots: [{ id: "flight", owner: "carta", eur: 100, pick: { id: source, facts: { source, out, back, link: "https://example.test/f" } } }],
  });
  const p = planOf(trip("swept", leg("2026-12-09", "BRU", "LJU", 60), leg("2026-12-12", "LJU", "BRU", 70)));
  assert.deepEqual(p.flights.out, {
    from: "BRU", to: "LJU", date: "2026-12-05", flightDate: "2026-12-09", price: 60, airline: "SN", flightNo: "SN1",
    dep: "07:00", arr: "09:00", stops: 0, min: 120, via: null, checked: 1761700000000, source: "swept", link: "https://example.test/f",
  });
  assert.equal(p.flights.back.date, "2026-12-12");
  assert.equal("flightDate" in p.flights.back, false, "an exact day has no own day");
  assert.deepEqual(p.liveFlights, [], "a swept leg is not a live answer");
  assert.equal(planOf(trip("yours", leg("2026-12-05", "BRU", "LJU", 60), null)).flights, null);
  assert.equal(planOf(trip("drive", null, null)).flights, null);
  assert.deepEqual(JSON.parse(JSON.stringify(p.flights)), p.flights, "the plan survives JSON (plannerStore)");
});
