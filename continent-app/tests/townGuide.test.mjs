// T673: a town's guide rows from its dossier; unknown rows stay, empty.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { townGuide, townPhotos, GUIDE_KEYS } from "../src/planner/days/townGuide.js";

const lis = {
  intro: { short: "Lisbon is the capital of Portugal, set on hills." },
  sleep: { neighbourhoods: [{ name: "Campolide", night_eur: 116 }, { name: "Alfama", night_eur: 98 }, { name: "Baixa" }, { name: "Belem", night_eur: 90 }] },
  when: { best: [6, 7, 8, 9], crowding: { tier: 3, label: "Crowded" } },
  practical: { getting_there: { airport: "LIS", transit: "excellent", car_needed: false }, rhythm: "Many museums close Mondays.", book_ahead: ["Belem Tower"] },
  festivals: [{ name: "NOS Alive", months: [7], what: "Music by the river" }, { name: "Santos", months: [6] }],
  gallery: [{ url: "a" }, { url: "a" }, { thumb: "b" }],
};

test("every row in order, filled from what the dossier states", () => {
  const rows = townGuide(lis, { month: 7 });
  assert.deepEqual(rows.map((r) => r.key), GUIDE_KEYS);
  const by = Object.fromEntries(rows.map((r) => [r.key, r.items]));
  assert.equal(by.vibe[0].text, lis.intro.short);
  assert.deepEqual(by.sleep.map((x) => x.text), ["Campolide", "Alfama", "Baixa"]);
  assert.equal(by.sleep[2].eur, null);
  assert.deepEqual(by.when[0].months, [6, 7, 8, 9]);
  assert.equal(by.when[1].label, "Crowded");
  assert.deepEqual(by.getting, [{ airport: "LIS" }, { transit: "excellent" }, { carNeeded: false }]);
  assert.deepEqual(by.know[1].bookAhead, ["Belem Tower"]);
  assert.deepEqual(by.on.map((e) => e.text), ["NOS Alive"]);
  assert.deepEqual(by.tip, []);
});

test("no dossier: every row empty, none left out", () => {
  const rows = townGuide(null);
  assert.equal(rows.length, GUIDE_KEYS.length);
  assert.ok(rows.every((r) => r.items.length === 0));
});

test("photos: the gallery once each, else the town's own", () => {
  assert.deepEqual(townPhotos(lis, null), ["a", "b"]);
  assert.deepEqual(townPhotos(null, { image: { url: "c" } }), ["c"]);
});
