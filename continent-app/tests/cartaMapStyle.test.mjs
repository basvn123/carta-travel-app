// G12: the Carta basemap style (src/lib/map/cartaMapStyle.js), its CARTO
// fallback merge (src/lib/map/pmtilesProtocol.js) and the map upload plan
// (scripts/r2/push-maps.mjs).
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import {
  cartaMapStyle, isCartaBasemap, BASEMAP_URL, BASEMAP_FILE, GLYPHS_URL, MAPS_BASE, MANIFEST_URL,
} from "../src/lib/map/cartaMapStyle.js";
import { mergeFallback, isBaseLayer, extractUrlFrom, ManifestSource } from "../src/lib/map/pmtilesProtocol.js";
import { BASEMAP_COLOURS } from "../src/map/tokenColors.js";
import { mapsPlan } from "../scripts/r2/push-maps.mjs";

test("the light and dark styles are valid MapLibre styles", () => {
  for (const dark of [false, true]) {
    const errors = validateStyleMin(cartaMapStyle({ dark }));
    assert.deepEqual(errors.map((e) => e.message), [], dark ? "dark" : "light");
  }
});

test("the style reads our PMTiles and glyphs on the data host and credits OpenStreetMap", () => {
  const s = cartaMapStyle();
  assert.equal(s.sources.protomaps.url, `pmtiles://${MANIFEST_URL}`);
  assert.equal(MANIFEST_URL, `${MAPS_BASE}/basemap.json`);
  assert.match(BASEMAP_FILE, /^europe-\d{4}-\d{2}-\d{2}\.pmtiles$/);
  assert.ok(BASEMAP_URL.startsWith("https://data.carta-europetravel.com/data/maps/"));
  assert.equal(s.glyphs, GLYPHS_URL);
  assert.ok(GLYPHS_URL.startsWith(MAPS_BASE));
  assert.match(s.sources.protomaps.attribution, /© OpenStreetMap/);
  assert.ok(isCartaBasemap(s));
});

test("the decision's palette paints land, sea, borders, roads and parks", () => {
  const s = cartaMapStyle();
  const paint = (id) => s.layers.find((l) => l.id === id).paint;
  const c = BASEMAP_COLOURS.light;
  assert.equal(c.land, "#f4efe6");
  assert.equal(paint("base-earth")["fill-color"], c.land);
  assert.equal(paint("base-water")["fill-color"], "#dfe6e6");
  assert.equal(paint("base-border")["line-color"], "#d9c6ae");
  assert.equal(paint("base-road-major")["line-color"], "#e8dccb");
  assert.equal(paint("base-park")["fill-color"], "#d6dccd");
  assert.equal(paint("base-label-country")["text-color"], "#465049");
  assert.equal(cartaMapStyle({ dark: true }).layers.find((l) => l.id === "base-earth").paint["fill-color"],
    BASEMAP_COLOURS.dark.land);
});

test("roads start at city zoom and countries are spaced capitals", () => {
  const s = cartaMapStyle();
  for (const l of s.layers.filter((x) => x["source-layer"] === "roads")) assert.ok(l.minzoom >= 10, l.id);
  const country = s.layers.find((l) => l.id === "base-label-country").layout;
  assert.equal(country["text-transform"], "uppercase");
  assert.ok(country["text-letter-spacing"] >= 0.2);
  assert.ok(s.layers.every((l) => l.id.startsWith("base-")));
});

test("labels follow the language and fall back to English, then the local name", () => {
  const field = (lang) => cartaMapStyle({ lang }).layers.find((l) => l.id === "base-label-country").layout["text-field"];
  assert.deepEqual(field("de"), ["coalesce", ["get", "name:de"], ["get", "name:en"], ["get", "name"]]);
  assert.deepEqual(field("x;y")[1], ["get", "name:en"]);
});

test("the CARTO fallback keeps the caller's sources and layers above CARTO's", () => {
  const prev = cartaMapStyle();
  prev.sources.dests = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  prev.layers.push({ id: "dest-dots", type: "circle", source: "dests" });
  const next = {
    version: 8, glyphs: "https://carto/fonts/{fontstack}/{range}.pbf",
    sources: { carto: { type: "vector", url: "https://carto/tiles.json" } },
    layers: [{ id: "bg", type: "background" }, { id: "place", type: "symbol", source: "carto", layout: { "text-font": ["Montserrat"] } }],
  };
  const out = mergeFallback(prev, next);
  assert.deepEqual(Object.keys(out.sources).sort(), ["carto", "dests"]);
  assert.deepEqual(out.layers.map((l) => l.id), ["bg", "place", "dest-dots"]);
  assert.deepEqual(out.layers[1].layout["text-font"], ["Noto Sans Regular"]);
  assert.equal(out.glyphs, prev.glyphs);
  assert.ok(!isCartaBasemap(out));
  assert.ok(isBaseLayer({ id: "base-earth" }) && !isBaseLayer({ id: "dest-dots", source: "dests" }));
});

test("the manifest names the extract; a missing or odd one falls back to the built-in file", async () => {
  assert.equal(extractUrlFrom({ pmtiles: "europe-2026-12-09.pmtiles" }), `${MAPS_BASE}/europe-2026-12-09.pmtiles`);
  for (const bad of [null, {}, { pmtiles: "../x.pmtiles" }, { pmtiles: "https://evil/europe-2026-12-09.pmtiles" }]) {
    assert.equal(extractUrlFrom(bad), BASEMAP_URL);
  }
  const ok = new ManifestSource(MANIFEST_URL, async () => ({ ok: true, json: async () => ({ pmtiles: "europe-2026-12-09.pmtiles" }) }));
  assert.equal(ok.getKey(), MANIFEST_URL);
  assert.equal((await ok.resolve()).url, `${MAPS_BASE}/europe-2026-12-09.pmtiles`);
  const down = new ManifestSource(MANIFEST_URL, async () => { throw new Error("offline"); });
  assert.equal((await down.resolve()).url, BASEMAP_URL);
  const missing = new ManifestSource(MANIFEST_URL, async () => ({ ok: false }));
  assert.equal((await missing.resolve()).url, BASEMAP_URL);
});

test("the map upload only copies, under data/maps/, with a dated never-overwritten name", () => {
  const cmds = mapsPlan({ pmtiles: "/x/europe-2026-11-18.pmtiles", assets: "/a" });
  assert.ok(cmds.every((c) => c[0] === "rclone" && ["copy", "copyto"].includes(c[1])));
  assert.ok(cmds.every((c) => c[3].startsWith("r2:carta/data/maps/")));
  assert.match(cmds[0].join(" "), /immutable/);
  assert.throws(() => mapsPlan({ pmtiles: "/x/europe.pmtiles" }), /YYYY-MM-DD/);
});
