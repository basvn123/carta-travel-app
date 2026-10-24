// T662 (F2): invariant V2 of plan "Carta prijslogica Explore": no price is
// worked out outside the engine (lib/price/). The scan finds every call of a
// price kernel function in src/ and scripts/ (comments stripped) and fails on
// a file that is not in ALLOWED. ALLOWED says which phase removes each entry;
// F6 empties the list down to the kernel itself.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// T678: fileURLToPath decodes the URL, so a path with a space ("Travel App")
// is scanned too; a vacuous scan fails below rather than passing.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KERNEL = ["computeCosts", "costRow", "costContext", "bedPrice", "groundSpendPerPerson", "priceTrip",
  "composeTrip", "stayPerNight", "foodPerDay", "priceFromIndex"];
const CALL = new RegExp(`(?<![\\w.]function\\s|function\\s)\\b(${KERNEL.join("|")})\\s*\\(`, "g");

// The kernel: where the functions are defined, and what the engine wraps.
const KERNEL_FILES = {
  "src/lib/costIndex.js": "kernel (computeCosts, costRow)",
  "src/lib/stayPrice.js": "kernel (bedPrice)",
  "src/lib/runtime_pricing.js": "kernel (groundSpendPerPerson; composeTrip moves to quoteTrip in F6)",
  "src/lib/price/priceDay.js": "the engine",
};

// Paths that still price on their own, and the phase that moves them.
export const ALLOWED = {
  ...KERNEL_FILES,
  "scripts/prerender/pages.mjs": "F6 (the prerendered trip page, groundSpendPerPerson)",
  // F6: trip prices (quoteTrip).
  "src/browse/DestPriceCard.jsx": "F6 (calculator total through priceFromIndex)",
  "src/browse/ask/AskTripCard.jsx": "F6 (Ask trip card)",
  "src/hooks/useDestinationSearch.js": "F6 (composed trips in Places)",
  "src/hooks/useTripPlanner.js": "F6 (trip planner)",
  "src/lib/budgetSearch.js": "F6 (Ask budget)",
  "src/lib/countryBrief.js": "F6 (country brief)",
  "src/lib/firstRun.js": "F6 (first-run receipt)",
  "src/lib/myTrips.js": "F6 (saved trips)",
  "src/lib/trip_planner_pricing.js": "F6 (trip planner)",
  "src/planner/GuidedTripWizard.jsx": "F6 (wizard)",
  "src/planner/DayPlannerTab.jsx": "F6 (priceTrip, the trip around a day)",
};

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(f)) out.push(p);
  }
  return out;
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

export function pricingFiles() {
  const out = new Map();
  for (const dir of ["src", "scripts", "functions"]) {
    let files = [];
    try { files = walk(join(ROOT, dir)); } catch { continue; }
    for (const p of files) {
      const rel = relative(ROOT, p).replace(/\\/g, "/");
      const hits = [...strip(readFileSync(p, "utf8")).matchAll(CALL)].map((m) => m[1]);
      if (hits.length) out.set(rel, [...new Set(hits)]);
    }
  }
  return out;
}

test("V2: no price is worked out outside the engine, except the listed paths", () => {
  const found = pricingFiles();
  assert.ok(found.has("src/lib/costIndex.js"), `the scan found the kernel (root ${ROOT})`);
  const extra = [...found.keys()].filter((f) => !(f in ALLOWED));
  assert.deepEqual(extra, [], `price calls outside lib/price/: ${extra.map((f) => `${f} (${found.get(f)})`).join(", ")}`);
});

test("V2: the allowed list holds no stale entry", () => {
  const found = pricingFiles();
  const stale = Object.keys(ALLOWED).filter((f) => !found.has(f));
  assert.deepEqual(stale, [], "remove these from ALLOWED: they no longer price on their own");
});

test("report: paths outside the engine", () => {
  const n = [...pricingFiles().keys()].filter((f) => !(f in KERNEL_FILES)).length;
  if (process.env.PRICE_REPORT) console.log(`paths outside the engine: ${n}`);
  assert.ok(n >= 0);
});
