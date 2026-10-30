// The persona (owner, plan flow walk 2026-10-30): how the traveller likes to
// travel moves the trip finder's places. Run: npm test (continent-app/). The
// catalogue checks read public/boot.json and public/dest/ and skip without them.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  PERSONA, PERSONAS, personaFit, personaPool, personaReason, personaShapes, personaShift, tripPersona, weighs,
} from "../src/lib/recommend/persona.js";
import { shapesFor, placesNear } from "../src/lib/recommend/candidates.js";
import { normalizeSettings } from "../src/planner/flow/tripSettings.js";
import { QUESTIONS } from "../src/planner/flow/questions.js";
import { guideScreens } from "../src/planner/flow/flowGraph.js";

// A small Côte d'Azur: a metro, a city 12 km from it, a village 8 km from it,
// a town far inland, all rated, with the profile fields the persona reads.
const place = (cls, lat, lon, extra = {}) => ({
  city: extra.city, iso2: "FR", lat, lon, image: { url: `u:${extra.city}` },
  rating: { score: extra.score ?? 8 }, place: { class: cls, base: extra.base ?? 0.6 },
  taste: { size: cls, crowd_by_month: Array(12).fill(extra.crowd ?? 2), likes: extra.likes || {} },
  categories: extra.cats || [],
});
const coast = {
  NCE: place("metro", 43.70, 7.26, { city: "Nice", score: 8.7, base: 0.82, likes: { nightlife: [0.99], culture: [0.6], city: [0.97] }, crowd: 3 }),
  "gem:antibes": place("city", 43.58, 7.12, { city: "Antibes", score: 7.4, likes: { culture: [0.8], city: [0.8] } }),
  "gem:spdv": place("village", 43.70, 7.12, { city: "Saint-Paul-de-Vence", score: 8.4, likes: { culture: [0.8] }, cats: ["quiet"] }),
  "gem:far": place("town", 44.40, 6.20, { city: "Far town", score: 8.4, likes: { hiking: [0.9] }, crowd: 0 }),
};

test("ten personas; mix weighs nothing", () => {
  assert.deepEqual(PERSONAS, ["cities", "hubtrips", "outside", "towns", "coast", "nature", "hidden", "slow", "lively", "mix"]);
  assert.equal(weighs("mix"), false);
  assert.equal(weighs(""), false);
  assert.equal(personaFit("mix", "NCE", coast), null);
  assert.equal(personaShift(null), 0);
  assert.ok(PERSONAS.every((p) => QUESTIONS["g:persona"].options.some((o) => o.value === p)));
});

test("near the hubs, not in them: the calmer places beside Nice beat Nice", () => {
  const nice = personaFit("outside", "NCE", coast, 7);
  const antibes = personaFit("outside", "gem:antibes", coast, 7);
  const spdv = personaFit("outside", "gem:spdv", coast, 7);
  assert.ok(antibes > nice + 0.4 && spdv > nice + 0.4, `outside: Nice ${nice}, Antibes ${antibes}, Saint-Paul ${spdv}`);
  // The shift is big enough to overturn Nice's 1.3 point lead over Antibes.
  assert.ok(8.7 + personaShift(nice) < 7.4 + personaShift(antibes));
  const pool = personaPool("outside", "FR", coast, { month: 7 });
  assert.notEqual(pool[0], "NCE");
  assert.ok(pool.indexOf("NCE") > pool.indexOf("gem:antibes"));
});

test("big cities and lively put Nice first; nature puts the quiet hiking town first", () => {
  for (const p of ["cities", "lively"]) assert.equal(personaPool(p, "FR", coast, { month: 7 })[0], "NCE", p);
  assert.equal(personaPool("nature", "FR", coast, { month: 7 })[0], "gem:far");
  // Without a persona the pool is the quality order.
  assert.equal(personaPool(null, "FR", coast, { month: 7 })[0], "NCE");
});

test("a trip's persona: its places by nights, and a reason in the traveller's terms", () => {
  const trip = { month: 7, places: [{ id: "gem:antibes", nights: 7 }] };
  assert.ok(tripPersona(trip, "outside", coast) >= PERSONA.reasonMin);
  assert.deepEqual(personaReason(trip, "outside", coast), {
    key: "tf.reason.persona.outside", facts: { place: "Antibes", hub: "Nice", km: 17 },
  });
  // Nice is no calmer base: no persona reason for it.
  assert.equal(personaReason({ month: 7, places: [{ id: "NCE", nights: 7 }] }, "outside", coast), null);
  const cities = personaReason({ month: 7, places: [{ id: "NCE", nights: 4 }, { id: "gem:antibes", nights: 3 }] }, "cities", coast);
  assert.deepEqual(cities?.facts, { places: ["Nice", "Antibes"] });
});

test("the persona sets the shapes when What kind of trip has no answer, and big cities reach further", () => {
  const s = (guide) => normalizeSettings({ guide });
  assert.deepEqual(shapesFor(s({ persona: "hubtrips" })).shapes, ["one"]);
  assert.deepEqual(shapesFor(s({ persona: "cities" })).shapes, ["towns", "one"]);
  assert.deepEqual(shapesFor(s({ persona: "cities", shapes: ["road"] })).shapes, ["road"], "an answered shape wins");
  assert.equal(personaShapes("mix"), null);
  // Rome and Florence are 230 km apart: a few towns only with the big-cities reach.
  const it = {
    FCO: { lat: 41.90, lon: 12.50 }, FLR: { lat: 43.77, lon: 11.25 },
  };
  assert.equal(placesNear(["FCO", "FLR"], 2, "towns", it), null);
  assert.deepEqual(placesNear(["FCO", "FLR"], 2, "towns", it, PERSONA.towns.cities), ["FCO", "FLR"]);
});

test("the persona is the first help-me-choose question and survives normalising", () => {
  const n = normalizeSettings({ guide: { persona: "outside" } });
  assert.equal(n.guide.persona, "outside");
  assert.equal(normalizeSettings({ guide: { persona: "spaceman" } }).guide.persona, "");
  assert.equal(guideScreens(n)[0], "g:persona");
});

// ---- On the real catalogue ----
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const haveCatalogue = existsSync(pub("boot.json")) && existsSync(pub("dest"));
const skip = haveCatalogue ? false : "public/boot.json or public/dest is not on this machine";
let catalogue = null;
function loadCatalogue() {
  if (catalogue) return catalogue;
  const boot = JSON.parse(readFileSync(pub("boot.json"), "utf8"));
  const all = {};
  for (const f of readdirSync(pub("dest")).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
    try { Object.assign(all, JSON.parse(readFileSync(pub(`dest/${f}`), "utf8"))); } catch { /* not a chunk */ }
  }
  for (const [id, lat, lon, cc] of boot.d) if (all[id]) Object.assign(all[id], { lat, lon, iso2: cc });
  catalogue = all;
  return all;
}

test("the catalogue: Antibes over Nice for near the hubs, and each persona leads with its own places", { skip }, () => {
  const d = loadCatalogue();
  if (!d.NCE || !d["gem:antibes"]) return;
  assert.ok(personaFit("outside", "gem:antibes", d, 7) > personaFit("outside", "NCE", d, 7) + 0.5);
  const fr = Object.fromEntries(PERSONAS.filter(weighs).map((p) => [p, personaPool(p, "FR", d, { month: 7 }).slice(0, 3)]));
  assert.ok(!fr.outside.includes("NCE"), `outside leads with ${fr.outside}`);
  assert.ok(fr.cities.some((id) => d[id]?.place?.class === "metro"), `cities leads with ${fr.cities}`);
  assert.ok(fr.nature.every((id) => d[id]?.place?.class !== "metro"), `nature leads with ${fr.nature}`);
  // The leading three differ between most personas: the distinction is real.
  const keys = Object.values(fr).map((ids) => ids.join(","));
  assert.ok(new Set(keys).size >= 6, `distinct leads: ${new Set(keys).size} of ${keys.length}`);
});

test("by the sea and one base, slow days: the seaside town and the calm base", () => {
  const sea = { ...coast, "gem:sea": place("town", 43.10, 6.00, { city: "Seaside", score: 8.2, base: 0.7, likes: { beach: [0.95] }, cats: ["coast"], crowd: 1 }) };
  assert.equal(personaPool("coast", "FR", sea, { month: 7 })[0], "gem:sea");
  assert.deepEqual(personaReason({ month: 7, places: [{ id: "gem:sea", nights: 7 }] }, "coast", sea), { key: "tf.reason.persona.coast", facts: { place: "Seaside" } });
  const slow = personaReason({ month: 7, places: [{ id: "gem:sea", nights: 7 }] }, "slow", sea);
  assert.deepEqual(slow, { key: "tf.reason.persona.slow", facts: { place: "Seaside" } });
  assert.equal(personaReason({ month: 7, places: [{ id: "gem:sea", nights: 4 }, { id: "gem:far", nights: 3 }] }, "slow", sea), null, "two bases are not one slow base");
  assert.deepEqual(personaShapes("slow"), ["one"]);
});

// T891: up to three personas, one maybe "most you".
test("several picks: a place scores by the pick it fits best, the most you counting fully", async () => {
  const { picksOf, personaOf, personaMatches } = await import("../src/lib/recommend/persona.js");
  const far = personaFit("nature", "gem:far", coast, 7);
  const nice = personaFit("cities", "NCE", coast, 7);
  // Both picks equal: each place keeps its own best fit.
  assert.equal(personaFit(["cities", "nature"], "gem:far", coast, 7), Math.max(far, personaFit("cities", "gem:far", coast, 7)));
  assert.equal(personaFit(["cities", "nature"], "NCE", coast, 7), Math.max(nice, personaFit("nature", "NCE", coast, 7)));
  // Most you: the other pick counts otherW.
  const most = personaFit({ ids: ["cities", "nature"], most: "cities" }, "gem:far", coast, 7);
  assert.ok(most < far && most >= far * PERSONA.otherW - 1e-9);
  // mix and unknown ids drop out; one id reads as before.
  assert.deepEqual(picksOf(["mix", "x", "coast"]).map((x) => x.id), ["coast"]);
  assert.equal(personaFit(["coast"], "NCE", coast, 7), personaFit("coast", "NCE", coast, 7));
  assert.deepEqual(picksOf({ ids: ["coast", "slow"], most: "slow" }).map((x) => x.id), ["slow", "coast"]);
  // A trip saved before (one persona) and a new one read the same way.
  assert.deepEqual(personaOf({ persona: "towns" }), { ids: ["towns"], most: null });
  assert.deepEqual(personaOf({ persona: "towns", personas: ["towns", "coast"], personaMost: "coast" }), { ids: ["towns", "coast"], most: "coast" });
  // A city and the mountains: a trip of both fits both picks better than either alone fits the other half.
  const mixTrip = { month: 7, places: [{ id: "NCE", nights: 4 }, { id: "gem:far", nights: 4 }] };
  assert.ok(tripPersona(mixTrip, ["cities", "nature"], coast) > tripPersona(mixTrip, "cities", coast));
  assert.ok(tripPersona(mixTrip, ["cities", "nature"], coast) > tripPersona(mixTrip, "nature", coast));
  // Shapes: the union, most you first.
  assert.deepEqual(personaShapes({ ids: ["towns", "slow"], most: "slow" }), ["one", "towns", "road"]);
  assert.equal(personaShapes(["mix"]), null);
  // The side panel's count and best places.
  const m = personaMatches(["nature"], coast, { month: 7 });
  assert.equal(m.top[0].id, "gem:far");
  assert.equal(personaMatches(["mix"], coast), null);
});

test("several picks survive normalising: up to three, mix only alone, most you one of them", () => {
  const s = normalizeSettings({ guide: { personas: ["towns", "mix", "coast", "slow", "lively"], personaMost: "lively" } });
  assert.deepEqual(s.guide.personas, ["towns", "coast", "slow"]);
  assert.equal(s.guide.personaMost, "");
  assert.equal(s.guide.persona, "towns");
  const old = normalizeSettings({ guide: { persona: "nature" } });
  assert.deepEqual(old.guide.personas, ["nature"]);
  assert.equal(old.guide.persona, "nature");
  const m = normalizeSettings({ guide: { personas: ["towns", "coast"], personaMost: "coast" } });
  assert.equal(m.guide.persona, "coast");
  assert.deepEqual(normalizeSettings({ guide: { personas: ["mix"] } }).guide.personas, ["mix"]);
});

test("a reason from several picks names a pick the trip truly fits", () => {
  const trip = { month: 7, places: [{ id: "gem:antibes", nights: 7 }] };
  const r = personaReason(trip, ["lively", "outside"], coast);
  assert.ok(r && r.key === "tf.reason.persona.outside", JSON.stringify(r));
});
