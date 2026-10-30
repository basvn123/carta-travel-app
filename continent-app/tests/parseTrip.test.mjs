// T857: one sentence about a trip read into the planner's answers
// (src/lib/plan/parseTrip.js). A corpus of sentences in English, Dutch and
// French with every field they state, and German, Spanish and Italian for the
// month, the people and the places; every named field must read right. The
// catalogue cases run on the real catalogue where it is on the machine; the
// rest run on the bare vocabulary everywhere.
// Run: npm test (continent-app/). PARSE_TRIP_VERBOSE=1 prints every reading.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseTrip, tripVocab, applyTrip, answeredBy, placeCountries } from "../src/lib/plan/parseTrip.js";
import { defaultSettings, markAnswered, normalizeSettings, answer, screenGiven } from "../src/planner/flow/tripSettings.js";
import { screenAnswered } from "../src/planner/flow/prefill.js";

const TODAY = "2026-10-30";
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const HAVE = existsSync(pub("app_data.json")) && existsSync(pub("search_index.json"));

let CTX = null;
function ctx() {
  if (CTX) return CTX;
  const data = JSON.parse(readFileSync(pub("app_data.json"), "utf8"));
  const rows = Array.isArray(data.destinations) ? data.destinations : Object.values(data.destinations);
  const destinations = Object.fromEntries(rows.map((d) => [d.id, d]));
  const index = JSON.parse(readFileSync(pub("search_index.json"), "utf8"));
  const lexicon = existsSync(pub("search/ask/lexicon.json")) ? JSON.parse(readFileSync(pub("search/ask/lexicon.json"), "utf8")) : null;
  CTX = { destinations, index, lexicon, origins: data.meta?.origins || {}, vocabs: new Map() };
  return CTX;
}
function read(lang, text) {
  const c = ctx();
  if (!c.vocabs.has(lang)) c.vocabs.set(lang, tripVocab({ destinations: c.destinations, lang, index: c.index, lexicon: c.lexicon }));
  return parseTrip(text, { vocab: c.vocabs.get(lang), lang, today: TODAY, destinations: c.destinations, origins: c.origins });
}

// [lang, sentence, expected]. Keys: places (ids), months, start, end, nights,
// party [adults, kids, babies], kind, likes, from (town name), budget [eur, per, unit],
// booked (the booked kinds), stay, way, priority, weather.
const CORPUS = [
  ["en", "A week in Portugal with my partner in May, beaches and good food, from Ghent, around 1,500 euro",
    { places: ["PT"], months: [5], nights: 7, party: [2, 0, 0], kind: "couple", likes: ["beach", "food"], from: "Ghent", budget: [1500, "group", "trip"] }],
  ["en", "Two weeks in Italy in August with my wife and two kids, we love beaches and food",
    { places: ["IT"], months: [8], nights: 14, party: [2, 2, 0], kind: "family", likes: ["beach", "food"] }],
  ["en", "Solo hiking trip to Slovenia in September, 5 days, from Brussels by train",
    { places: ["SI"], months: [9], nights: 4, party: [1, 0, 0], likes: ["hiking"], from: "Brussels", way: "train" }],
  ["en", "Weekend in Lisbon or Porto for 4 people in March, budget 300 each",
    { places: ["LIS", "OPO"], months: [3], nights: 2, party: [4, 0, 0], budget: [300, "person", "trip"] }],
  ["en", "We are 3 friends from Amsterdam, a week in Croatia in July, cheap hostels, nightlife",
    { places: ["HR"], months: [7], nights: 7, party: [3, 0, 0], kind: "friends", from: "Amsterdam", stay: "dorm", priority: "price", likes: ["nightlife"] }],
  ["en", "Family of five, 10 nights in Spain this summer, apartment, flights booked",
    { places: ["ES"], months: [6, 7, 8], nights: 10, party: [2, 3, 0], booked: ["flights"], stay: "home" }],
  ["en", "From 12 to 19 June in Prague with my girlfriend, around 900 euro for both",
    { places: ["PRG"], start: "2027-06-12", end: "2027-06-19", nights: 7, party: [2, 0, 0], budget: [900, "group", "trip"] }],
  ["en", "A long weekend in Vienna in December, 4 star hotel, comfort",
    { places: ["VIE"], months: [12], nights: 3, stay: "hotel4", priority: "comfort" }],
  ["en", "Road trip through Norway for 2 weeks, lakes and hiking, leaving from Ghent",
    { places: ["NO"], nights: 14, likes: ["lakes", "hiking"], from: "Ghent", way: "car" }],
  ["en", "Couple with a baby, Greece or Cyprus in May, beach, 7 nights, €2,000 in total",
    { places: ["GR", "CY"], months: [5], nights: 7, party: [2, 0, 1], kind: "family", likes: ["beach"], budget: [2000, "group", "trip"] }],
  ["en", "I may go to Paris any time, 3 nights, by bus",
    { places: ["CDG"], nights: 3, way: "bus", mode: "any" }],
  ["en", "Lake Bled and Ljubljana, 6 nights, 2 adults and 1 child, no car",
    { places: ["gem:bled", "LJU"], nights: 6, party: [2, 1, 0] }],
  ["en", "Off the beaten track in Portugal in October, we have a hotel booked, from London",
    { places: ["PT"], months: [10], booked: ["stays"], likes: ["hidden"], from: "London" }],
  ["en", "July 3 to 10 in Nice with my husband, 150 a day per person",
    { places: ["NCE"], start: "2027-07-03", end: "2027-07-10", party: [2, 0, 0], budget: [150, "person", "day"] }],
  ["en", "Cheap week in Poland in spring, culture and food, from Eindhoven",
    { places: ["PL"], months: [3, 4, 5], nights: 7, priority: "price", likes: ["culture", "food"], from: "Eindhoven" }],
  ["en", "Beach holiday in Mallorca for a family with 3 kids, 2 to 16 August",
    { places: ["PMI"], start: "2027-08-02", end: "2027-08-16", nights: 14, party: [2, 3, 0], likes: ["beach"] }],
  ["en", "Just me, a cheap city break in Berlin next month",
    { places: ["BER"], months: [11], priority: "price", likes: ["city"] }],
  ["en", "Skiing in Austria in February with 6 friends, chalet",
    { places: ["AT"], months: [2], party: [7, 0, 0], kind: "friends", stay: "home", likes: ["ski"] }],
  ["en", "Fly to Athens, then islands, three weeks in June, a couple",
    { places: ["ATH"], months: [6], nights: 21, party: [2, 0, 0], way: "plane", likes: ["islands"] }],
  ["en", "We already booked our flights to Malta, 1 to 8 May, 2 adults",
    { places: ["MT"], start: "2027-05-01", end: "2027-05-08", booked: ["flights"], party: [2, 0, 0] }],
  ["en", "Train trip through Switzerland, 5 nights, budget 2,500 for the two of us",
    { places: ["CH"], nights: 5, party: [2, 0, 0], budget: [2500, "group", "trip"], way: "train" }],
  ["en", "Somewhere warm in November, any time is fine, 4 people from Manchester",
    { months: [11], party: [4, 0, 0], from: "Manchester", weather: "warm" }],
  ["en", "A quiet week in the Netherlands with a baby and a toddler, by car",
    { places: ["NL"], nights: 7, party: [2, 1, 1], way: "car", likes: ["hidden"] }],
  ["en", "Copenhagen and Stockholm, 2 nights each, bed and breakfast, from Hamburg",
    { places: ["CPH", "ARN"], stay: "room", from: "Hamburg" }],

  ["nl", "Een week naar Portugal met mijn vriendin in mei, strand en lekker eten, vanuit Gent, rond de 1500 euro",
    { places: ["PT"], months: [5], nights: 7, party: [2, 0, 0], kind: "couple", likes: ["beach", "food"], from: "Gent", budget: [1500, "group", "trip"] }],
  ["nl", "Met ons gezin met 3 kinderen en een baby 10 nachten naar Frankrijk in juli",
    { places: ["FR"], months: [7], nights: 10, party: [2, 3, 1], kind: "family" }],
  ["nl", "Van 3 tot 10 augustus naar Rome met z'n tweeën, hotel 3 sterren",
    { places: ["FCO"], start: "2027-08-03", end: "2027-08-10", party: [2, 0, 0], stay: "hotel3" }],
  ["nl", "Goedkoop weekend Barcelona met 4 vrienden in maart, we hebben de vluchten al geboekt",
    { places: ["BCN"], months: [3], nights: 2, party: [5, 0, 0], booked: ["flights"], priority: "price" }],
  ["nl", "Twee weken rondreis met de auto door Noorwegen deze zomer, wandelen en meren",
    { places: ["NO"], months: [6, 7, 8], nights: 14, way: "car", likes: ["hiking", "lakes"] }],
  ["nl", "Alleen op stap naar Kroatië of Slovenië in september, vertrek uit Eindhoven met de trein",
    { places: ["HR", "SI"], months: [9], party: [1, 0, 0], from: "Eindhoven", way: "train" }],
  ["nl", "We zijn met 5, budget 400 euro per persoon, ergens in Spanje in oktober",
    { places: ["ES"], months: [10], party: [5, 0, 0], budget: [400, "person", "trip"] }],
  ["nl", "Lang weekend Wenen in december, luxe, met mijn man",
    { places: ["VIE"], months: [12], nights: 3, party: [2, 0, 0], priority: "comfort" }],
  ["nl", "Vakantiewoning in Italië voor 2 volwassenen en 2 kinderen, 14 nachten, zonder auto",
    { places: ["IT"], nights: 14, party: [2, 2, 0], stay: "home" }],
  ["nl", "Stedentrip Praag en Boedapest, 6 dagen, cultuur en uitgaan",
    { places: ["PRG", "BUD"], nights: 5, likes: ["city", "culture", "nightlife"] }],
  ["nl", "Skiën in Oostenrijk in februari met 6 vrienden",
    { places: ["AT"], months: [2], party: [7, 0, 0], likes: ["ski"] }],
  ["nl", "Wij zijn met z'n vieren, een week Griekenland, eilanden, eind juni",
    { places: ["GR"], months: [6], nights: 7, party: [4, 0, 0], likes: ["islands"] }],
  ["nl", "Een goedkope stedentrip naar Berlijn volgende maand, alleen",
    { places: ["BER"], months: [11], party: [1, 0, 0], priority: "price", likes: ["city"] }],
  ["nl", "Van 1 tot 8 mei naar Malta, vluchten zijn geboekt, 2 volwassenen",
    { places: ["MT"], start: "2027-05-01", end: "2027-05-08", booked: ["flights"], party: [2, 0, 0] }],
  ["nl", "Met de trein naar Zwitserland, 5 nachten, 2500 euro samen",
    { places: ["CH"], nights: 5, budget: [2500, "group", "trip"], way: "train" }],
  ["nl", "Ergens warm in november, maakt niet uit wanneer, met 4 vanuit Antwerpen",
    { months: [11], party: [4, 0, 0], from: "Antwerpen", weather: "warm" }],
  ["nl", "Een rustige week in Denemarken met een baby, met de auto",
    { places: ["DK"], nights: 7, party: [2, 0, 1], way: "car" }],
  ["nl", "Kopenhagen en Stockholm, bed and breakfast, 4 nachten",
    { places: ["CPH", "ARN"], nights: 4, stay: "room" }],
  ["nl", "Fietsen in Nederland, 3 dagen, met mijn vrouw en zoon",
    { places: ["NL"], nights: 2, party: [2, 1, 0], likes: ["cycling"] }],
  ["nl", "Toscane met het gezin, appartement, 2 weken in juli, 100 euro per dag per persoon",
    { months: [7], nights: 14, kind: "family", budget: [100, "person", "day"], stay: "home" }],
  ["nl", "Een weekend Parijs met de bus, niets geboekt",
    { places: ["CDG"], nights: 2, way: "bus", booked: [] }],

  ["fr", "Une semaine au Portugal avec ma femme en mai, plages et bonne cuisine, au départ de Bruxelles",
    { places: ["PT"], months: [5], nights: 7, party: [2, 0, 0], likes: ["beach", "food"], from: "Bruxelles" }],
  ["fr", "En famille avec deux enfants et un bébé, 10 nuits en Espagne cet été",
    { places: ["ES"], months: [6, 7, 8], nights: 10, party: [2, 2, 1], kind: "family" }],
  ["fr", "Du 12 au 19 juin à Prague en couple, environ 900 euros pour nous deux",
    { places: ["PRG"], start: "2027-06-12", end: "2027-06-19", party: [2, 0, 0], budget: [900, "group", "trip"] }],
  ["fr", "Week-end à Lisbonne ou Porto pour 4 personnes en mars, 300 € par personne",
    { places: ["LIS", "OPO"], months: [3], nights: 2, party: [4, 0, 0], budget: [300, "person", "trip"] }],
  ["fr", "Seul, randonnée en Slovénie en septembre, 5 jours, en train depuis Lille",
    { places: ["SI"], months: [9], nights: 4, party: [1, 0, 0], likes: ["hiking"], from: "Lille", way: "train" }],
  ["fr", "Road trip en Norvège pendant deux semaines, lacs et randonnée",
    { places: ["NO"], nights: 14, way: "car", likes: ["lakes", "hiking"] }],
  ["fr", "Nous sommes 3 amis, une semaine en Croatie en juillet, auberge de jeunesse, vie nocturne",
    { places: ["HR"], months: [7], nights: 7, party: [3, 0, 0], stay: "dorm", likes: ["nightlife"] }],
  ["fr", "Vol déjà réservé pour Rome, hôtel 4 étoiles, 5 nuits en avril",
    { places: ["FCO"], months: [4], nights: 5, booked: ["flights"], stay: "hotel4" }],
  ["fr", "Location de vacances en Italie pour deux adultes et deux enfants, 14 nuits, sans voiture",
    { places: ["IT"], nights: 14, party: [2, 2, 0], stay: "home" }],
  ["fr", "Pas cher, Pologne au printemps, culture et gastronomie",
    { places: ["PL"], months: [3, 4, 5], priority: "price", likes: ["culture", "food"] }],
  ["fr", "Ski en Autriche en février avec 6 amis, chalet",
    { places: ["AT"], months: [2], party: [7, 0, 0], stay: "home", likes: ["ski"] }],
  ["fr", "Une semaine en Grèce fin juin, les îles, en amoureux à deux",
    { places: ["GR"], months: [6], nights: 7, party: [2, 0, 0], likes: ["islands"] }],
  ["fr", "City trip pas cher à Berlin le mois prochain, seul",
    { places: ["BER"], months: [11], party: [1, 0, 0], priority: "price", likes: ["city"] }],
  ["fr", "Du 1er au 8 mai à Malte, vols réservés, deux adultes",
    { places: ["MT"], start: "2027-05-01", end: "2027-05-08", booked: ["flights"], party: [2, 0, 0] }],
  ["fr", "En train vers la Suisse, 5 nuits, 2500 euros pour nous deux",
    { places: ["CH"], nights: 5, budget: [2500, "group", "trip"], way: "train" }],
  ["fr", "Quelque part au chaud en novembre, n'importe quand, 4 personnes depuis Paris",
    { months: [11], party: [4, 0, 0], from: "Paris" }],
  ["fr", "Une semaine au calme au Danemark avec un bébé, en voiture",
    { places: ["DK"], nights: 7, party: [2, 0, 1], way: "car" }],
  ["fr", "Copenhague et Stockholm, chambre d'hôte, 4 nuits",
    { places: ["CPH", "ARN"], nights: 4, stay: "room" }],
  ["fr", "Vélo aux Pays-Bas, 3 jours, avec mon mari et notre fille",
    { places: ["NL"], nights: 2, party: [2, 1, 0], likes: ["cycling"] }],
  ["fr", "Toscane en famille, appartement, deux semaines en juillet, 100 euros par jour par personne",
    { months: [7], nights: 14, kind: "family", budget: [100, "person", "day"], stay: "home" }],

  ["de", "Eine Woche Italien im August mit meiner Frau und zwei Kindern", { places: ["IT"], months: [8], party: [2, 2, 0] }],
  ["de", "Zu zweit nach Wien im Dezember", { places: ["VIE"], months: [12], party: [2, 0, 0] }],
  ["de", "Wir sind 4 Personen, Kroatien im Juli, ab Düsseldorf", { places: ["HR"], months: [7], party: [4, 0, 0], from: "Düsseldorf" }],
  ["de", "Zwei Wochen Griechenland im Juni mit meinem Partner", { places: ["GR"], months: [6], party: [2, 0, 0] }],
  ["de", "Mit der Familie und drei Kindern nach Spanien im Juli", { places: ["ES"], months: [7], party: [2, 3, 0] }],
  ["de", "Allein nach Prag im März", { places: ["PRG"], months: [3], party: [1, 0, 0] }],
  ["es", "Una semana en Portugal en mayo con mi pareja", { places: ["PT"], months: [5], party: [2, 0, 0] }],
  ["es", "Con mi familia y dos niños a España en julio", { places: ["ES"], months: [7], party: [2, 2, 0] }],
  ["es", "Somos 3 amigos, Praga en marzo", { places: ["PRG"], months: [3], party: [3, 0, 0] }],
  ["es", "Dos semanas en Italia en agosto con mi mujer", { places: ["IT"], months: [8], party: [2, 0, 0] }],
  ["es", "Solo a Viena en diciembre", { places: ["VIE"], months: [12], party: [1, 0, 0] }],
  ["it", "Una settimana in Grecia ad agosto con mia moglie", { places: ["GR"], months: [8], party: [2, 0, 0] }],
  ["it", "In famiglia con due bambini, Spagna a luglio", { places: ["ES"], months: [7], party: [2, 2, 0] }],
  ["it", "Siamo 4 persone, Vienna a dicembre", { places: ["VIE"], months: [12], party: [4, 0, 0] }],
  ["it", "Due settimane in Portogallo a giugno, siamo 3 amici", { places: ["PT"], months: [6], party: [3, 0, 0] }],
  ["it", "Da solo a Praga a marzo", { places: ["PRG"], months: [3], party: [1, 0, 0] }],
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Every named field of one case, as [key, want, got, ok]. */
function check(want, r) {
  const F = r.fields;
  const out = [];
  const add = (k, w, g) => out.push([k, w, g, same(w, g)]);
  if (want.places) add("places", want.places, (F.places?.value || []).map((p) => p.id));
  if (want.months) add("months", want.months, F.when?.value?.months);
  if (want.mode) add("mode", want.mode, F.when?.value?.mode);
  if (want.start) add("start", want.start, F.when?.value?.start);
  if (want.end) add("end", want.end, F.when?.value?.end);
  if (want.nights) add("nights", want.nights, F.nights?.value ?? F.when?.value?.nights);
  if (want.party) { const p = F.party?.value; add("party", want.party, p ? [p.adults, p.kids, p.babies] : null); }
  if (want.kind) add("kind", want.kind, F.party?.value?.kind);
  if (want.likes) add("likes", want.likes, F.likes?.value);
  if (want.from) add("from", want.from, F.from?.value?.name);
  if (want.budget) { const b = F.budget?.value; add("budget", want.budget, b ? [b.eur, b.per, b.unit] : null); }
  if (want.booked) add("booked", want.booked, F.booked ? Object.entries(F.booked.value).filter(([, v]) => v).map(([k]) => k) : null);
  for (const k of ["stay", "way", "priority", "weather"]) if (want[k]) add(k, want[k], F[k]?.value);
  return out;
}

test("the corpus is big enough: 60 or more in English, Dutch and French, and the other three", () => {
  const n = (langs) => CORPUS.filter(([l]) => langs.includes(l)).length;
  assert.ok(n(["en", "nl", "fr"]) >= 60, `en, nl and fr: ${n(["en", "nl", "fr"])}`);
  for (const l of ["en", "nl", "fr"]) assert.ok(n([l]) >= 20, `${l}: ${n([l])}`);
  for (const l of ["de", "es", "it"]) {
    const cases = CORPUS.filter(([x]) => x === l);
    assert.ok(cases.length >= 5, `${l}: ${cases.length}`);
    assert.ok(cases.every(([, , w]) => w.months && w.party && w.places), `${l} cases each name month, people and places`);
  }
});

test("every field of every corpus sentence reads right", { skip: !HAVE && "public/app_data.json not on this machine" }, () => {
  const misses = [];
  let fields = 0;
  for (const [lang, text, want] of CORPUS) {
    const r = read(lang, text);
    const checks = check(want, r);
    fields += checks.length;
    if (process.env.PARSE_TRIP_VERBOSE) console.log(lang, text, JSON.stringify(Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, v.value]))));
    for (const [k, w, g, ok] of checks) if (!ok) misses.push(`${lang} "${text}": ${k} want ${JSON.stringify(w)} got ${JSON.stringify(g)}`);
  }
  assert.ok(fields >= 300, `named fields: ${fields}`);
  assert.deepEqual(misses, []);
});

test("every field keeps where it came from: the words, and which words", { skip: !HAVE && "no catalogue" }, () => {
  const r = read("en", "A week in Portugal with my partner in May, from Ghent, around 1,500 euro");
  for (const f of Object.values(r.fields)) assert.equal(f.from, "words");
  assert.equal(r.fields.from.said, "from Ghent");
  assert.equal(r.fields.party.said, "my partner");
  assert.match(r.fields.when.said, /May/);
  assert.equal(r.fields.places.said, "Portugal");
});

test("without the catalogue: months, nights and people in all six languages", () => {
  const cases = [
    ["en", "two adults and a baby in July for 10 nights", [7], 10, [2, 0, 1]],
    ["nl", "met 2 volwassenen en 2 kinderen in augustus, een week", [8], 7, [2, 2, 0]],
    ["fr", "deux adultes et un enfant en juin, 5 nuits", [6], 5, [2, 1, 0]],
    ["de", "zwei Erwachsene und ein Kind im Juni, 5 Nächte", [6], 5, [2, 1, 0]],
    ["es", "dos adultos y dos niños en agosto, una semana", [8], 7, [2, 2, 0]],
    ["it", "due adulti e un bambino a settembre, 4 notti", [9], 4, [2, 1, 0]],
  ];
  for (const [lang, text, months, nights, party] of cases) {
    const r = parseTrip(text, { lang, today: TODAY });
    assert.deepEqual(r.fields.when?.value?.months, months, `${lang} months`);
    assert.equal(r.fields.nights?.value, nights, `${lang} nights`);
    const p = r.fields.party?.value;
    assert.deepEqual(p && [p.adults, p.kids, p.babies], party, `${lang} party`);
  }
});

test("words inside other words and soft month names do not fire", () => {
  const r = parseTrip("best season for a city, I may come", { lang: "en", today: TODAY });
  assert.equal(r.fields.when, undefined);
  assert.deepEqual(r.fields.likes.value, ["city"]);
  assert.equal(r.fields.likes.from, "words");
  // A day number is not money, and "150 a day" is not one night.
  const d = parseTrip("from 20 to 27 July", { lang: "en", today: TODAY });
  assert.equal(d.fields.budget, undefined);
  assert.equal(d.fields.when.value.start, "2027-07-20");
  assert.equal(d.fields.when.value.nights, 7);
});

test("a date in the past rolls on to next year; an ISO range stays", () => {
  const r = parseTrip("3 to 10 January", { lang: "en", today: TODAY });
  assert.equal(r.fields.when.value.start, "2027-01-03");
  const s = parseTrip("2026-11-14 to 2026-11-21", { lang: "en", today: TODAY });
  assert.equal(s.fields.when.value.start, "2026-11-14");
  assert.equal(s.fields.when.value.end, "2026-11-21");
  assert.equal(s.fields.when.value.nights, 7);
});

test("empty text answers nothing", () => {
  assert.deepEqual(parseTrip("   ", { lang: "en" }), { text: "", fields: {} });
  assert.deepEqual(answeredBy(parseTrip("", {})), []);
});

test("applyTrip writes what the words gave, never a kept screen's answer", () => {
  const s = defaultSettings();
  const parsed = parseTrip("a week in July with my wife and two kids, cheap, 2000 euro for all of us, hostel", { lang: "en", today: TODAY });
  const all = applyTrip(s, parsed);
  assert.deepEqual(all.patch.party.adults, 2);
  assert.deepEqual(all.patch.party.kids, 2);
  assert.deepEqual(all.patch.when.months, [7]);
  assert.equal(all.patch.priority, "price");
  // 2000 for a group of four is 500 a person, the figure the budget question holds.
  assert.deepEqual(all.patch.guide.budget, { kind: "total", per: "group", groupEur: 2000, eur: 500 });
  assert.equal(all.choices.stay_tier, "dorm");
  assert.deepEqual(all.answered.sort(), ["g:budget", "priority", "sleep", "when", "who"].sort());
  const kept = applyTrip(s, parsed, { keep: ["who", "sleep"] });
  assert.equal(kept.patch.party, undefined);
  assert.equal(kept.choices.stay_tier, undefined);
  assert.ok(!kept.answered.includes("who"));
});

test("placeCountries names each country once, towns by their country", () => {
  assert.deepEqual(placeCountries([
    { kind: "place", id: "LIS", country: "Portugal" }, { kind: "place", id: "OPO", country: "Portugal" }, { kind: "country", id: "ES", country: "Spain" },
  ]), ["Portugal", "Spain"]);
});

test("row T856-c: each answer keeps its source; words typed again replace only their own", () => {
  let s = defaultSettings();
  s = markAnswered(s, "tell", "words");
  s = markAnswered(s, "who", "words");
  s = markAnswered(s, "when", "words");
  assert.deepEqual(s.sources, { tell: "words", who: "words", when: "words" });
  // The When screen later confirms the month: that answer is now the screen's.
  s = answer(s, "when", { when: { mode: "months", months: [7], nights: 7 } });
  assert.equal(s.sources.when, undefined);
  assert.deepEqual(screenGiven(s), ["when"]);
  assert.deepEqual(screenAnswered(s), ["when"]);
  // The sources survive a save; a junk source is dropped.
  const back = normalizeSettings(JSON.parse(JSON.stringify({ ...s, sources: { ...s.sources, x: "magic" } })));
  assert.deepEqual(back.sources, { tell: "words", who: "words" });
  // Marking again with the same source changes nothing.
  assert.equal(markAnswered(back, "who", "words"), back);
});

test("named places are kept on the settings, at most six, each once", () => {
  const s = normalizeSettings({ places: [
    { kind: "country", id: "PT", name: "Portugal", country: "Portugal" },
    { kind: "country", id: "PT", name: "Portugal" },
    { kind: "place", id: "LIS", name: "Lisbon", iso2: "pt", country: "Portugal" },
    { kind: "planet", id: "x" }, null,
  ] });
  assert.deepEqual(s.places.map((p) => [p.kind, p.id, p.iso2]), [["country", "PT", "PT"], ["place", "LIS", "PT"]]);
  assert.deepEqual(defaultSettings().places, []);
});
