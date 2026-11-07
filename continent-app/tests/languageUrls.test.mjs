// T1212 (ROADMAP I12): language in the URL. The router half (langPath.js,
// pathBoot.js), the prerender contract (prerenderShell.js), the language
// pages (scripts/prerender/langs.mjs, strings.mjs, html.mjs), the hreflang set
// and the sitemap per language, plus one small build over the tracked wire.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { langFromPath, stripLang, withLang, langRoot } from "../src/lib/langPath.js";
import { bootPaths } from "../src/lib/pathBoot.js";
import {
  prerenderKey, sitemapKey, routesJson, isLangShellPath, LANG_PAGE_KINDS, PRERENDER_LANGS,
} from "../src/lib/prerenderShell.js";
import {
  LANGS, REVIEWED, isReviewed, parseReviewed, localizePath, langVariant, hreflangLinks,
} from "../scripts/prerender/langs.mjs";
import { STRINGS, S, countryIn, monthIn } from "../scripts/prerender/strings.mjs";
import { renderPage, ORIGIN } from "../scripts/prerender/html.mjs";
import { select, writeSitemaps } from "../scripts/prerender/sitemap.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ------------------------------------------------------------- the router

test("langPath reads, strips and writes the prefix", () => {
  assert.equal(langFromPath("/nl/"), "nl");
  assert.equal(langFromPath("/de"), "de");
  assert.equal(langFromPath("/it/spain/malaga"), "it");
  assert.equal(langFromPath("/"), null);
  assert.equal(langFromPath("/en/"), null);
  assert.equal(langFromPath("/nlx/"), null);
  assert.equal(langFromPath("/netherlands"), null);
  assert.equal(stripLang("/fr/spain/malaga"), "/spain/malaga");
  assert.equal(stripLang("/fr"), "/");
  assert.equal(stripLang("/"), "/");
  assert.equal(withLang("/", "nl"), "/nl/");
  assert.equal(withLang("/de/", "nl"), "/nl/");
  assert.equal(withLang("/nl/", "en"), "/");
  assert.equal(withLang("/spain/malaga", "es"), "/es/spain/malaga");
  assert.equal(withLang("/es/spain/malaga", "en"), "/spain/malaga");
  assert.equal(withLang("/", "pt"), "/");
  assert.equal(langRoot("en"), "/");
  assert.equal(langRoot("fr"), "/fr/");
});

function boot(pathname, search = "", hash = "", doc) {
  const calls = [];
  const loc = { pathname, search, hash, replace: (u) => calls.push(["replace", u]) };
  const hist = { replaceState: (_s, _t, u) => calls.push(["replaceState", u]) };
  return { result: bootPaths(loc, hist, false, doc), calls };
}

test("pathBoot keeps the language prefix when it opens a content path", () => {
  const r = boot("/nl/spain/trails/176172-estels-del-sud");
  assert.equal(r.result, "path-to-hash");
  assert.deepEqual(r.calls, [["replaceState", "/nl/#trail=176172&tc=ES"]]);
  const en = boot("/spain/trails/176172-estels-del-sud");
  assert.deepEqual(en.calls, [["replaceState", "/#trail=176172&tc=ES"]]);
  const doc = { querySelector: () => ({ getAttribute: () => "#dest=AGP" }) };
  assert.deepEqual(boot("/de/spain/malaga", "", "", doc).calls, [["replaceState", "/de/#dest=AGP"]]);
});

test("pathBoot: the language root is the app, and pricing keeps its language", () => {
  assert.deepEqual(boot("/fr/"), { result: "lang-root", calls: [] });
  assert.deepEqual(boot("/fr", "?a=1", "#x"), { result: "lang-root", calls: [["replaceState", "/fr/?a=1#x"]] });
  assert.deepEqual(boot("/it/pricing").calls, [["replaceState", "/it/?tab=pricing"]]);
  assert.deepEqual(boot("/pricing").calls, [["replaceState", "/?tab=pricing"]]);
});

// --------------------------------------------------- the prerender contract

test("language pages have keys for destinations, trips and journeys only", () => {
  assert.deepEqual([...PRERENDER_LANGS], ["en", "nl", "de", "fr", "es", "it"]);
  assert.deepEqual([...LANG_PAGE_KINDS], ["dest", "trip", "journey"]);
  assert.equal(prerenderKey("/nl/spain/malaga"), "nl/spain/malaga.html");
  assert.equal(prerenderKey("/de/trips/at-salzburg-vienna-chain-6d"), "de/trips/at-salzburg-vienna-chain-6d.html");
  assert.equal(prerenderKey("/it/journeys/ad-hiking"), "it/journeys/ad-hiking.html");
  for (const p of ["/nl/spain", "/nl/spain/trails/176172-x", "/fr/spain/malaga/cost", "/es/spain/beaches/es-x-q1", "/nl/", "/en/spain/malaga"]) {
    assert.equal(prerenderKey(p), null, p);
  }
  assert.equal(prerenderKey("/spain/malaga"), "en/spain/malaga.html");
});

test("sitemap keys and routes cover the five languages", () => {
  assert.equal(sitemapKey("/sitemap-destinations-nl.xml"), "sitemaps/sitemap-destinations-nl.xml");
  assert.equal(sitemapKey("/sitemap-trips-it-2.xml"), "sitemaps/sitemap-trips-it-2.xml");
  assert.equal(sitemapKey("/sitemap-trips-pt.xml"), null);
  const r = routesJson();
  for (const l of LANGS) assert.ok(r.include.includes(`/${l}/*`), l);
  assert.ok(r.include.includes("/api/*"));
  assert.ok(r.include.length + r.exclude.length <= 100);
  const onDisk = JSON.parse(fs.readFileSync(path.join(APP, "public", "_routes.json"), "utf8"));
  assert.deepEqual(onDisk, r, "public/_routes.json must equal routesJson()");
});

test("the Function answers the shell for any language address, nothing else", () => {
  for (const p of ["/nl", "/nl/", "/de/spain/trails/1-x", "/it/?tab=x"]) assert.ok(isLangShellPath(p), p);
  for (const p of ["/", "/netherlands", "/nlx", "/en/", "/spain/malaga", "/assets/nl/x.js"]) assert.ok(!isLangShellPath(p), p);
});

test("_redirects gives each language root the app shell", () => {
  const red = fs.readFileSync(path.join(APP, "public", "_redirects"), "utf8");
  for (const l of LANGS) {
    assert.match(red, new RegExp(`^/${l}\\s+/\\s+200$`, "m"), l);
    assert.match(red, new RegExp(`^/${l}/\\*\\s+/\\s+200$`, "m"), l);
  }
});

// ------------------------------------------------------- language pages

test("every language carries every chrome string, with the same slots and no dashes", () => {
  const slots = (v) => [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(STRINGS[l]).sort(), Object.keys(STRINGS.en).sort(), l);
    for (const [k, v] of Object.entries(STRINGS[l])) {
      assert.ok(v && !/[–—]/.test(v), `${l}.${k}`);
      assert.equal(slots(v), slots(STRINGS.en[k]), `${l}.${k}`);
    }
  }
  assert.equal(S("nl", "walksH", { name: "Gent" }), "Wandelingen bij Gent");
  assert.equal(S("pt", "walksH", { name: "Gent" }), "Walks near Gent");
  assert.equal(countryIn("de", "ES"), "Spanien");
  assert.equal(monthIn("fr", 6), "juin");
});

test("localizePath moves only kinds that have a language page", () => {
  assert.equal(localizePath("/", "nl"), "/nl/");
  assert.equal(localizePath("/spain/malaga", "nl"), "/nl/spain/malaga");
  assert.equal(localizePath("/trips/a-b-7d", "de"), "/de/trips/a-b-7d");
  assert.equal(localizePath("/journeys/x", "fr"), "/fr/journeys/x");
  assert.equal(localizePath("/spain", "nl"), "/spain");
  assert.equal(localizePath("/spain/trails/1-x", "nl"), "/spain/trails/1-x");
  assert.equal(localizePath("/spain/malaga/cost", "nl"), "/spain/malaga/cost");
  assert.equal(localizePath("/spain/malaga", "en"), "/spain/malaga");
});

test("a language variant moves its path, canonical, crumbs and links", () => {
  const v = langVariant({
    kind: "trip", path: "/trips/a", canonical: "/trips/b",
    crumbs: [{ name: "Carta", path: "/" }, { name: "Spanje", path: "/spain" }],
    sections: [{ h2: "x", links: [{ name: "M", path: "/spain/malaga" }, { name: "T", path: "/spain/trails/1-x" }] }, null],
    image: { src: "s", credit: "Photo: Ana, CC BY 4.0" },
  }, "nl");
  assert.equal(v.path, "/nl/trips/a");
  assert.equal(v.canonical, "/nl/trips/b");
  assert.equal(v.enPath, "/trips/a");
  assert.deepEqual(v.crumbs.map((c) => c.path), ["/nl/", "/spain"]);
  assert.deepEqual(v.sections[0].links.map((c) => c.path), ["/nl/spain/malaga", "/spain/trails/1-x"]);
  assert.equal(v.image.credit, "Foto: Ana, CC BY 4.0");
});

test("nothing is indexed until REVIEWED names it; --reviewed previews the switch", () => {
  for (const l of LANGS) assert.deepEqual(REVIEWED[l], [], l);
  for (const l of LANGS) for (const k of LANG_PAGE_KINDS) assert.equal(isReviewed(l, k), false);
  const r = parseReviewed("nl:dest+trip,de:journey,pt:dest,fr:trail");
  assert.deepEqual(r, { nl: ["dest", "trip"], de: ["journey"], fr: [], es: [], it: [] });
  assert.equal(isReviewed("nl", "dest", r), true);
  assert.equal(isReviewed("nl", "journey", r), false);
  assert.equal(isReviewed("en", "dest", r), false);
});

test("the hreflang set is reciprocal: English, the languages, x-default on English", () => {
  const set = hreflangLinks("/spain/malaga", ["nl", "de"]);
  assert.deepEqual(set.map((a) => a.hreflang), ["en", "nl", "de", "x-default"]);
  assert.equal(set.find((a) => a.hreflang === "nl").href, `${ORIGIN}/nl/spain/malaga`);
  assert.equal(set.find((a) => a.hreflang === "x-default").href, `${ORIGIN}/spain/malaga`);
});

const PAGE = {
  kind: "dest", path: "/nl/spain/malaga", lang: "nl", title: "Malaga | Carta", description: "d", h1: "Malaga",
  lead: ["l"], facts: [], sections: [], crumbs: [{ name: "Carta", path: "/nl/" }], credits: ["OSM"],
};

test("a language page renders its language, locale, labels and hreflang", () => {
  const html = renderPage({ ...PAGE, alternates: hreflangLinks("/spain/malaga", ["nl"]) });
  assert.match(html, /<html lang="nl">/);
  assert.match(html, /<meta property="og:locale" content="nl_NL">/);
  assert.match(html, /"inLanguage":"nl"/);
  assert.match(html, /aria-label="Kruimelpad"/);
  assert.match(html, /Bronnen: OSM\./);
  assert.match(html, /<link rel="alternate" hreflang="nl" href="https:\/\/www\.carta-europetravel\.com\/nl\/spain\/malaga">/);
  assert.match(html, /<link rel="alternate" hreflang="x-default" href="https:\/\/www\.carta-europetravel\.com\/spain\/malaga">/);
  const draft = renderPage({ ...PAGE, noindex: true });
  assert.match(draft, /noindex,follow/);
  assert.doesNotMatch(draft, /hreflang/);
  const en = renderPage({ ...PAGE, path: "/spain/malaga", lang: undefined });
  assert.match(en, /<html lang="en">/);
  assert.match(en, /aria-label="Breadcrumb"/);
});

// ----------------------------------------------------------------- sitemap

const manifest = (nlIndexable) => ({
  generated_at: "2026-11-07T00:00:00Z",
  pages: [
    { path: "/spain/malaga", canonical: "/spain/malaga", kind: "dest", lang: "en", indexable: true, lastmod: "2026-11-01" },
    { path: "/nl/spain/malaga", canonical: "/nl/spain/malaga", kind: "dest", lang: "nl", indexable: nlIndexable, lastmod: "2026-11-01" },
    { path: "/de/spain/malaga", canonical: "/de/spain/malaga", kind: "dest", lang: "de", indexable: false, lastmod: "2026-11-01" },
  ],
});

test("the sitemap lists a language page only when it is indexable, in its own file", () => {
  const off = select(manifest(false).pages);
  assert.deepEqual([...off.groups.keys()], ["destinations"]);
  assert.equal(off.summary.excluded["dest:nl"].noindex, 1);
  const on = select(manifest(true).pages);
  assert.deepEqual([...on.groups.keys()].sort(), ["destinations", "destinations|nl"]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t1212-"));
  try {
    const rep = writeSitemaps(manifest(true), dir);
    assert.ok(rep.files.some((f) => f.name === "sitemap-destinations-nl.xml" && f.urls === 1 && f.lang === "nl"));
    assert.ok(!rep.files.some((f) => /-de(-\d+)?\.xml$/.test(f.name)));
    const index = fs.readFileSync(path.join(dir, "sitemaps", "sitemap.xml"), "utf8");
    assert.match(index, /sitemap-destinations-nl\.xml/);
    assert.match(fs.readFileSync(path.join(dir, "sitemaps", "sitemap-destinations-nl.xml"), "utf8"), /\/nl\/spain\/malaga<\/loc>/);
    assert.equal(sitemapKey("/sitemap-destinations-nl.xml"), "sitemaps/sitemap-destinations-nl.xml");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------- one build over the tracked wire (AD)

test("a build over Andorra writes language pages, hreflang only with the switch on", { timeout: 120000 }, () => {
  if (!fs.existsSync(path.join(APP, "public", "dossier"))) return;
  const run = (out, extra) => execFileSync(process.execPath, ["scripts/prerender/build.mjs", "--data", "public", "--out", out, "--country", "AD", ...extra],
    { cwd: APP, stdio: "pipe" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t1212-build-"));
  try {
    run(path.join(dir, "off"), []);
    const off = JSON.parse(fs.readFileSync(path.join(dir, "off", "_manifest.json"), "utf8"));
    const offLang = off.pages.filter((p) => p.lang !== "en");
    assert.ok(offLang.length > 0, "language pages are built");
    assert.ok(offLang.every((p) => !p.indexable), "all language pages are noindex by default");
    assert.ok(offLang.every((p) => LANG_PAGE_KINDS.includes(p.kind)));
    assert.ok(fs.readdirSync(path.join(dir, "off", "sitemaps")).every((f) => !/-(nl|de|fr|es|it)(-\d+)?\.xml$/.test(f)));
    const anyLang = fs.readFileSync(path.join(dir, "off", offLang[0].key), "utf8");
    assert.match(anyLang, /noindex,follow/);
    assert.doesNotMatch(anyLang, /hreflang/);

    run(path.join(dir, "on"), ["--langs", "nl,de", "--reviewed", "nl:dest+trip+journey"]);
    const on = JSON.parse(fs.readFileSync(path.join(dir, "on", "_manifest.json"), "utf8"));
    assert.ok(!on.pages.some((p) => ["fr", "es", "it"].includes(p.lang)), "--langs limits the languages");
    const nlOn = on.pages.filter((p) => p.lang === "nl" && p.indexable);
    assert.ok(nlOn.length > 0, "reviewed Dutch pages are indexable");
    assert.ok(on.pages.filter((p) => p.lang === "de").every((p) => !p.indexable));
    // Reciprocity: an indexed Dutch page and its English page name each other.
    const nl = nlOn.find((p) => p.canonical === p.path);
    const en = on.pages.find((p) => p.path === nl.en);
    const nlHtml = fs.readFileSync(path.join(dir, "on", nl.key), "utf8");
    const enHtml = fs.readFileSync(path.join(dir, "on", en.key), "utf8");
    for (const html of [nlHtml, enHtml]) {
      assert.ok(html.includes(`hreflang="nl" href="${ORIGIN}${nl.path}"`));
      assert.ok(html.includes(`hreflang="en" href="${ORIGIN}${en.path}"`));
      assert.ok(html.includes(`hreflang="x-default" href="${ORIGIN}${en.path}"`));
      assert.doesNotMatch(html, /hreflang="de"/);
    }
    assert.match(nlHtml, /<html lang="nl">/);
    const smaps = fs.readdirSync(path.join(dir, "on", "sitemaps"));
    assert.ok(smaps.some((f) => /-nl\.xml$/.test(f)), smaps.join(" "));
    assert.ok(!smaps.some((f) => /-de\.xml$/.test(f)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
