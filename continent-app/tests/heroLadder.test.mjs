// Own copies first, Wikimedia as the fallback (H12, T1105).
// Run: npm test  (from continent-app/)
//
// The address and the rung sizes are worked out in the browser from the
// Wikimedia URL and the wire's w and h, so they must agree with derive.py
// byte for byte: the expected titles and hashes below were printed by
// derive.canonical_title and derive.sha1_of, and the sizes by
// derive.rung_dims. Then the switch: a manifest that is not live, a
// photograph listed as missing, a bare URL, a Geograph photo and `?pic=off`
// all keep the Wikimedia URL.
import test from "node:test";
import assert from "node:assert/strict";
import {
  commonsTitle, sha1Hex, ladderDims, heroLadder, readLadderManifest, heroLadderLive,
} from "../src/lib/heroImage.js";
import { IMG_BASE } from "../src/lib/imageLadder.js";
import SHIPPED from "../src/lib/heroLadder.json" with { type: "json" };

const FROM_DERIVE = [
  ["https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Grand_Place_Bruselas_2.jpg/960px-Grand_Place_Bruselas_2.jpg",
    "File:Grand Place Bruselas 2.jpg", "e897830354e348c3e6f3fbba2587c1162399598b"],
  ["https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Br%C3%BCgge_Blick_vom_Belfried_4.jpg/960px-Br%C3%BCgge_Blick_vom_Belfried_4.jpg",
    "File:Brügge Blick vom Belfried 4.jpg", "6ec76d3b53fcc797d8537ab712791cc844958f35"],
  ["https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG/960px-Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG",
    "File:Puente Don Luis I, Oporto, Portugal, 2012-05-09, DD 13.JPG", "c256c7e14ed5e5fb907d8eb1da1ff159e52b122b"],
  // An original (no /thumb/), a lower-case first letter and a double space.
  ["https://upload.wikimedia.org/wikipedia/commons/6/6a/%C3%A9glise__de_Saint-Front.jpg",
    "File:Église de Saint-Front.jpg", "0c180397a7fcfec9788b458098a5a46efbd4f7da"],
  ["https://commons.wikimedia.org/wiki/File:Col_Aubisque.jpg",
    "File:Col Aubisque.jpg", "69b5cfb9cc06cadbf4dfa03424228633cd7adbd5"],
];

const LIVE = readLadderManifest({ schema: "carta.hero-ladder.v1", ladder: "ladder_v1", live: true, missing: [], rev: {}, dims: {} });
const BRUSSELS = {
  url: FROM_DERIVE[0][0], w: 3332, h: 2000, credit: "Brussels", page: "https://en.wikipedia.org/wiki/Brussels",
};

test("the title and the address match derive.py", () => {
  for (const [url, title, sha] of FROM_DERIVE) {
    assert.equal(commonsTitle(url), title, url);
    assert.equal(sha1Hex(title), sha, title);
  }
  assert.equal(sha1Hex(""), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
});

test("rung sizes match derive.rung_dims, never upscaled", () => {
  assert.deepEqual(ladderDims(3332, 2000), [[320, 192], [640, 384], [1280, 768]]);
  assert.deepEqual(ladderDims(900, 600), [[320, 213], [640, 427], [900, 600]]);
  assert.equal(ladderDims(0, 600), null);
});

test("a live manifest prefers our own copy, AVIF and WebP, capped by the layout", () => {
  const l = heroLadder(BRUSSELS, 960, LIVE);
  const base = `${IMG_BASE}/e8/97/e897830354e348c3e6f3fbba2587c1162399598b`;
  assert.equal(l.avif, `${base}/320.avif 320w, ${base}/640.avif 640w, ${base}/1280.avif 1280w`);
  assert.equal(l.webp, `${base}/320.webp 320w, ${base}/640.webp 640w`);
  assert.deepEqual(l.size, [1280, 768]);
  // A 500 px card is never offered the 1280.
  assert.equal(heroLadder(BRUSSELS, 500, LIVE).avif, `${base}/320.avif 320w, ${base}/640.avif 640w`);
  assert.equal(heroLadder(BRUSSELS, 300, LIVE).avif, `${base}/320.avif 320w`);
});

test("fallback: no live manifest, a missing copy, no size or no Commons title keep Wikimedia", () => {
  assert.equal(heroLadder(BRUSSELS, 960, readLadderManifest(null)), null);
  assert.equal(heroLadder(BRUSSELS, 960, readLadderManifest({ ...SHIPPED, live: false })), null);
  const missing = readLadderManifest({ schema: "carta.hero-ladder.v1", ladder: "ladder_v1", live: true, missing: ["e897830354e3"] });
  assert.equal(heroLadder(BRUSSELS, 960, missing), null);
  assert.equal(heroLadder(BRUSSELS.url, 960, LIVE), null, "a bare URL has no size");
  assert.equal(heroLadder({ url: BRUSSELS.url }, 960, LIVE), null, "no w and h");
  assert.equal(heroLadder({ url: "https://s0.geograph.org.uk/geophotos/01/23/45/12345_abc.jpg", w: 640, h: 480 }, 960, LIVE), null);
  // A manifest of another ladder is not ours.
  assert.equal(heroLadder(BRUSSELS, 960, readLadderManifest({ schema: "carta.hero-ladder.v1", ladder: "ladder_v2", live: true })), null);
});

test("a re-upload follows its new address, and the manifest's sizes win", () => {
  const rev = "0123456789abcdef0123456789abcdef01234567";
  const m = readLadderManifest({
    schema: "carta.hero-ladder.v1", ladder: "ladder_v1", live: true,
    rev: { e897830354e3: rev }, dims: { e897830354e3: [[320, 200], [640, 400], [1000, 625]] },
  });
  const l = heroLadder(BRUSSELS, 1280, m);
  assert.ok(l.avif.includes(`/01/23/${rev}/1280.avif 1000w`));
  assert.deepEqual(l.size, [1000, 625]);
});

test("a record already joined on the wire (ih, d) uses its own address when live", () => {
  const ih = "ffeeddccbbaa99887766554433221100ffeeddcc";
  const rec = { url: BRUSSELS.url, ih, d: [[320, 213], [640, 427], [1280, 853]] };
  assert.ok(heroLadder(rec, 960, LIVE).avif.startsWith(`${IMG_BASE}/ff/ee/${ih}/320.avif 320w`));
  assert.equal(heroLadder(rec, 960, readLadderManifest(null)), null);
});

test("the shipped manifest is the not-live one until the owner's derive run", () => {
  assert.equal(SHIPPED.schema, "carta.hero-ladder.v1");
  assert.equal(SHIPPED.ladder, "ladder_v1");
  assert.equal(heroLadderLive(), SHIPPED.live === true);
  // Whatever it says, its keys are the 12 character prefixes the lookup uses.
  for (const k of [...SHIPPED.missing, ...Object.keys(SHIPPED.rev), ...Object.keys(SHIPPED.dims)]) {
    assert.match(k, /^[0-9a-f]{12}$/);
  }
});
