// PT-E3 (ROADMAP G4, D10, logic audit E3): one stay ladder. Tier fallback and occupancy are in
// config (stay.fallback_order, stay.room_occupancy, stay.dorm_child_weight); one function picks the
// tier down the ladder and names it. Written first as `todo` in wave 0b; wave 3 made them real.
// The changed answers sit behind flag E3 (default old), so each is checked with E3 forced new and the
// moved numbers are pinned here (the new path's golden numbers, explained in .work/.../changes.md).
// Run: node --test tests/stayLadder.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { withFlags } from "../src/lib/flags.js";
import { bedPrice, isMeasured } from "../src/lib/stayPrice.js";
import { pickTier, roomsFor, dormBeds } from "../src/lib/price/ladder.js";
import { rule } from "../src/lib/price/config.js";
import { TOWNS } from "../scripts/eval/lib/stay-engine.mjs";

const NEW = (fn) => withFlags({ E3: "new" }, fn);
const OLD = (fn) => withFlags({ E3: "old" }, fn);
const bed = (town, tier, adults, children = 0, nights = 3) => bedPrice({ dest: TOWNS[town], tier, adults, children, nights });

test("E3: a solo dorm request at a town with no hostel prices a private room or a 2-star or 3-star room, never the dearest entire place", () => {
  const r = NEW(() => bed("VCE", "dorm", 1));
  assert.equal(r.tier, "hotel3");
  assert.equal(r.fallback, true);
  assert.equal(r.total, 252, "3 nights at 84");
  assert.equal(OLD(() => bed("VCE", "dorm", 1)).tier, "home", "flag old keeps today's answer");
  assert.equal(NEW(() => bed("JTR", "dorm", 1)).tier, "hotel2");
  assert.equal(NEW(() => bed("MAD", "dorm", 1)).fallback, false);
});

test("E3: 2 adults + 1 child book one room, not two; 2 + 3 books two; 3 adults two", () => {
  assert.equal(NEW(() => bed("MAD", "hotel3", 2, 1)).units, 1);
  assert.equal(NEW(() => bed("MAD", "hotel3", 2, 2)).total, 288);
  assert.equal(NEW(() => bed("MAD", "hotel3", 2, 3)).units, 2);
  assert.equal(NEW(() => bed("MAD", "hotel3", 3)).units, 2);
  assert.equal(OLD(() => bed("MAD", "hotel3", 2, 1)).units, 2, "flag old keeps ceil(people / 2)");
});

test("E3: children get one bed each in a dorm", () => {
  const r = NEW(() => bed("MAD", "dorm", 2, 2));
  assert.equal(r.units, 4);
  assert.equal(r.total, 300);
  assert.equal(OLD(() => bed("MAD", "dorm", 2, 2)).units, 3);
});

test("E3: cleaning grows with the number of units", () => {
  const couple = NEW(() => bed("MAD", "home", 2));
  const eight = NEW(() => bed("MAD", "home", 4, 4));
  assert.ok(eight.cleaning > couple.cleaning);
  assert.equal(eight.cleaning, couple.cleaning * eight.units);
  assert.equal(OLD(() => bed("MAD", "home", 4, 4)).cleaning, couple.cleaning, "flag old charged it once");
});

test("E3: the entire place stands last on a cheap ladder and a dear request never reaches it before a hotel", () => {
  const order = rule("stay.fallback_order");
  for (const [want, ladder] of Object.entries(order)) {
    assert.equal(ladder[0], want, `${want} is its own first step`);
    if (want !== "home" && ladder.includes("home")) assert.equal(ladder[ladder.length - 1], "home", `${want}: the entire place is last`);
  }
  assert.equal(NEW(() => bed("CRL", "hotel5", 2)).tier, "hotel4");
  assert.deepEqual(pickTier("dorm", ["hotel3", "home"]), { tier: "hotel3", fallback: true, step: 3 });
  assert.deepEqual(pickTier("dorm", ["home"]), { tier: "home", fallback: true, step: 4 });
  assert.equal(pickTier("dorm", []), null);
  assert.equal(NEW(() => bed("GOT", "home", 2, 2)).tier, "hotel3", "no Airbnb: the 3-star, not a dorm");
});

test("E3: occupancy and the dorm weight come from config", () => {
  const occ = rule("stay.room_occupancy");
  assert.equal(roomsFor(occ.adults, occ.children), 1);
  assert.equal(roomsFor(occ.adults, occ.children + 1), 2);
  assert.equal(roomsFor(occ.adults + 1, 0), 2);
  assert.equal(dormBeds(2, 2), 2 + 2 * rule("stay.dorm_child_weight"));
});

test("REQ-data-2: a bed is measured only when the pipeline's is_measured says so (q measured, beds, captured)", () => {
  assert.equal(bed("MAD", "hotel3", 2).measured, true);
  assert.equal(bed("WARM", "hotel3", 2).measured, false, "legacy block: captured is null");
  assert.equal(bed("COLD", "hotel3", 2).measured, false, "modelled block");
  assert.equal(isMeasured({ q: "measured", beds: {}, captured: "2026-10-23" }), false);
  assert.equal(isMeasured(null), false);
});

test("REQ-data-2: the day price's bed quality uses the one measured rule", async () => {
  const { priceDay } = await import("../src/lib/price/priceDay.js");
  const { DEFAULT_PRICE_REQUEST } = await import("../src/lib/price/request.js");
  const quality = (id, captured, q) => {
    const dest = { ...TOWNS[id], accommodation: { ...TOWNS[id].accommodation, ...(q ? { q } : {}), captured } };
    const day = priceDay(dest, { ...DEFAULT_PRICE_REQUEST, stay: "hotel3" }, { [dest.id]: dest });
    const bed = day.lines.find((line) => line.key === "bed");
    return { quality: bed.quality, modelled: !!bed.modelled };
  };
  assert.deepEqual(quality("MAD", "2026-10-23"), { quality: "measured", modelled: false });
  assert.deepEqual(quality("MAD", null), { quality: "modelled", modelled: true }, "a legacy undated block");
  assert.deepEqual(quality("MAD", undefined), { quality: "modelled", modelled: true }, "a missing capture date is undated");
  assert.deepEqual(quality("MAD", "2026-10-23", "modelled"), { quality: "modelled", modelled: true }, "a modelled block with a date is still not measured");
});
