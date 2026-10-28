// T766: "Help me choose" and Explore agree. For every one of the twelve
// personas of gate 7 (tests/personas_v5.json), the five places "Help me
// choose" names for a country are the first five of Explore's "For you"
// order for that country and month. Run: npm test
//
// Explore is filtered to what the Help me choose card can show at all: a
// rated place (7 and up, countryMatch MIN_PLACE_SCORE) with a photograph,
// one row per city. Inside that set the two orders must be the same.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { matchCountries } from "../src/lib/countryMatch.js";
import { sortForYou } from "../src/lib/match.js";
import { tripTaste } from "../src/lib/taste.js";
import { isGateway } from "../src/lib/rating.js";

const here = dirname(fileURLToPath(import.meta.url));
const wire = join(here, "..", "public", "app_data.json");
const data = existsSync(wire) ? JSON.parse(readFileSync(wire, "utf8")) : null;
const personas = JSON.parse(readFileSync(join(here, "personas_v5.json"), "utf8")).personas;

test("Help me choose and Explore give the same top 5, for all twelve personas", { skip: !data }, () => {
  const D = data.destinations;
  let compared = 0;
  for (const p of personas) {
    const taste = tripTaste(p.taste, p.taste.likes);
    const out = matchCountries({
      destinations: D, answers: { types: p.taste.likes }, month: p.month, taste, topN: 5,
    });
    assert.ok(out.length > 0, `${p.id}: no country`);
    for (const c of out.slice(0, 3)) {
      const seen = new Set();
      const rows = Object.entries(D)
        .filter(([, d]) => d.country === c.country && d.lat != null && !isGateway(d)
          && (d.rating?.score ?? 0) >= 7 && d.image?.url)
        .map(([id, d]) => ({ ...d, id }));
      const explore = sortForYou(rows, taste, p.month)
        .filter((d) => { const k = d.city.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 5).map((d) => d.id);
      assert.deepEqual(c.topPlaces, explore, `${p.id} in ${c.country}, month ${p.month}`);
      compared += 1;
    }
  }
  assert.ok(compared >= 12);
});
