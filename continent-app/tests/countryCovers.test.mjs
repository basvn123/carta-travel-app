// Which photograph stands for a country (prompt T3).
// Run: npm test  (from continent-app/)
//
// Hand-built fixtures for the rules, then the real published catalogue for the
// promise the grid makes: 43 countries, 43 different photographs, none of them
// a portrait poured into a landscape card and none of them an airport.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { shapeBucket, pickCountryCovers, NON_PHOTO_IMG } from "../src/lib/countryCovers.js";
import { frameKept } from "../src/lib/heroImage.js";

const here = dirname(fileURLToPath(import.meta.url));
const pubFile = join(here, "..", "public", "app_data.json");

/** A destination, with only the fields the picker reads. */
const dest = (id, city, country, opts = {}) => ({
  id,
  dest: {
    city,
    country,
    lat: 50,
    lon: 5,
    tier: opts.tier ?? "gem",
    rating: { score: opts.score ?? 7, fame: opts.fame ?? 100 },
    image: opts.url === null ? undefined : {
      url: opts.url ?? `https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/${id}.jpg/960px-${id}.jpg`,
      w: opts.w ?? 1600,
      h: opts.h ?? 1200,
    },
  },
});

const oneCountry = (cities) => [{ country: "Testland", cities }];
const destsOf = (countries) => Object.fromEntries(
  countries.flatMap((c) => c.cities).map((x) => [x.id, x.dest]),
);
const pick = (countries) => pickCountryCovers(countries, destsOf(countries));

// ---- shapeBucket ----------------------------------------------------------

test("a landscape frame outranks a portrait one", () => {
  assert.equal(shapeBucket({ w: 1600, h: 1200 }), 1);
  assert.equal(shapeBucket({ w: 2304, h: 3456 }), 0);
});

test("a square counts as landscape enough for a 4:3 card", () => {
  // 1:1 keeps 75% of itself in a 4:3 box, the same as 16:9. Neither is broken.
  assert.equal(shapeBucket({ w: 1000, h: 1000 }), 1);
  assert.equal(shapeBucket({ w: 1920, h: 1080 }), 1);
});

test("a panorama is not demoted", () => {
  // The bucket is orientation, not the surviving fraction: a 3:1 panorama
  // keeps less of itself than a 3:4 portrait does, and still looks right.
  assert.ok(frameKept({ w: 3000, h: 1000 }, 4 / 3) < frameKept({ w: 3, h: 4 }, 4 / 3));
  assert.equal(shapeBucket({ w: 3000, h: 1000 }), 1);
});

test("an unmeasured photo is not treated as bad", () => {
  // Unknown is not the same as bad: it must not sink below a measured portrait.
  assert.equal(shapeBucket({ w: 0, h: 0 }), 1);
  assert.equal(shapeBucket(undefined), 1);
  assert.ok(shapeBucket({}) > shapeBucket({ w: 2, h: 3 }));
});

// ---- the picker -----------------------------------------------------------

test("the best-rated place supplies the picture", () => {
  const c = oneCountry([
    dest("a", "Dull", "Testland", { score: 6 }),
    dest("b", "Lovely", "Testland", { score: 9 }),
  ]);
  assert.match(pick(c).get("Testland"), /\/b\.jpg\//);
});

test("fame only breaks a tie in rating", () => {
  const c = oneCountry([
    dest("a", "Known", "Testland", { score: 8, fame: 900 }),
    dest("b", "Better", "Testland", { score: 8.5, fame: 10 }),
  ]);
  assert.match(pick(c).get("Testland"), /\/b\.jpg\//, "rating still leads");

  const tied = oneCountry([
    dest("a", "Known", "Testland", { score: 8, fame: 900 }),
    dest("b", "Obscure", "Testland", { score: 8, fame: 10 }),
  ]);
  assert.match(pick(tied).get("Testland"), /\/a\.jpg\//, "fame breaks the tie");
});

test("a portrait loses to a landscape of comparable rating", () => {
  const c = oneCountry([
    dest("tall", "Tall", "Testland", { score: 9, w: 2304, h: 3456 }),
    dest("wide", "Wide", "Testland", { score: 8.5, w: 1600, h: 1200 }),
  ]);
  assert.match(pick(c).get("Testland"), /\/wide\.jpg\//);
});

test("shape tips the choice, it does not reorder the country", () => {
  // The whole point of one bit rather than a gradient: a much better place
  // keeps the card even though its frame crops worse.
  const c = oneCountry([
    dest("pano", "Famous", "Testland", { score: 9, w: 3000, h: 1000 }),
    dest("perfect", "Nobody", "Testland", { score: 7, w: 1600, h: 1200 }),
  ]);
  assert.match(pick(c).get("Testland"), /\/pano\.jpg\//);
});

test("an airport loses to any real place", () => {
  const c = oneCountry([
    dest("apt", "Gateway", "Testland", { score: 9, fame: 5000, tier: "airport" }),
    dest("town", "Town", "Testland", { score: 6, fame: 10 }),
  ]);
  assert.match(pick(c).get("Testland"), /\/town\.jpg\//);
});

test("clip art is stepped past", () => {
  const c = oneCountry([
    dest("arms", "Capital", "Testland", {
      score: 9,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Coat_of_arms_x.svg/960px-x.png",
    }),
    dest("real", "Town", "Testland", { score: 6 }),
  ]);
  assert.match(pick(c).get("Testland"), /\/real\.jpg\//);
});

test("clip art is still better than an empty card", () => {
  // A country whose ONLY image is a coat of arms keeps it: a grey hole says
  // less about the place than the arms do.
  const url = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Coat_of_arms_y.svg/960px-y.png";
  const c = oneCountry([dest("arms", "Capital", "Testland", { url })]);
  assert.equal(pick(c).get("Testland"), url);
  assert.ok(NON_PHOTO_IMG.test(url));
});

test("two countries never share one photograph", () => {
  const url = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Shared.jpg/960px-Shared.jpg";
  const countries = [
    { country: "Alpha", cities: [dest("a1", "A", "Alpha", { score: 9, url }), dest("a2", "A2", "Alpha", { score: 5 })] },
    { country: "Beta", cities: [dest("b1", "B", "Beta", { score: 8, url }), dest("b2", "B2", "Beta", { score: 4 })] },
  ];
  const covers = pickCountryCovers(countries, destsOf(countries));
  assert.notEqual(covers.get("Alpha"), covers.get("Beta"));
  // The better-rated country keeps the contested file.
  assert.equal(covers.get("Alpha"), url);
});

// ---- the real catalogue ---------------------------------------------------

test("the published catalogue gives every country its own photograph", (t) => {
  if (!existsSync(pubFile)) return t.skip("public/app_data.json not built");
  const data = JSON.parse(readFileSync(pubFile, "utf8"));
  const destinations = data.destinations || {};

  const byCountry = new Map();
  for (const [id, d] of Object.entries(destinations)) {
    if (!d || d.lat == null) continue;
    if (!byCountry.has(d.country)) byCountry.set(d.country, { country: d.country, cities: [] });
    byCountry.get(d.country).cities.push({ id, dest: d });
  }
  const countries = [...byCountry.values()];
  const covers = pickCountryCovers(countries, destinations);

  assert.equal(covers.size, countries.length, "every country gets a cover");
  assert.equal(new Set(covers.values()).size, covers.size, "no two countries share a file");

  // Which destination each cover came from, so the rest can be asserted on it.
  const byUrl = new Map();
  for (const d of Object.values(destinations)) {
    if (d?.image?.url) byUrl.set(d.image.url, d);
  }
  const picked = [...covers.values()].map((u) => byUrl.get(u)).filter(Boolean);

  const portrait = picked.filter((d) => d.image.w && d.image.h && d.image.w / d.image.h < 0.8);
  assert.deepEqual(portrait.map((d) => d.city), [], "no cover is a portrait");

  const airports = picked.filter((d) => d.tier === "airport");
  assert.deepEqual(airports.map((d) => d.city), [], "no cover is an airport gateway");

  // The wire has to carry the measurements, or the shape rule is inert and
  // this whole test passes vacuously. pipeline/apply_image_dims.py puts them
  // there; if a re-harvest drops them, fail loudly rather than quietly.
  const measured = picked.filter((d) => d.image.w && d.image.h);
  assert.ok(measured.length >= picked.length * 0.9,
    `only ${measured.length}/${picked.length} covers carry w/h: re-run pipeline/apply_image_dims.py`);
});
