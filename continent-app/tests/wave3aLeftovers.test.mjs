// Logic wave 3a, leftovers of waves 1 to 3 (W1-L2, W1-L3, W2-L1, W3-L1, W3-L2).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { withFlags } from "../src/lib/flags.js";
import { verdictOf } from "../src/lib/budgetSearch.js";
import { homeFits } from "../src/lib/homeDemo.js";
import { readFileSync } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import { priceDay } from "../src/lib/price/index.js";
import { isMeasured } from "../src/lib/stayPrice.js";
import { costContext, costRow } from "../src/lib/costIndex.js";
import { takeBlocked, backKey, BLOCKED_PASS_KEY } from "../src/lib/passMoments.js";
import { scopeOf } from "../src/lib/stateKeys.js";
import { partsAfter } from "../src/lib/partyParts.js";
import { partyOf } from "../src/lib/party.js";

const NEW = (fn) => withFlags({ E1: "new" }, fn);
const OLD = (fn) => withFlags({ E1: "old" }, fn);

test("W1-L2: a budget search row that left a bed or a food line out is neither fits nor over", () => {
  const partial = { core: 900, buffer: 90, total: 990, complete: false };
  assert.equal(NEW(() => verdictOf(partial, 1200)).group, "partial");
  // Flag off: the shipped answer, completeness never looked at.
  assert.equal(OLD(() => verdictOf(partial, 1200)).group, "fits");
  // A complete row, and a row that does not say, are unchanged.
  assert.equal(NEW(() => verdictOf({ ...partial, complete: true }, 1200)).group, "fits");
  assert.equal(NEW(() => verdictOf({ core: 900, buffer: 90, total: 990 }, 1200)).group, "fits");
  // Over stays over even when partial: a missing part cannot make it cheaper.
  assert.equal(NEW(() => verdictOf(partial, 500)).group, "over");
});

test("W1-L3: Home Try it counts a place as fitting through gaps.js, so a place without its bed does not", () => {
  const whole = { day: 80, complete: true };
  const noBed = { day: 40, complete: false };
  assert.equal(NEW(() => homeFits(whole, 100)), true);
  assert.equal(NEW(() => homeFits(whole, 60)), false);
  assert.equal(NEW(() => homeFits(noBed, 100)), false);
  assert.equal(OLD(() => homeFits(noBed, 100)), true);
  assert.equal(NEW(() => homeFits({ day: 100 }, 100)), true);
});

const FX = JSON.parse(readFileSync(new URL("./fixtures/price/destinations.json", import.meta.url), "utf8"));
setStayRecords(FX.stays);
const bedOf = (row) => row.lines.find((l) => l.key === "bed");

test("W3-L2: a bed is measured only when the town's own block says so; the day answer finds its lines by key", () => {
  const id = "LIS";
  const base = FX.destinations[id];
  const dest = (q) => ({ ...base, accommodation: { ...base.accommodation, q } });
  const measured = dest("measured");
  assert.equal(isMeasured(measured.accommodation), true);
  const row = priceDay(measured);
  assert.ok(row.stayEur != null, `${id} prices`);
  assert.equal(bedOf(row).quality, "measured");
  assert.equal(row.stayEur, bedOf(row).eur);
  assert.equal(row.foodEur, row.lines.find((l) => l.key === "food").eur);
  // A block that is not the town's (nearby) is modelled, never measured.
  const nearby = priceDay(dest("nearby"));
  assert.equal(bedOf(nearby).quality, "modelled");
});

test("W1-L1: the way back from Stripe names what was blocked, once, and the key is classified", () => {
  const mem = new Map([[BLOCKED_PASS_KEY, "export"]]);
  const storage = { getItem: (k) => mem.get(k) ?? null, removeItem: (k) => mem.delete(k) };
  assert.equal(takeBlocked(storage), "export");
  assert.equal(takeBlocked(storage), "", "read once, then gone");
  assert.equal(takeBlocked({ getItem() { throw new Error("blocked"); } }), "");
  assert.equal(backKey("exportCal"), "pass.backExport");
  assert.equal(backKey("browse"), "pass.backAny");
  assert.equal(backKey(""), "pass.backAny");
  assert.ok(scopeOf(BLOCKED_PASS_KEY, "storage"), "listed in lib/stateKeys.js");
  // The provider shows it only behind E10 and only for a ?pass=ok return that landed a paid tier.
  const hook = readFileSync(new URL("../src/hooks/usePaywall.jsx", import.meta.url), "utf8");
  assert.match(hook, /!E10 \|\| welcomed\.current \|\| passReturn\(\) !== 'ok'/);
  assert.match(hook, /isPaidTier\(entitlement\.tier\)/);
});

test("W3-L1: the teens stepper keeps teens inside the adult seats and a family a family", () => {
  const now = { adults: 2, teens: 0, children: 1, babies: 0 };
  // One more teen: three adult seats, one of them a teen.
  assert.deepEqual(partsAfter(now, "teens", 1, true), { adults: 3, children: 1, babies: 0, teens: 1 });
  // One more adult with a teen present: the teen stays counted.
  assert.deepEqual(partsAfter({ ...now, teens: 1 }, "adults", 3, true), { adults: 4, children: 1, babies: 0, teens: 1 });
  // E2 old: no teens row and none sent, the shipped behaviour.
  assert.deepEqual(partsAfter(now, "adults", 3, false), { adults: 3, children: 1, babies: 0 });
  // The party read back: a teen is an adult for the price, and makes two adults and a teen a family.
  const p = partyOf({ group_size: 3, children: 0, babies: 0, teens: 1 });
  assert.equal(p.adults, 3);
  assert.equal(p.teens, 1);
  assert.equal(p.kind, "family");
  assert.notEqual(partyOf({ group_size: 3, children: 0, babies: 0 }).kind, "family");
});

test("W3-L1: the Style Studio's party editor takes the teens row only behind E2", () => {
  const editor = readFileSync(new URL("../src/planner/PartyEditor.jsx", import.meta.url), "utf8");
  const steps = readFileSync(new URL("../src/browse/styles/StyleSteps.jsx", import.meta.url), "utf8");
  assert.match(editor, /withTeens \? \[\{ key: 'teens'/);
  assert.match(steps, /withTeens=\{isOn\('E2'\)\}/);
});

test("W3-L2: a bed read from a nearby block is not the town's own, even when the place's block is measured", () => {
  const dests = FX.destinations;
  const ctx = costContext(dests, {});
  const base = ctx.atById?.get("LIS");
  assert.ok(base?.bed, "the fixture's LIS has a priced bed");
  assert.equal(isMeasured(dests.LIS.accommodation), true);
  assert.equal(costRow(dests.LIS, ctx).stayMeasured, true, "the town's own measured bed is measured");
  // The same place, but the tier's rate came from a nearby block: the block is measured, the rate is not the town's.
  const nearby = { ...ctx, atById: new Map([["LIS", { ...base, bed: { ...base.bed, q: "nearby" } }]]) };
  assert.equal(costRow(dests.LIS, nearby).stayMeasured, false);
});

test("W1-L1: the way back offers the blocked action again, once: a registered resume runs from the primary button", () => {
  const hook = readFileSync(new URL("../src/hooks/usePaywall.jsx", import.meta.url), "utf8");
  const back = readFileSync(new URL("../src/components/PassBack.jsx", import.meta.url), "utf8");
  // The provider hands PassBack the registered action for the kept reason, and closes the sheet before running it.
  assert.match(hook, /const again = back && resumers\.current\.get\(back\.reason\)/);
  assert.match(hook, /onAgain=\{again \? \(\) => \{ setBack\(null\); again\(\); \} : null\}/);
  assert.match(hook, /export function useResume\(reason, fn\)/);
  // PassBack: with an action the primary runs it (pass.backAgain) and Done is the quiet one; without, Done is primary.
  assert.match(back, /onAgain && <Button[^>]*variant="primary"[^>]*onClick=\{onAgain\}>\{t\('pass\.backAgain'\)\}/);
  assert.match(back, /variant=\{onAgain \? 'ghost' : 'primary'\}/);
  // The surfaces whose button was blocked register themselves.
  for (const f of ["browse/DestinationPage.jsx", "planner/days/useDayExports.js"]) {
    assert.match(readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8"), /useResume\('export'/, f);
  }
});
