// T870 to T873: the trip page's "Who this trip is for" paragraph
// (src/planner/finder/whoFor.js) in six languages, the trip page's address
// and the words it adds. Pure helpers, no DOM.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { whoFor, whoForSentences, whoKind, whoLikes, bandOf, WHO_KINDS, WHO_LIKES, WHO_WAYS } from "../src/planner/finder/whoFor.js";
import { en } from "../src/i18n/en.js";
import { nl } from "../src/i18n/nl.js";
import { de } from "../src/i18n/de.js";
import { fr } from "../src/i18n/fr.js";
import { es } from "../src/i18n/es.js";
import { it } from "../src/i18n/it.js";

const CATALOGS = { en, nl, de, fr, es, it };
const tFor = (cat) => (k, v = {}) => {
  const s = cat[k] ?? en[k];
  assert.ok(typeof s === "string", `missing key ${k}`);
  return s.replace(/\{(\w+)\}/g, (_, n) => (v[n] == null ? `{${n}}` : String(v[n])));
};
const BANNED = /\b(seamless|unlock|effortless|elevate|leverage|empower|curated|simply|just|easy)\b/i;

const dest = (id, city, { tmax = 18, crowd = 2, car = false } = {}) => ({
  id, city, iso2: "PT",
  taste: { tmax_by_month: Array(12).fill(tmax), crowd_by_month: Array(12).fill(crowd), car_need: car },
});
const destinations = {
  a: dest("a", "Lagos", { tmax: 24, crowd: 3, car: true }),
  b: dest("b", "Tavira", { tmax: 25, crowd: 2 }),
  c: dest("c", "Faro", { tmax: 23, crowd: 1 }),
};
const trip = (ids, { bars = [["beach", 0.9], ["food", 0.7], ["culture", 0.3]], mode = "train", party = { adults: 2, children: 0, babies: 0 } } = {}) => ({
  id: "x", month: 7, nights: 7, transport: "auto",
  places: ids.map((id, i) => ({ id, nights: i === 0 ? 4 : 3 })),
  party: { ...party, head: party.adults + party.children },
  match: { pct: 86, bars: bars.map(([key, p]) => ({ kind: "like", key, p })) },
  slots: [{ id: "local", pick: { id: "public" } }],
  quote: { legs: [{ mode }] },
});

test("T871: the paragraph names who, the likes it matches, the route, the month and the crowds", () => {
  const t = tFor(en);
  const s = whoForSentences(trip(["a", "b"]), { settings: { party: { kind: "couple" } }, destinations, t, lang: "en" });
  assert.deepEqual(s.map((x) => x.key), ["open", "route", "month", "crowd", "car"]);
  const text = whoFor(trip(["a", "b"]), { settings: { party: { kind: "couple" } }, destinations, t, lang: "en" });
  assert.equal(
    text,
    "For two people who like the beach and good food. You start with 4 nights in Lagos, then go on to Tavira by train for 3 nights. "
    + "In July it is warm there, with highs of 24 to 25 °C. That is the busiest time of the year, so book early. "
    + "Some of the best spots are hard to reach without a car.",
  );
});

test("T871: a fact the data does not hold drops its sentence; nothing is guessed", () => {
  const t = tFor(en);
  const bare = { a: { id: "a", city: "Lagos" } };
  const s = whoForSentences(trip(["a"], { bars: [] }), { destinations: bare, t, lang: "en" });
  assert.deepEqual(s.map((x) => x.key), ["open", "route"], "no likes: the nights; no taste: no month, crowd or car");
  assert.match(s[0].text, /7 nights to spend/);
  assert.match(s[1].text, /unpack once/);
  const three = whoFor(trip(["a", "b", "c"]), { destinations, t, lang: "en" });
  assert.match(three, /You start in Lagos, go on to Tavira and end in Faro\./);
  assert.equal(whoKind({ party: { adults: 2, children: 1 } }), "family");
  assert.equal(whoKind({ party: { adults: 1 } }), "solo");
  assert.deepEqual(whoLikes(trip(["a"])), ["beach", "food"], "the strongest two of 50 per cent and up");
  assert.equal(bandOf(30), "hot");
  assert.equal(bandOf(9), "cold");
});

test("T871: every party, like, way and band reads in six languages with no dash, middot or banned word", () => {
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    const t = tFor(cat);
    for (const kind of WHO_KINDS) {
      for (const way of WHO_WAYS) {
        for (const tmax of [5, 12, 20, 26, 32]) {
          const ds = { a: dest("a", "Lagos", { tmax, crowd: 0, car: true }), b: dest("b", "Tavira", { tmax, crowd: 3 }) };
          const text = whoFor(trip(["a", "b"], { mode: way, bars: WHO_LIKES.slice(0, 2).map((k) => [k, 0.8]) }),
            { settings: { party: { kind } }, destinations: ds, t, lang });
          assert.ok(text.length > 40, `${lang} ${kind}`);
          assert.doesNotMatch(text, /[–—·]/, `${lang}: no dashes or middots`);
          assert.doesNotMatch(text, /\{\w+\}/, `${lang}: every slot filled: ${text}`);
          if (lang === "en") assert.doesNotMatch(text, BANNED, text);
        }
      }
    }
    for (const like of WHO_LIKES) assert.ok(cat[`tf.who.like.${like}`], `${lang} tf.who.like.${like}`);
  }
});

test("T870 to T873: every new key is in all six languages, and the removed preview keys are gone", () => {
  const added = Object.keys(en).filter((k) => /^(tf\.tp\.|tf\.who\.|tp\.rb\.|tp\.car\.)/.test(k) || k === "tf.tog.close");
  assert.ok(added.length >= 60, `${added.length} keys`);
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    for (const k of added) {
      assert.ok(typeof cat[k] === "string" && cat[k].length, `${lang} ${k}`);
      assert.doesNotMatch(cat[k], /[–—·]/, `${lang} ${k}`);
    }
    // T811-d: the receipt's leftovers and the preview dialog's own words.
    for (const k of ["tf.rc.close", "tf.rc.whyPrice", "tf.rc.whyMatch", "tf.pv.tabs", "tf.pv.cost", "tf.pv.expand"]) {
      assert.equal(cat[k], undefined, `${lang} ${k} removed`);
    }
  }
});

test("T872: Plan this trip on Help me choose lands on the trip page, not the wizard", () => {
  const src = readFileSync(new URL("../src/planner/flow/TripFlow.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /startEngine\('guide', settings, plan\)/, "no finder plan goes to the engine");
  assert.match(src, /landPlan\(plan, 'guide'\)/);
  assert.doesNotMatch(src, /draftFor/);
  const finder = readFileSync(new URL("../src/planner/finder/FindingTrips.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(finder, /TripPreview/);
  assert.match(finder, /const TRIP_HASH = '#tf='/);
});
