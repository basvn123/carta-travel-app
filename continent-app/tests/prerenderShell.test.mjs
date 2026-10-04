// The prerender contract (T221). Run: npm test (from continent-app/).
// Pins src/lib/prerenderShell.js (keys, routes, splice) and the destination
// half of src/lib/pathBoot.js (the carta:boot tag the prerendered page carries).
import test from "node:test";
import assert from "node:assert/strict";
import {
  prerenderKey, cardKey, sitemapKey, routesJson, spliceShell, pageIsNoindex,
  HEAD_OPEN, HEAD_CLOSE, BODY_OPEN, BODY_CLOSE,
} from "../src/lib/prerenderShell.js";
import { paths, parsePath, legacyHashToPath } from "../src/lib/urlScheme.js";
import { bootPaths } from "../src/lib/pathBoot.js";
import { daysPlan, DAYS_MIN_PLACES, pageFloor } from "../scripts/prerender/floor.mjs";

test("every page kind has a key, and the key carries the id and never the slug", () => {
  assert.equal(prerenderKey("/austria"), "en/austria.html");
  assert.equal(prerenderKey("/spain/malaga"), "en/spain/malaga.html");
  assert.equal(prerenderKey("/spain/trails"), "en/spain/trails.html");
  assert.equal(prerenderKey("/spain/trails/3"), "en/spain/trails/p3.html");
  assert.equal(prerenderKey("/spain/trails/176172-estels-del-sud"), "en/spain/trails/176172.html");
  assert.equal(prerenderKey("/spain/trails/176172-an-old-title"), "en/spain/trails/176172.html");
  assert.equal(prerenderKey("/spain/cycling/56578-galisteo-caceres"), "en/spain/cycling/56578.html");
  assert.equal(prerenderKey("/belgium/cycling/tours/be-ravel-w4-canaux-fleuves-et-rivieres-balanced"),
    "en/belgium/cycling/tours/be-ravel-w4-canaux-fleuves-et-rivieres-balanced.html");
  assert.equal(prerenderKey(paths.beach("AL", "al-beach-of-durres-Q3302169")), "en/albania/beaches/al-beach-of-durres-q3302169.html");
  assert.equal(prerenderKey(paths.lake("AT", "at-attersee-Q698516")), "en/austria/lakes/at-attersee-q698516.html");
  assert.equal(prerenderKey(paths.mountain("AT", "at-zugspitze-Q3375")), "en/austria/mountains/at-zugspitze-q3375.html");
  assert.equal(prerenderKey("/austria/regions/at11--burgenland"), "en/austria/regions/at11.html");
  assert.equal(prerenderKey("/trips/at-salzburg-vienna-chain-6d"), "en/trips/at-salzburg-vienna-chain-6d.html");
  assert.equal(prerenderKey("/journeys/ad-hiking-coma-pedrosa-madriu"), "en/journeys/ad-hiking-coma-pedrosa-madriu.html");
  // T224: the week sits under its destination, the trip-length pages under the country.
  assert.equal(prerenderKey("/spain/malaga/cost"), "en/spain/malaga/cost.html");
  assert.equal(prerenderKey("/spain/4-days"), "en/spain/4-days.html");
  assert.equal(prerenderKey("/spain/4-day"), "en/spain/4-days.html");
  assert.equal(prerenderKey("/spain/4-days/under-60"), "en/spain/4-days/under-60.html");
  // T225: the itemised week of a trip sits under the trip.
  assert.equal(prerenderKey("/trips/at-salzburg-vienna-chain-6d/receipt"), "en/trips/at-salzburg-vienna-chain-6d/receipt.html");
  assert.equal(prerenderKey(paths.receipt("a-b-chain-7d")), "en/trips/a-b-chain-7d/receipt.html");
  assert.deepEqual(parsePath("/trips/a-b/receipt"), { kind: "receipt", id: "a-b", lang: "en" });
  assert.equal(parsePath("/trips/a-b/other"), null);
  assert.equal(prerenderKey(paths.days("PT", 7, 80)), "en/portugal/7-days/under-80.html");
});

test("a list page and a low trail id never share a key", () => {
  assert.notEqual(prerenderKey("/switzerland/trails/4"), prerenderKey("/switzerland/trails/4-gurbetaler-hohenweg"));
});

test("a legacy hash for a short trail or cycling id lands on its page, not on a list page", () => {
  const trail = legacyHashToPath("#trail=5134&tc=CH");
  assert.equal(trail, "/switzerland/trails/5134-trail");
  assert.equal(parsePath(trail).kind, "trail");
  assert.equal(prerenderKey(trail), "en/switzerland/trails/5134.html");
  const ride = legacyHashToPath("#cycle=535&cc=AT");
  assert.equal(parsePath(ride).kind, "cycle");
  assert.equal(legacyHashToPath("#trail=176172&tc=ES"), "/spain/trails/176172");
});

test("paths with no static page have no key", () => {
  for (const p of ["/", "/guides/abc", "/spain/trails/cost", "/spain/4-days/over-60", "/spain/4-days/under-60/x", "/nl/spain", "/Spain",
    "/assets/index.js", "/spain/trails/176172-x/extra", "/nowhere"]) {
    assert.equal(prerenderKey(p), null, p);
  }
});

test("a card key mirrors its page key and refuses anything else", () => {
  assert.equal(cardKey("/og/p/en/austria/lakes/at-attersee-q698516.png"), "og/en/austria/lakes/at-attersee-q698516.png");
  assert.equal(cardKey("/og/site.png"), null);
  assert.equal(cardKey("/og/p/../secret.png"), null);
  assert.equal(cardKey("/og/p/en/austria.html"), null);
});

test("sitemapKey maps only the generated sitemap names", () => {
  assert.equal(sitemapKey("/sitemap.xml"), "sitemaps/sitemap.xml");
  assert.equal(sitemapKey("/sitemap-trails-en.xml"), "sitemaps/sitemap-trails-en.xml");
  assert.equal(sitemapKey("/sitemap-trails-en-2.xml"), "sitemaps/sitemap-trails-en-2.xml");
  for (const p of ["/sitemap-x.xml", "/sitemap-trails-en.xml/", "/a/sitemap.xml", "/sitemap-../x-en.xml", "/sitemap.txt", null]) assert.equal(sitemapKey(p), null, String(p));
});

test("_routes.json stays inside the Pages limits and catches no static path", () => {
  const r = routesJson();
  assert.ok(r.include.length + r.exclude.length <= 100);
  assert.ok(r.include.every((x) => x.length <= 100));
  const hit = (p) => r.include.some((x) => (x.endsWith("*") ? p.startsWith(x.slice(0, -1)) : p === x));
  for (const p of ["/austria", "/austria/trails/1-x", "/trips/a", "/journeys/b", "/og/p/en/austria.png", "/sitemap.xml", "/sitemap-trails-en.xml"]) assert.ok(hit(p), p);
  for (const p of ["/", "/index.html", "/assets/x.js", "/boot.json", "/og/site.png", "/sw.js", "/fonts/a.ttf"]) assert.ok(!hit(p), p);
});

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>What a day in Europe costs, place by place | Carta</title>
    <meta name="description" content="shell" />
    <link rel="canonical" href="https://www.carta-europetravel.com/" />
    <meta property="og:site_name" content="Carta" />
    <meta property="og:title" content="shell" />
    <meta property="og:image:alt" content="shell" />
    <meta name="twitter:title" content="shell" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
const PAGE = `<!doctype html><html lang="en"><head>${HEAD_OPEN}<title>Attersee | Carta</title><meta name="description" content="A lake for $1 and $&amp;.">${HEAD_CLOSE}</head><body>${BODY_OPEN}<main class="pr"><h1>Attersee $&</h1></main>${BODY_CLOSE}</body></html>`;

test("a page is laid into the shell: its tags replace the shell's, the app script stays", () => {
  const out = spliceShell(SHELL, PAGE);
  assert.equal((out.match(/<title>/g) || []).length, 1);
  assert.ok(out.includes("<title>Attersee | Carta</title>"));
  assert.ok(!out.includes('content="shell"'));
  assert.ok(out.includes('og:site_name'));
  assert.ok(out.includes('<script type="module" crossorigin src="/assets/index-abc.js"></script>'));
  assert.ok(out.includes(`<div id="root">${BODY_OPEN}<main class="pr"><h1>Attersee $&</h1></main>${BODY_CLOSE}</div>`));
});

test("a broken page or a shell without an empty root is refused, never half served", () => {
  assert.equal(spliceShell(SHELL, "<html><title>x</title></html>"), null);
  assert.equal(spliceShell(SHELL.replace('<div id="root"></div>', '<div id="root">x</div>'), PAGE), null);
});

test("noindex is read from the page head only", () => {
  assert.equal(pageIsNoindex(PAGE), false);
  assert.equal(pageIsNoindex(PAGE.replace(HEAD_CLOSE, `<meta name="robots" content="noindex">${HEAD_CLOSE}`)), true);
  assert.equal(pageIsNoindex(PAGE.replace(BODY_CLOSE, `<meta name="robots" content="noindex">${BODY_CLOSE}`)), false);
});

test("a trip-length page exists only above the floor and never copies another", () => {
  const five = [40, 45, 55, 70, 90];
  assert.deepEqual(daysPlan(five.slice(0, DAYS_MIN_PLACES - 1), [4], [60]), []);
  // Every place is under 100, so that budget would copy the plain page.
  assert.deepEqual(daysPlan([40, 45, 55, 70, 75, 95, 99, 120, 130, 140], [4], [60, 80, 100]).map((e) => e.band), [null, 80]);
  // 60 lists 3 (below the floor), 80 lists 6, 100 adds one place over 80.
  assert.deepEqual(daysPlan([40, 45, 55, 61, 70, 75, 85, 120, 130, 140], [3, 7], [60, 80, 100]).map((e) => `${e.days}/${e.band}`),
    ["3/null", "3/80", "7/null", "7/80"]);
  // A budget nearly every place meets is not a page (Austria: 52 of 53 under 100).
  assert.deepEqual(daysPlan([...Array(52).fill(90), 120], [4], [100]).map((e) => e.band), [null]);
});

test("a cost page meets the floor only with a figure measured in or near the town", () => {
  const page = { kind: "cost", title: "A week in X", h1: "X", subject: { geo: { latitude: 1, longitude: 2 } },
    image: { src: "a.jpg", licence: "CC BY 4.0" }, facts: [1, 2, 3] };
  assert.equal(pageFloor({ ...page, measured: true }).ok, true);
  assert.equal(pageFloor({ ...page, measured: false }).ok, false);
  assert.equal("measured" in pageFloor({ ...page, kind: "dest" }), false);
});

function fakeBoot(pathname, meta) {
  const calls = [];
  const loc = { pathname, hash: "", search: "", replace: (u) => calls.push(["replace", u]) };
  const hist = { replaceState: (a, b, u) => calls.push(["replaceState", u]) };
  const doc = { querySelector: (sel) => (meta && sel === 'meta[name="carta:boot"]' ? { getAttribute: () => meta } : null) };
  return { result: bootPaths(loc, hist, false, doc), calls };
}

test("a destination path opens its destination when the prerendered page names the id", () => {
  assert.deepEqual(fakeBoot("/spain/malaga", "#dest=AGP"), { result: "path-to-hash", calls: [["replaceState", "/#dest=AGP"]] });
  assert.deepEqual(fakeBoot("/austria/achensee", "#dest=gem%3Aachensee").calls, [["replaceState", "/#dest=gem%3Aachensee"]]);
  // T224: the week page opens the same destination.
  assert.deepEqual(fakeBoot("/spain/malaga/cost", "#dest=AGP").calls, [["replaceState", "/#dest=AGP"]]);
});

test("a receipt path opens the trip it prices", () => {
  assert.deepEqual(fakeBoot("/trips/a-b-chain-7d/receipt", null).calls, [["replaceState", "/#itin=a-b-chain-7d"]]);
});

test("without the tag, or with anything but a #dest= value, a destination path is left alone", () => {
  assert.deepEqual(fakeBoot("/spain/malaga", null), { result: "none", calls: [] });
  for (const bad of ["#trail=1", "#dest=AGP&x=1", "javascript:alert(1)", "#dest=<b>"]) {
    assert.deepEqual(fakeBoot("/spain/malaga", bad).calls, [], bad);
  }
  // The tag never overrides a path that already maps to a hash.
  assert.deepEqual(fakeBoot("/austria/trails/20050-x", "#dest=AGP").calls[0][1].startsWith("/#trail=20050"), true);
});
