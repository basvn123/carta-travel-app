// T656, T660: one photo per trip kind, never the same photo twice. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { likePhotos, LAYER_PHOTOS } from "../src/planner/flow/guidePhotos.js";

const d = (id, city, cats, fame, url = `https://x/${id}.jpg`, score = 8.5, cls = "town") => [id, {
  city, categories: cats, rating: { fame, score }, image: { url }, iso2: "IT", place: { class: cls },
}];

test("a setting kind takes the layer's own photograph, with its credit", () => {
  const p = likePhotos({}, ["beach", "lakes"]);
  assert.equal(p.beach, LAYER_PHOTOS.beach);
  assert.ok(p.beach.by && p.beach.lic && p.beach.url.startsWith("https://upload.wikimedia.org/"));
  assert.equal(p.lakes.city, "Lake Como");
});

test("the catalogue gives the rest: the best known matching place, once", () => {
  const dest = Object.fromEntries([
    d("a", "Florence", ["unesco", "art"], 900, undefined, 9, "city"),
    d("b", "Siena", ["unesco", "medieval"], 400),
    d("e", "Nowhere", ["unesco"], 5000, "", 9),
    d("f", "Lowscore", ["unesco"], 9000, "https://x/f.jpg", 5),
  ]);
  const p = likePhotos(dest, ["culture", "moon"]);
  assert.equal(p.culture.city, "Florence");
  assert.equal(p.moon, undefined);
});

test("a setting kind from the catalogue skips a big city", () => {
  const dest = Object.fromEntries([
    d("m", "Big", ["remote", "quiet"], 9000, undefined, 9, "city"),
    d("t", "Small", ["remote"], 50),
  ]);
  assert.equal(likePhotos(dest, ["hidden"]).hidden.city, "Small");
});
