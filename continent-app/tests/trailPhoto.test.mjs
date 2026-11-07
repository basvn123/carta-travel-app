// G8, T1127: which picture a trail card shows. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { pickTrailPhoto, poolFrom, FEATURE_KM, TOWN_KM, NEAR_KM } from "../src/lib/trailPhoto.js";
import { associateTrip } from "../src/lib/trailCards.js";

const row = (name, lat, lon, extra = {}) => ({
  name, lat, lon,
  images: [{ u: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/500px-${name}.jpg`, by: "Ann", lic: "CC BY 4.0", page: "https://commons.wikimedia.org/wiki/File:x", ...extra }],
});
const centre = { lat: 47, lon: 13 };
const km = (d) => ({ lat: 47 + d / 111.19, lon: 13 }); // d km north of the centre

test("the walk's own photograph always wins", () => {
  const pool = poolFrom("lake", [row("Lake", 47, 13)]);
  const p = pickTrailPhoto({ own: "https://own/x.jpg", centre, highlights: ["lake"], pool });
  assert.equal(p.source, "own");
  assert.equal(p.url, "https://own/x.jpg");
});

test("a walk that passes a lake takes the licensed lake photograph within 5 km, ahead of the town", () => {
  const pool = poolFrom("lake", [row("Attersee", km(3).lat, 13)]);
  const town = { url: "https://t/h.jpg", city: "Unterach", km: 2 };
  const p = pickTrailPhoto({ centre, highlights: ["lake", "gorge"], town, pool });
  assert.equal(p.source, "feature");
  assert.equal(p.of, "Attersee");
  assert.equal(p.lic, "CC BY 4.0");
});

test("a lake further than FEATURE_KM falls to the town, captioned", () => {
  const pool = poolFrom("lake", [row("Far", km(FEATURE_KM + 2).lat, 13)]);
  const p = pickTrailPhoto({ centre, highlights: ["lake"], town: { url: "https://t/h.jpg", city: "Hallstatt", km: 10 }, pool });
  assert.equal(p.source, "town");
  assert.equal(p.of, "Hallstatt");
});

test("a highlight of another kind does not pull a feature photograph in", () => {
  const pool = poolFrom("beach", [row("Beach", km(1).lat, 13)]);
  const p = pickTrailPhoto({ centre, highlights: ["summit"], town: { url: "https://t/h.jpg", city: "T", km: 5 }, pool });
  assert.equal(p.source, "town");
});

test("past TOWN_KM a town hero is not borrowed; a licensed photo within NEAR_KM is, captioned", () => {
  const town = { url: "https://t/h.jpg", city: "Far town", km: TOWN_KM + 1 };
  const pool = poolFrom("peak", [row("Hochkogel", km(NEAR_KM - 1).lat, 13)]);
  const p = pickTrailPhoto({ centre, highlights: [], town, pool });
  assert.equal(p.source, "near");
  assert.equal(p.of, "Hochkogel");
});

test("nothing licensed in range gives the designed placeholder, never a distant photograph", () => {
  const pool = poolFrom("peak", [row("Distant", km(NEAR_KM + 5).lat, 13)]);
  const p = pickTrailPhoto({ centre, highlights: ["summit"], town: { url: "https://t/h.jpg", city: "T", km: 60 }, pool });
  assert.deepEqual(p, { url: null, of: null, source: "none" });
});

test("the pool takes only licensed, unvetoed photographs with coordinates", () => {
  const unlicensed = row("NoLic", 47, 13, { lic: "" });
  const noCoord = { ...row("NoCoord", 47, 13), lat: undefined };
  const vetoed = row("Ok", 47, 13);
  const pool = poolFrom("lake", [unlicensed, noCoord, vetoed]);
  assert.equal(pool.length, 1);
  assert.equal(pool[0].name, "Ok");
});

test("associateTrip: same answers as before when no pool is given, and the pool fills a gap", () => {
  const dests = { A: { id: "A", city: "Alpha", lat: 47, lon: 13, image: { url: "https://t/a.jpg" } } };
  const idx = [{ id: "A", lat: 47, lon: 13 }];
  const tr = { category: "hike", bbox: [12.99, 46.99, 13.01, 47.01], f: { hl: ["lake"] } };
  const a = associateTrip(tr, dests, idx);
  assert.equal(a.photoUrl, "https://t/a.jpg");
  assert.equal(a.photoOf, "Alpha");
  const far = { category: "hike", bbox: [14.99, 46.99, 15.01, 47.01], f: { hl: [] } };
  assert.equal(associateTrip(far, dests, idx, []).photoUrl, null);
  const pool = poolFrom("lake", [row("Seen", 47, 15.02)]);
  const b = associateTrip(far, dests, idx, pool);
  assert.equal(b.photoSource, "near");
  assert.equal(b.photoOf, "Seen");
});
