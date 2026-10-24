// T432: one price for the whole trip planner. The wizard's running estimate
// and the planned trip both price through lib/tripTotal.js quoteTrip(); the
// wizard prices the very state it hands over (wizardPlannerState), so the
// figure on the last step is the figure the planned trip opens on. These
// tests walk a matrix of budget shapes through it and check the rules that
// used to break: an own figure replaces its estimate and never adds to it, a
// train trip takes no airport transfer, an own car typed one way keeps
// Carta's figure for the other, and the receipt lines sum to the total.
// Run: npm test (continent-app/). Uses public/app_data.json; skips without it.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  quoteTrip, tripLines, tripReadiness, wizardPlannerState, paidEur, MAX_PARTY,
} from "../src/lib/tripTotal.js";
import { DEFAULT_LIFESTYLE } from "../src/lib/runtime_pricing.js";

const DATA = new URL("../public/app_data.json", import.meta.url);
const have = existsSync(DATA);
const data = have ? JSON.parse(readFileSync(DATA, "utf8")) : null;
const skip = have ? false : "public/app_data.json is not on this machine";

const byCity = (name, iso2) => {
  const hit = Object.values(data.destinations).find((d) => d.city === name && (!iso2 || d.iso2 === iso2));
  assert.ok(hit, `${name} is in the catalogue`);
  return hit.id;
};

const BACKPACKER = {
  cadence: "week", dinners_per_week: 1, lunches_per_week: 3, fastfood_per_week: 4, drinks_per_week: 4,
  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 5,
};
const FOODIE = {
  cadence: "week", dinners_per_week: 7, lunches_per_week: 5, fastfood_per_week: 0, drinks_per_week: 5,
  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 0,
};

/** A wizard hand-over, the shape GuidedTripWizard's handOver memo builds. */
function handOver(ids, { party = 2, children = 0, babies = 0, mode = "fly", out = 0, back = 0, transport = "auto", ownLegs = {}, ownStays = {}, nights = 3 } = {}) {
  return {
    startDate: "2027-05-10",
    groupSize: party,
    children,
    babies,
    transport,
    pace: "balanced",
    baggage: "cabin",
    anchorId: null,
    anchorOrigin: null,
    returnAnchorId: null,
    ownFlight: { airline: "", mode, costTotal: out + back, costOut: out, costBack: back, outDate: "2027-05-10", retDate: null },
    carHome: transport === "owncar" ? { name: "Ghent", lat: 51.05, lon: 3.72 } : null,
    legModes: {},
    ownLegs,
    ownStays,
    label: "Test",
    stops: ids.map((id) => ({ destinationId: id, nights, activities: [] })),
  };
}

const price = (h, opts = {}) => quoteTrip(
  wizardPlannerState(h, { stayTier: opts.stayTier || "home", lifestyle: opts.lifestyle || DEFAULT_LIFESTYLE }),
  { data, countryInsights: null },
);

const sum = (lines) => Math.round(lines.filter((l) => l.kind !== "missing").reduce((s, l) => s + l.eur, 0) * 100) / 100;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} vs ${b}`);

test("the receipt lines always add up to the total, across the budget matrix", { skip }, () => {
  const trip = [byCity("Berat", "AL"), byCity("Gjirokastër", "AL")];
  for (const party of [1, 2, 4, 6]) {
    for (const lifestyle of [BACKPACKER, DEFAULT_LIFESTYLE, FOODIE]) {
      for (const stayTier of ["dorm", "home", "hotel3"]) {
        for (const [mode, transport] of [["fly", "auto"], ["train", "auto"], ["car", "owncar"]]) {
          const p = price(handOver(trip, { party, mode, transport }), { lifestyle, stayTier });
          close(sum(tripLines(p)), p.grandTotal, `party ${party}, ${stayTier}, ${mode}`);
          assert.ok(Math.abs(p.perPerson * party - p.grandTotal) <= party * 0.005 + 0.001, "the figure a person, to the cent, times the party");
        }
      }
    }
  }
});

test("the wizard's state is the planner's state: every field loadFromWizard sets", { skip }, () => {
  const h = handOver([byCity("Berat", "AL")], { party: 3, out: 120, ownStays: { x: 50 } });
  const st = wizardPlannerState(h, { stayTier: "private", lifestyle: FOODIE });
  for (const key of ["tripStart", "tripEnd", "stops", "groupSize", "transportPref", "pace", "baggage", "anchorId",
    "anchorOrigin", "returnAnchorId", "ownFlight", "carHome", "legModes", "ownLegs", "ownStays", "transferMode",
    "stayTier", "lifestyle"]) {
    assert.ok(key in st, `${key} is handed over`);
  }
  assert.equal(st.tripEnd, "2027-05-13");
  assert.deepEqual(st.transferMode, { in: "auto", out: "auto" });
});

test("a fare the traveller typed is in the total once, as theirs", { skip }, () => {
  const trip = [byCity("Berat", "AL"), byCity("Gjirokastër", "AL")];
  const none = price(handOver(trip));
  const typed = price(handOver(trip, { out: 180, back: 160 }));
  close(typed.grandTotal - none.grandTotal, 340, "the fare adds exactly what was typed");
  assert.equal(tripLines(typed).find((l) => l.key === "out").kind, "yours");
  assert.equal(tripLines(typed).find((l) => l.key === "back").kind, "yours");
  assert.equal(tripLines(none).find((l) => l.key === "out").kind, "missing");
  const oneWay = price(handOver(trip, { out: 180 }));
  assert.equal(tripLines(oneWay).find((l) => l.key === "out").kind, "yours");
  assert.equal(tripLines(oneWay).find((l) => l.key === "back").kind, "missing", "the way home stays open, never covered by the way out");
});

test("an own price for a leg replaces Carta's estimate, never adds to it", { skip }, () => {
  const trip = [byCity("Berat", "AL"), byCity("Gjirokastër", "AL")];
  const est = price(handOver(trip));
  const leg = est.legs[0];
  assert.ok(leg && leg.ground_total > 0, "Carta prices the hop");
  const own = price(handOver(trip, { ownLegs: { 0: { mode: leg.mode, eur: 25 } } }));
  close(own.parts.between, 25, "the hop is the typed figure");
  close(own.grandTotal - est.grandTotal, 25 - leg.ground_total, "the total moves by the difference");
  assert.equal(own.legs[0].own, true);
});

test("an own price for a bed replaces the bed estimate and keeps the days", { skip }, () => {
  const berat = byCity("Berat", "AL");
  const trip = [berat, byCity("Gjirokastër", "AL")];
  const est = price(handOver(trip));
  const own = price(handOver(trip, { ownStays: { [berat]: 99 } }));
  close(own.stayCosts[0].accomTotal, 99, "the bed is the typed figure");
  close(own.stayCosts[0].groundTotal, est.stayCosts[0].groundTotal, "the days stay Carta's");
  close(own.grandTotal - est.grandTotal, 99 - est.stayCosts[0].accomTotal, "the total moves by the difference");
  assert.equal(tripReadiness(own).yours, 1);
});

test("a train or a bus there takes no airport transfer", { skip }, () => {
  const trip = [byCity("Berat", "AL"), byCity("Gjirokastër", "AL")];
  for (const mode of ["train", "bus", "ferry"]) {
    const p = price(handOver(trip, { mode, out: 60, back: 60 }));
    assert.equal(p.flightTransfer, null, `${mode}: no runway transfer`);
    assert.equal(p.anchorLegs.in, null, `${mode}: no airport hop to the first stop`);
  }
});

test("an own car typed one way keeps Carta's drive estimate for the other", { skip }, () => {
  const trip = [byCity("Berat", "AL"), byCity("Gjirokastër", "AL")];
  const est = price(handOver(trip, { mode: "car", transport: "owncar" }));
  assert.ok(est.driveLegs?.out && est.driveLegs?.home, "Carta prices both drives");
  const half = price(handOver(trip, { mode: "car", transport: "owncar", out: 150 }));
  close(half.parts.travel, 150, "the typed way out");
  close(half.parts.drive, est.driveLegs.home.ground_total, "the way home stays Carta's");
  const both = price(handOver(trip, { mode: "car", transport: "owncar", out: 150, back: 140 }));
  close(both.parts.drive, 0, "nothing of Carta's when both are typed");
});

test("the party and the Lifestyle move the figures they price, and only those", { skip }, () => {
  const trip = [byCity("Berat", "AL"), byCity("Gjirokastër", "AL")];
  const two = price(handOver(trip, { party: 2, out: 200 }));
  const four = price(handOver(trip, { party: 4, out: 200 }));
  assert.ok(four.parts.beds > two.parts.beds, "more people, more beds");
  assert.ok(four.parts.days > two.parts.days, "more people, more meals");
  close(four.parts.travel, two.parts.travel, "a typed fare is the party's and does not scale");
  const lean = price(handOver(trip), { lifestyle: BACKPACKER });
  const rich = price(handOver(trip), { lifestyle: FOODIE });
  assert.ok(rich.parts.days > lean.parts.days, "eating out costs more than cooking");
  close(rich.parts.beds, lean.parts.beds, "habits do not move the beds");
  const dorm = price(handOver(trip), { stayTier: "dorm" });
  const hotel = price(handOver(trip), { stayTier: "hotel3" });
  close(dorm.parts.days, hotel.parts.days, "the bed does not move the meals");
});

test("the party is capped where the planner caps it", { skip }, () => {
  const p = price(handOver([byCity("Berat", "AL")], { party: 40 }));
  assert.equal(p.groupSize, MAX_PARTY);
});

test("children count half on beds, meals and public fares; babies travel free", { skip }, () => {
  const trip = [byCity("Berat", "AL"), byCity("Gjirokastër", "AL")];
  const two = price(handOver(trip, { party: 2 }));
  const fourAdults = price(handOver(trip, { party: 4 }));
  const family = price(handOver(trip, { party: 2, children: 2 }));
  const withBaby = price(handOver(trip, { party: 2, babies: 1 }));
  // Children are priced for the beds and legs of four people, at the weight 3 / 4.
  close(family.parts.beds, Math.round(fourAdults.parts.beds * 0.75 * 100) / 100, "beds at three quarters of four adults");
  close(family.parts.days, Math.round(fourAdults.parts.days * 0.75 * 100) / 100, "meals at three quarters of four adults");
  assert.ok(family.grandTotal < fourAdults.grandTotal && family.grandTotal > two.grandTotal, "between two and four adults");
  close(withBaby.grandTotal, two.grandTotal, "a baby adds nothing");
  assert.equal(family.party.children, 2);
  assert.equal(withBaby.party.seats, 3, "a baby still needs a seat in a car");
  close(sum(tripLines(family)), family.grandTotal, "the lines still add up");
});

test("money typed with a comma or as text reads as euros, blanks as nothing", () => {
  assert.equal(paidEur("120,50"), 120.5);
  assert.equal(paidEur("80"), 80);
  assert.equal(paidEur(""), 0);
  assert.equal(paidEur("abc"), 0);
  assert.equal(paidEur(-5), 0);
});
