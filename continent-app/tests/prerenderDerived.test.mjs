// T368: a non-English prerendered page carries derived sentences, never the
// English-only intro, hook or day prose (owner call T362 on T205-g).
import test from "node:test";
import assert from "node:assert/strict";
import { destPage, tripPage, journeyPage } from "../scripts/prerender/pages.mjs";
import { destLead, tripLead, journeyLead, tr, DERIVED_LANGS } from "../scripts/prerender/derived.mjs";
import { en } from "../src/i18n/en.js";
import { de } from "../src/i18n/de.js";
import { es } from "../src/i18n/es.js";
import { fr } from "../src/i18n/fr.js";
import { it as itCat } from "../src/i18n/it.js";
import { nl } from "../src/i18n/nl.js";

const INTRO = "A Wikivoyage sentence that exists in English only.";
const dos = {
  id: "MLG", slug: "malaga", place: { iso2: "ES", name: "Malaga", lat: 36.7, lon: -4.4 },
  verdict: { score: 7.4, country_rank: 3, country_n: 40 },
  intro: { short: INTRO, body: `${INTRO} More English prose follows here.` },
  highlights: [{ name: "Alcazaba", fact: "An English fact about the fortress" }],
};
const none = () => [];
const ctx = (lang) => ({
  lang,
  costOf: () => ({ dayEur: 80, stayEur: 50, foodEur: 30, stayLevel: "city" }),
  isTrail: () => false, isCycle: () => false, isLayer: () => false,
  destById: () => null, destRow: () => ({}), receiptsOfDest: none, nearPlaces: none,
  destByCity: () => null, receiptOfTrip: () => null, topTrips: none,
  journeysOfType: none, hasSection: () => false, generatedAt: () => null,
});
const flat = (p) => JSON.stringify([p.lead, p.description, p.sections, p.coverage]);

test("English destination page is unchanged: the intro still leads", () => {
  const p = destPage(dos, ctx("en"));
  assert.ok(p.lead.join(" ").includes(INTRO));
});

for (const lang of ["de", "es", "fr", "it", "nl"]) {
  test(`${lang} destination page: derived lead, no English intro or fact`, () => {
    const p = destPage(dos, ctx(lang));
    const s = flat(p);
    assert.ok(!s.includes("Wikivoyage") && !s.includes("English prose") && !s.includes("English fact"), s);
    assert.ok(p.lead.length >= 1 && p.lead[0].includes("Malaga"));
    assert.ok(!/About Malaga/.test(s));
  });
}

test("trip and journey pages: derived lead for a foreign language only", () => {
  const trip = { id: "t1", cc: "ES", days: 5, nights: 4, cities: [{ cc: "ES", city: "Malaga", n: 4 }], cost: { per_day_eur: 90 }, season: [5], transport: "train" };
  assert.match(tripPage(trip, ctx("de")).lead.join(" "), /5 Tage und 4 Nächte/);
  assert.match(tripPage(trip, ctx("en")).lead.join(" "), /4 nights in Malaga/);
  const j = { id: "j1", title: "Coast walk", hook: "An English hook.", summary: "An English summary.", countryCode: "ES", durationDays: 6, budget: { perDayEur: { low: 70 } }, itinerary: [{ day: 1, title: "English day title" }] };
  const jf = journeyPage(j, ctx("fr"));
  assert.ok(!flat(jf).includes("English") && !JSON.stringify(jf.subject).includes("English day title"));
  assert.match(jf.lead.join(" "), /6 jours/);
  assert.match(journeyPage(j, ctx("en")).lead.join(" "), /An English hook/);
});

test("every derived key exists in all six catalogues", () => {
  const keys = Object.keys(en).filter((k) => k.startsWith("prerender."));
  assert.ok(keys.length >= 8);
  for (const cat of [de, es, fr, itCat, nl]) for (const k of keys) assert.ok(cat[k], k);
  assert.deepEqual(DERIVED_LANGS.sort(), ["de", "en", "es", "fr", "it", "nl"]);
});

test("derived sentences fill every variable and carry no dash or middot", () => {
  for (const lang of DERIVED_LANGS) {
    const out = [
      ...destLead(lang, { name: "Malaga", country: "Spain", score: 7.4, day: "€80" }),
      ...tripLead(lang, { days: 5, nights: 4, names: ["Malaga", "Ronda"], perDayEur: 90 }),
      ...journeyLead(lang, { name: "Coast walk", days: 6, country: "Spain", perDayEur: 70 }),
      tr(lang, "prerender.destRank", { rank: 3, n: 40, country: "Spain" }),
    ].join(" ");
    assert.ok(!/\{\w+\}/.test(out), out);
    assert.ok(!/[–—·]/.test(out), out);
  }
});
