// G12, Lane 4: Explore search (src/lib/search). Feature tokens, shard
// routing, matching with accents and other languages, the rank order, what
// a pick means for the list, the picked-label bridge and recent searches.
// Run: node --test tests/search.test.mjs (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import {
  extractTokens, hasFeatures, shardsFor, prepareAreas, prepareTowns, cartaPlaces, suggest,
  resolveIds, hitsFor, placesNear, rememberPick, pickedHits, resetPicked, readRecent, addRecent,
  clearRecent, cartaRegionsFrom, cartaTwin, NEAR_MIN, namesFromTowns, startTown,
} from "../src/lib/search/index.js";
import { querySearchIndex } from "../src/lib/searchIndex.js";

const DATA = {
  destinations: {
    CGN: { id: "CGN", city: "Cologne", country: "Germany", iso2: "DE", lat: 50.87, lon: 7.14, city_lat: 50.94, city_lon: 6.96, categories: ["city", "historic"] },
    "gem:tasch": { city: "Täsch", country: "Switzerland", iso2: "CH", lat: 46.07, lon: 7.78, categories: ["mountains", "hiking"] },
    "gem:visp": { city: "Visp", country: "Switzerland", iso2: "CH", lat: 46.29, lon: 7.88, categories: ["town"] },
    "gem:sion": { city: "Sion", country: "Switzerland", iso2: "CH", lat: 46.23, lon: 7.36, categories: ["historic"] },
    "gem:aosta": { city: "Aosta", country: "Italy", iso2: "IT", lat: 45.74, lon: 7.32, categories: ["historic", "mountains"] },
    "gem:domodossola": { city: "Domodossola", country: "Italy", iso2: "IT", lat: 46.12, lon: 8.29, categories: ["town"] },
    PDL: { city: "Ponta Delgada", country: "Portugal", iso2: "PT", lat: 37.74, lon: -25.67, categories: ["island", "beach"] },
    "gem:nazare": { city: "Nazaré", country: "Portugal", iso2: "PT", lat: 39.6, lon: -9.07, categories: ["beach", "coast"] },
    "gem:luberon": { city: "Luberon (Gordes)", country: "France", iso2: "FR", lat: 43.91, lon: 5.2, categories: ["village"] },
    OPO2: { city: "Porto", country: "Portugal", iso2: "PT", lat: 41.15, lon: -8.61, gateway_of: "OPO", categories: [] },
  },
};
const places = cartaPlaces(DATA);

const TOWNS = prepareTowns([
  [2886242, ["Köln", "Koeln", "Keulen", "Cologne"], 50.9333, 6.95, "DE", "07", 1024621],
  [2657928, ["Zermatt"], 46.02, 7.7486, "CH", "VS", 6629],
  [2657929, ["Zermeiggern"], 46.1, 7.9, "CH", "VS", 600],
  [2264442, ["Porto Covo"], 37.8526, -8.7902, "PT", "19", 1400],
]);
const AREAS = prepareAreas({
  countries: [["PT", ["Portugal", "Portogallo"], [-31.3, 32.6, -6.2, 42.2], 10e6], ["CH", ["Switzerland", "Zwitserland", "Schweiz"], [5.9, 45.8, 10.5, 47.8], 8e6, { nl: "Zwitserland", de: "Schweiz" }]],
  regions: [["CH.VS", ["Valais", "Wallis", "Vallese"], [6.75, 45.9, 8.2, 46.5], 278000], ["IT.16", ["Tuscany", "Toscana"], [9.7, 42.3, 12.4, 44.5], 3.4e6]],
});

test("feature words become tokens in six languages, whole words only", () => {
  assert.deepEqual(extractTokens("beach portu"), { tokens: ["beach"], rest: "portu" });
  assert.deepEqual(extractTokens("Strände Algarve"), { tokens: ["beach"], rest: "algarve" });
  assert.deepEqual(extractTokens("altstadt"), { tokens: ["oldtown"], rest: "" });
  assert.deepEqual(extractTokens("centro storico Lucca"), { tokens: ["oldtown"], rest: "lucca" });
  assert.deepEqual(extractTokens("îles grecques").tokens, ["islands"]);
  assert.deepEqual(extractTokens("Skiathos"), { tokens: [], rest: "skiathos" });
  assert.deepEqual(extractTokens("lago di garda", ["lake"]), { tokens: [], rest: "lago di garda" });
  assert.equal(hasFeatures(["beach", "coast"], ["beach"]), true);
  assert.equal(hasFeatures(["coast"], ["beach"]), false);
});

test("a prefix fetches only the shards it spans", () => {
  const index = { shards: [{ file: "t-00.json", from: "" }, { file: "t-01.json", from: "ka" }, { file: "t-02.json", from: "sa" }, { file: "t-03.json", from: "san" }] };
  assert.deepEqual(shardsFor(index, "ze"), ["t-03.json"]);
  assert.deepEqual(shardsFor(index, "ko"), ["t-01.json"]);
  assert.deepEqual(shardsFor(index, "sa"), ["t-02.json", "t-03.json"]);
  assert.deepEqual(shardsFor(index, "k"), ["t-00.json", "t-01.json"]);
  assert.deepEqual(shardsFor(index, ""), []);
});

test("Carta places: gateways left out, parenthesised names searchable", () => {
  assert.equal(places.some((p) => p.id === "OPO2"), false);
  assert.equal(places.find((p) => p.id === "gem:tasch").city, "Täsch");
  const r = suggest("gordes", { places });
  assert.equal(r.items[0].id, "gem:luberon");
});

test("accents fold both ways", () => {
  assert.equal(suggest("tasch", { places }).items[0].id, "gem:tasch");
  assert.equal(suggest("Nazare", { places }).items[0].id, "gem:nazare");
});

test("a town that is a Carta place opens that place, in any language", () => {
  const r = suggest("keul", { places, towns: TOWNS });
  assert.equal(r.items[0].type, "place");
  assert.equal(r.items[0].id, "CGN");
  assert.equal(r.items.some((x) => x.type === "near"), false);
  assert.equal(cartaTwin(TOWNS[0], places).id, "CGN");
});

test("a town Carta does not cover becomes Near it, with Carta's places by distance", () => {
  const r = suggest("zerm", { places, towns: TOWNS });
  const near = r.items.find((x) => x.type === "near" && x.name === "Zermatt");
  assert.ok(near);
  assert.ok(near.count >= NEAR_MIN);
  const ids = resolveIds(near, places);
  assert.equal(ids[0], "gem:tasch");
  assert.equal(ids.length, near.count);
  const km = placesNear(places, near.lat, near.lon).map((x) => x.km);
  assert.deepEqual(km, [...km].sort((a, b) => a - b));
});

test("rank: Carta places, then towns by population, then regions, then countries", () => {
  const towns = prepareTowns([
    [1, ["Valbig"], 46.2, 7.5, "CH", "VS", 9000],
    [2, ["Valsmall"], 46.3, 7.6, "CH", "VS", 900],
  ]);
  const extra = cartaPlaces({ destinations: { "gem:valx": { city: "Valère", iso2: "CH", lat: 46.23, lon: 7.36, categories: [] } } });
  const r = suggest("val", { places: [...places, ...extra], towns, areas: AREAS });
  // fixes-r1 Q7: regions and countries by prefix rank above villages.
  assert.deepEqual(r.items.map((x) => x.type), ["place", "region", "near", "near"]);
  assert.equal(r.items[1].code, "CH.VS");
  assert.equal(r.items[2].name, "Valbig");
});

test("an area named in full leads, and resolves to the places inside it", () => {
  const r = suggest("Valais", { places, towns: [], areas: AREAS });
  assert.equal(r.items[0].type, "region");
  const ids = resolveIds(r.items[0], places);
  assert.deepEqual(ids.sort(), ["gem:sion", "gem:tasch", "gem:visp"]);
  const it = suggest("zwitserland", { places, areas: AREAS, lang: "nl" }).items[0];
  assert.equal(it.type, "country");
  assert.equal(it.name, "Zwitserland");
  assert.equal(it.count, 3);
});

test("feature tokens narrow an area; tokens alone list every place with them", () => {
  const r = suggest("beach portugal", { places, areas: AREAS });
  assert.deepEqual(r.tokens, ["beach"]);
  const pt = r.items.find((x) => x.type === "country");
  assert.equal(pt.count, 2);
  assert.deepEqual(resolveIds(pt, places).sort(), ["PDL", "gem:nazare"]);
  const only = suggest("islands", { places });
  assert.equal(only.items[0].type, "feature");
  assert.deepEqual(resolveIds(only.items[0], places), ["PDL"]);
});

test("a region with no Carta place inside falls back to the places near its middle", () => {
  const empty = { type: "region", bbox: [7.5, 45.95, 7.6, 46.0], cc: "CH", tokens: [] };
  assert.ok(resolveIds(empty, places).length > 0);
});

test("Carta's own region boxes are suggested by any of their keys", () => {
  const regions = cartaRegionsFrom({ regions: { tuscany: { bbox: [7, 45, 8, 46], label: "Tuscany" }, toscana: { bbox: [7, 45, 8, 46], label: "Tuscany" } } });
  assert.equal(regions.length, 1);
  const it = suggest("toscana", { places, cartaRegions: regions }).items[0];
  assert.equal(it.type, "region");
  assert.equal(it.name, "Tuscany");
});

test("a picked label feeds the existing list filter through querySearchIndex", () => {
  resetPicked();
  const it = { type: "region", name: "Valais", bbox: AREAS.regions[0].bbox, cc: "CH", tokens: [] };
  rememberPick("Valais", hitsFor(it, resolveIds(it, places)));
  const hits = querySearchIndex(null, "valais");
  assert.equal(hits.regionLabel, "Valais");
  assert.deepEqual([...hits.ids].sort(), ["gem:sion", "gem:tasch", "gem:visp"]);
  assert.equal(pickedHits("Near Zermatt"), null);
  assert.equal(querySearchIndex(null, "Near Zermatt").ids, null);
});

test("recent searches: newest first, deduplicated, capped, storage errors swallowed", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  for (let i = 0; i < 7; i++) addRecent({ type: "near", key: `t:${i}`, name: `T${i}`, lat: 1, lon: 2, tokens: [], count: 3 }, storage);
  addRecent({ type: "near", key: "t:3", name: "T3", lat: 1, lon: 2, tokens: [] }, storage);
  const list = readRecent(storage);
  assert.equal(list.length, 5);
  assert.equal(list[0].key, "t:3");
  assert.equal(list[0].count, undefined);
  assert.deepEqual(clearRecent(storage), []);
  const broken = { getItem: () => { throw new Error("off"); }, setItem: () => { throw new Error("off"); } };
  assert.deepEqual(readRecent(broken), []);
  assert.doesNotThrow(() => addRecent({ type: "place", key: "p:x" }, broken));
});

test("names show in the UI language, whatever language matched (Q3)", () => {
  const en = suggest("zwitserland", { places, areas: AREAS, lang: "en" }).items[0];
  assert.equal(en.name, "Switzerland");
  assert.equal(suggest("schw", { places, areas: AREAS, lang: "de" }).items[0].name, "Schweiz");
  // a prefix in another language does not offer the country ("porto" is not Portogallo)
  assert.equal(suggest("portog", { places, areas: AREAS, lang: "en" }).items.some((x) => x.type === "country"), false);
  const towns = prepareTowns([[9, ["Lisboa", "Lisbon", "Lissabon"], 38.72, -9.14, "PT", "14", 500000, { en: "Lisbon", nl: "Lissabon" }]]);
  const near = suggest("lissab", { places, towns, lang: "en" }).items.find((x) => x.type === "near");
  assert.equal(near.name, "Lisbon");
});

test("feature words stay part of a place name (Q4)", () => {
  const extra = cartaPlaces({ destinations: {
    "gem:ld": { city: "Lake District", iso2: "GB", lat: 54.5, lon: -3.1, categories: ["lake"] },
    "gem:bled": { city: "Bled", iso2: "SI", lat: 46.37, lon: 14.11, categories: ["lake"] },
  } });
  const all = [...places, ...extra];
  const ld = suggest("Lake District", { places: all });
  assert.deepEqual(ld.tokens, []);
  assert.equal(ld.items[0].id, "gem:ld");
  const bled = suggest("Lake Bled", { places: all });
  assert.deepEqual(bled.tokens, []);
  assert.equal(bled.items[0].id, "gem:bled");
  assert.deepEqual(suggest("lake", { places: all }).tokens, ["lake"]);
  assert.deepEqual(suggest("what beach in June?", { places: all, noTokens: true }).tokens, []);
  assert.deepEqual(suggest("Strand in Portugal", { places, areas: AREAS }).items[0].type, "country");
});

test("airports show as their city, and one town gives one row (Q5)", () => {
  const ps = cartaPlaces({ destinations: {
    VCE: { tier: "airport", city: "Venice (Marco Polo)", iso2: "IT", lat: 45.5, lon: 12.35, city_lat: 45.44, city_lon: 12.33, categories: [] },
    CGN: { tier: "airport", city: "Cologne-Bonn", iso2: "DE", lat: 50.87, lon: 7.14, categories: [] },
    "gem:koln": { city: "Köln", iso2: "DE", lat: 50.94, lon: 6.96, categories: [] },
    "gem:luberon": { city: "Luberon (Gordes)", iso2: "FR", lat: 43.9, lon: 5.2, categories: [] },
  } });
  assert.equal(ps.find((p) => p.id === "VCE").city, "Venice");
  assert.equal(ps.find((p) => p.id === "gem:luberon").city, "Luberon (Gordes)");
  const towns = prepareTowns([[2886242, ["Köln", "Cologne"], 50.9333, 6.95, "DE", "07", 1024621]]);
  const ids = suggest("cologne", { places: ps, towns }).items.map((x) => x.id);
  assert.deepEqual(ids, ["gem:koln"]);
});

test("no dead-end rows: no 0-place feature row, no Near beside its own region (Q7)", () => {
  assert.equal(suggest("ski islands", { places }).items.length, 0);
  const areas = prepareAreas({ countries: [], regions: [["CH.VS", ["Valais"], [6.75, 45.9, 8.2, 46.5], 1]] });
  const towns = prepareTowns([[5, ["Valais"], 46.2, 7.5, "CH", "VS", 900]]);
  const items = suggest("valais", { places, towns, areas }).items;
  assert.equal(items.filter((x) => x.name === "Valais").length, 1);
});

test("the start town's names in every UI language come from the gazetteer", () => {
  const towns = prepareTowns([
    [2800866, ["Brussels", "Brussel", "Bruxelles"], 50.85, 4.35, "BE", "BRU", 1019022, { nl: "Brussel", fr: "Bruxelles", de: "Brüssel" }],
    [1, ["Brussels"], 40.0, -80.0, "BE", "X", 9000000, { nl: "Elders" }],
  ]);
  assert.deepEqual(namesFromTowns(towns, "Brussels", 50.9, 4.48), { nl: "Brussel", fr: "Bruxelles", de: "Brüssel" });
  assert.equal(namesFromTowns(towns, "Ghent", 51, 3.7), null);
  const data = { meta: { origins: { BRU: { city: "Brussels", lat: 50.9, lon: 4.48 } } } };
  assert.deepEqual(startTown({ originKind: "place", origin: "BRU" }, data), { name: "Brussels", lat: 50.9, lon: 4.48 });
  assert.equal(startTown({ originKind: "country", originCountry: "BE" }, data), null);
  assert.equal(startTown({ originKind: "place", fromPlace: { name: "Gent", lat: 51, lon: 3.7 } }, data).name, "Gent");
});

test('a Carta place speaks the UI language when its gazetteer town has a name in it (fixes r1)', async () => {
  const { localPlaceName } = await import('../src/lib/search/suggest.js');
  const p = { id: 'BRU', city: 'Brussels', folds: ['brussels'], lat: 50.85, lon: 4.35 };
  const towns = [{ folds: ['brussels', 'bruxelles', 'brussel'], l: { fr: 'Bruxelles', nl: 'Brussel' }, lat: 50.85, lon: 4.35 }];
  assert.equal(localPlaceName(p, towns, 'fr'), 'Bruxelles');
  assert.equal(localPlaceName(p, towns, 'en'), null, 'no name of its own: the place keeps Brussels');
  assert.equal(localPlaceName(p, [{ ...towns[0], lat: 52, lon: 5 }], 'fr'), null, 'a far town is another place');
});
