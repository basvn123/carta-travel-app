// T1076 (K2): the page quality bar, the noindex,follow head and the sitemap gate.
import test from "node:test";
import assert from "node:assert/strict";
import { placeBar, trailBar, pageBar, words, internalLinks, introWords, hasYearOfClimate } from "../scripts/prerender/quality.mjs";
import { renderPage } from "../scripts/prerender/html.mjs";
import { select } from "../scripts/prerender/sitemap.mjs";

const w = (n, p = "w") => Array.from({ length: n }, (_, i) => `${p}${i}`).join(" ");
const months = Array.from({ length: 12 }, () => [10, 2, 50, 40]);
const links = (n) => ({ h2: "x", links: Array.from({ length: n }, (_, i) => ({ name: `L${i}`, path: `/l/${i}` })) });

const goodDos = () => ({ intro: { short: w(30, "s"), body: w(130) }, when: { normals: months } });
const goodPlace = () => ({
  kind: "dest", path: "/spain/malaga",
  image: { src: "https://x/p.jpg", licence: "CC BY-SA 4.0" },
  facts: [{ label: "Bed, a night" }, { label: "Food, a day" }, { label: "Carta score" }],
  sections: [links(4)], crumbs: [{ name: "Home", path: "/" }, { name: "Spain", path: "/spain" }],
});

test("place bar: a complete place passes", () => {
  const b = placeBar(goodPlace(), goodDos());
  assert.equal(b.ok, true);
});

for (const [name, mutate, test_] of [
  ["no licensed photo", (p) => { p.image = { src: "x" }; }, "photo"],
  ["no photo at all", (p) => { p.image = null; }, "photo"],
  ["no bed price", (p) => { p.facts = p.facts.filter((f) => f.label !== "Bed, a night"); }, "price"],
  ["no food price", (p) => { p.facts = p.facts.filter((f) => f.label !== "Food, a day"); }, "price"],
  ["no rating", (p) => { p.facts = p.facts.filter((f) => f.label !== "Carta score"); }, "rating"],
  ["four links only", (p) => { p.sections = [links(1)]; }, "links"],
]) {
  test(`place bar: ${name} fails the ${test_} test`, () => {
    const p = goodPlace(); mutate(p);
    const b = placeBar(p, goodDos());
    assert.equal(b[test_], false);
    assert.equal(b.ok, false);
  });
}

test("place bar: intro needs 120 words, counted once when the body repeats the short intro", () => {
  assert.equal(introWords({ intro: { short: w(30, "s"), body: w(119) } }), 149);
  assert.equal(placeBar(goodPlace(), { ...goodDos(), intro: { short: w(30, "s"), body: w(60) } }).intro, false);
  const short = w(30, "s");
  assert.equal(introWords({ intro: { short, body: `${short} ${w(80)}` } }), 110);
  assert.equal(placeBar(goodPlace(), { ...goodDos(), intro: { short, body: `${short} ${w(80)}` } }).ok, false);
  assert.equal(introWords({}), 0);
});

test("place bar: climate needs twelve months with temperatures", () => {
  assert.equal(hasYearOfClimate({ when: { normals: months } }), true);
  assert.equal(hasYearOfClimate({ when: { normals: months.slice(0, 11) } }), false);
  assert.equal(hasYearOfClimate({ when: { normals: [...months.slice(0, 11), [null, null]] } }), false);
  assert.equal(hasYearOfClimate({}), false);
});

test("internal links counts distinct paths and ignores the page itself", () => {
  const p = { path: "/a", crumbs: [{ path: "/" }, { path: "/a" }], sections: [{ links: [{ path: "/b" }, { path: "/b" }, { path: "/c" }] }, null] };
  assert.equal(internalLinks(p), 3);
});

const goodTrail = () => ({
  kind: "trail", path: "/austria/trails/1234-x", lead: [w(40)], sections: [{ paras: [w(30)] }],
  facts: ["Distance", "Climb", "Difficulty", "Season"].map((label) => ({ label })),
});
const goodRow = () => ({ id: 1234, img: { u: "https://x/t.jpg", lic: "CC BY" }, bbox: [1, 2, 3, 4] });
const linked = new Set(["AT/1234"]);

test("trail bar: a complete trail passes", () => {
  assert.equal(trailBar(goodTrail(), goodRow(), "AT", linked).ok, true);
});

for (const [name, mut, key] of [
  ["photo without a licence", (p, r) => { r.img = { u: "x" }; }, "photo"],
  ["59 words of prose", (p) => { p.lead = [w(29)]; }, "prose"],
  ["no length", (p) => { p.facts = p.facts.filter((f) => f.label !== "Distance"); }, "length"],
  ["no climb", (p) => { p.facts = p.facts.filter((f) => f.label !== "Climb"); }, "climb"],
  ["no difficulty", (p) => { p.facts = p.facts.filter((f) => f.label !== "Difficulty"); }, "difficulty"],
  ["no bounding box", (p, r) => { r.bbox = null; }, "map"],
  ["no season", (p) => { p.facts = p.facts.filter((f) => f.label !== "Season"); }, "season"],
]) {
  test(`trail bar: ${name} fails the ${key} test`, () => {
    const p = goodTrail(); const r = goodRow(); mut(p, r);
    const b = trailBar(p, r, "AT", linked);
    assert.equal(b[key], false);
    assert.equal(b.ok, false);
  });
}

test("trail bar: no destination page linking to it fails the place test", () => {
  assert.equal(trailBar(goodTrail(), goodRow(), "AT", new Set()).place, false);
  assert.equal(trailBar(goodTrail(), goodRow(), "AT", null).ok, false);
});

test("pageBar applies to places and trails only", () => {
  assert.equal(pageBar({ kind: "beach" }, {}), null);
  assert.equal(pageBar({ kind: "dest" }, {}), null);
  assert.ok(pageBar(goodPlace(), { dos: goodDos() }));
});

const model = (extra = {}) => ({
  kind: "dest", path: "/spain/malaga", title: "Malaga", description: "d", h1: "Malaga",
  crumbs: [{ name: "Home", path: "/" }], facts: [], ...extra,
});

test("a page below the bar ships noindex,follow with a canonical; an indexable page has no robots tag", () => {
  const thin = renderPage(model({ noindex: true }));
  assert.match(thin, /<meta name="robots" content="noindex,follow">/);
  assert.match(thin, /<link rel="canonical" href="https:\/\/www\.carta-europetravel\.com\/spain\/malaga">/);
  assert.doesNotMatch(renderPage(model()), /name="robots"/);
});

test("JSON-LD carries a BreadcrumbList and only the subject fields the model gives", () => {
  const html = renderPage(model({ subject: { "@type": "TouristDestination", name: "Malaga" } }));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1].replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"));
  const types = ld["@graph"].map((n) => n["@type"]);
  assert.ok(types.includes("BreadcrumbList"));
  assert.ok(types.includes("TouristDestination"));
  assert.doesNotMatch(JSON.stringify(ld), /aggregateRating|"offers"|"review"/);
});

test("sitemap: a page below the bar stays out, with its own reason; hubs stay in", () => {
  const pages = [
    { kind: "dest", path: "/a/ok", indexable: true, canonical: "/a/ok", bar: { ok: true } },
    { kind: "dest", path: "/a/thin", indexable: false, canonical: "/a/thin", bar: { ok: false, intro: false } },
    { kind: "trail", path: "/a/trails/1-x", indexable: false, canonical: "/a/trails/1-x", bar: { ok: false } },
    { kind: "country", path: "/a", indexable: true, canonical: "/a" },
    { kind: "region", path: "/a/r", indexable: true, canonical: "/a/r" },
  ];
  const { groups, summary } = select(pages);
  assert.deepEqual([...groups.keys()].sort(), ["countries", "destinations"]);
  assert.equal(summary.listed, 3);
  assert.equal(summary.excluded.dest["below the quality bar"], 1);
  assert.equal(summary.excluded.trail["below the quality bar"], 1);
  assert.equal(words("a b  c"), 3);
});
