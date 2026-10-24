// T631: the pure rules behind the climate, lake and beach slots.
// Run: npm test  (from continent-app/)
//
// Rows are cut from the published wire: gem:como's climate block and its
// dossier mountain (Grignone, 2410 m), lakes/IT.json Lake Como, beaches/IT.json
// Guvano. t() is a stand-in that returns the key.
import test from "node:test";
import assert from "node:assert/strict";
import {
  climateExtras, windKmh, windSeriesKmh, highPointOf, altitudeSeries, baseClimateUse,
  waterShoesHint, audienceOf, routeRainWarning, wetRockRoute, swimSafetyRows, windProfileOf,
  LAPSE_C_PER_KM, BASE_CLIMATE_MAX_KM,
} from "../src/lib/waterFacts.js";

// gem:como, January and July (t_high, t_low, precip_mm, comfort).
const COMO = {
  m: [[6.8, -0.7, 57, 18], [8.4, 0.7, 65, 26], [12.9, 4.7, 72, 47], [17.4, 9, 105, 63],
    [21.6, 13.5, 140, 72], [25.9, 18.1, 123, 76], [27.9, 20.1, 111, 73], [27.3, 19.6, 130, 70],
    [23.2, 15.2, 105, 73], [18.3, 10.8, 116, 59], [12.6, 6.1, 149, 29], [7.7, 1, 78, 18]],
  best: [5, 6, 7, 8, 9],
};
const WITH_EXTRAS = {
  ...COMO,
  rd: [6, 6, 7, 9, 11, 9, 7, 8, 7, 8, 9, 6],
  wind: [2.5, 2.6, 2.8, 2.9, 2.7, 2.6, 2.5, 2.4, 2.4, 2.4, 2.4, 2.4],
  elev: 197,
};

test("climateExtras reads the compact and the master names, and tolerates none", () => {
  assert.deepEqual(climateExtras(COMO), { sunH: null, waterC: null, rainDays: null, windMs: null, elevM: null });
  const e = climateExtras(WITH_EXTRAS);
  assert.equal(e.rainDays.length, 12);
  assert.equal(e.elevM, 197);
  const master = climateExtras({ rain_days: WITH_EXTRAS.rd, wind_ms: WITH_EXTRAS.wind, elev_m: 197 });
  assert.equal(master.windMs.length, 12);
  assert.deepEqual(climateExtras({ rd: [1, 2] }).rainDays, null, "a series of the wrong length is dropped");
  assert.deepEqual(climateExtras(null), { sunH: null, waterC: null, rainDays: null, windMs: null, elevM: null });
});

test("wind converts m/s to km/h", () => {
  assert.equal(windKmh(2.5), 9);
  assert.equal(windKmh(null), null);
  assert.equal(windSeriesKmh(COMO), null);
  assert.equal(windSeriesKmh(WITH_EXTRAS)[0], 9);
});

test("highPointOf takes the highest peak with an elevation", () => {
  const around = { mountains: [{ name: "Grignone", elev_m: 2410 }, { name: "Low", elev_m: 800 }, { name: "None" }] };
  assert.deepEqual(highPointOf(around), { m: 2410, name: "Grignone" });
  assert.equal(highPointOf({ mountains: [] }), null);
  assert.equal(highPointOf(null), null);
});

test("altitudeSeries lapses the valley figures and needs the town's elevation", () => {
  const high = { m: 2410, name: "Grignone" };
  assert.equal(altitudeSeries(COMO, high), null, "no elevation on the wire, no derivation");
  const alt = altitudeSeries(WITH_EXTRAS, high);
  // (2410 - 197) m = 2213 m, 6.5 C per km: 14.4 C colder.
  const drop = (2213 / 1000) * LAPSE_C_PER_KM;
  assert.equal(alt.hi[6], Math.round((27.9 - drop) * 10) / 10);
  assert.equal(alt.lo[0], Math.round((-0.7 - drop) * 10) / 10);
  assert.equal(alt.gainM, 2213);
  assert.equal(alt.hi.length, 12);
  assert.equal(altitudeSeries(WITH_EXTRAS, { m: 250, name: "Hill" }), null, "under 150 m is the valley");
  assert.equal(altitudeSeries(WITH_EXTRAS, null), null);
  // A lake below its town (negative gain) is warmer.
  const below = altitudeSeries({ ...WITH_EXTRAS, elev: 800 }, { m: 300, name: "Lake" });
  assert.ok(below.hi[6] > 27.9);
});

test("baseClimateUse refuses a town too far to stand in for the water", () => {
  assert.deepEqual(baseClimateUse({ id: "gem:como", city: "Lake Como", km: 0.7 }), { use: true, km: 0.7 });
  assert.equal(baseClimateUse({ id: "x", km: BASE_CLIMATE_MAX_KM + 1 }).use, false);
  assert.equal(baseClimateUse({ id: "x", km: BASE_CLIMATE_MAX_KM + 1 }).reason, "far");
  assert.equal(baseClimateUse(null).reason, "none");
  assert.equal(baseClimateUse({ id: "x" }).use, false);
});

test("waterShoesHint is derived from the surface and silent where it cannot know", () => {
  assert.equal(waterShoesHint("pebble"), "yes");
  assert.equal(waterShoesHint("shingle"), "yes");
  assert.equal(waterShoesHint("rock"), "yes");
  assert.equal(waterShoesHint("sand"), "no");
  assert.equal(waterShoesHint("grass"), null);
  assert.equal(waterShoesHint(undefined), null);
});

test("audienceOf says yes only where the wire does, never no", () => {
  const guvano = { bestFor: ["scenery", "seclusion", "naturism"] };
  assert.deepEqual(audienceOf(guvano), { family: null, quiet: true, dog: null, luxury: null });
  assert.equal(audienceOf({ bestFor: ["families"], dog: "leash" }).family, true);
  assert.equal(audienceOf({ dog: "leash" }).dog, true);
  assert.equal(audienceOf({ dog: "no" }).dog, null);
  assert.equal(audienceOf(null).luxury, null);
});

test("wetRockRoute and routeRainWarning follow SAC and the gorge highlight", () => {
  assert.equal(wetRockRoute("hiking", []), null);
  assert.equal(wetRockRoute("mountain_hiking", []), "sac");
  assert.equal(wetRockRoute("demanding_mountain_hiking", ["summit"]), "sac");
  assert.equal(wetRockRoute(undefined, ["gorge"]), "gorge");
  assert.equal(wetRockRoute("alpine_hiking", ["gorge"]), "both");

  const dry = [{ date: "2026-10-24", rainMm: 0 }, { date: "2026-10-25", rainMm: 0.4 }];
  const wet = [{ date: "2026-10-24", rainMm: 0 }, { date: "2026-10-25", rainMm: 6.2 }];
  assert.equal(routeRainWarning({ sac: "mountain_hiking", forecast: dry }), null);
  assert.deepEqual(routeRainWarning({ sac: "mountain_hiking", forecast: wet }),
    { reason: "sac", date: "2026-10-25", mm: 6 });
  assert.equal(routeRainWarning({ sac: "hiking", highlights: [], forecast: wet }), null, "T1 is a plain path");
  assert.equal(routeRainWarning({ highlights: ["gorge"], forecast: wet }).reason, "gorge");
  // No forecast, no warning: the sheet shows nothing.
  assert.equal(routeRainWarning({ sac: "mountain_hiking", forecast: null }), null);
  assert.equal(routeRainWarning({ sac: "mountain_hiking", forecast: undefined }), null);
  assert.equal(routeRainWarning({ sac: "mountain_hiking", forecast: [] }), null);
  // Only the next three days count.
  const late = [0, 0, 0, 9].map((mm, i) => ({ date: `2026-10-2${4 + i}`, rainMm: mm }));
  assert.equal(routeRainWarning({ sac: "mountain_hiking", forecast: late }), null);
});

test("swimSafetyRows keeps five slots and never reads a gap as safe", () => {
  // Lake Como: rule yes, 154 m deep, cold shock and boat traffic, no lifeguard on file.
  const como = swimSafetyRows({ rule: "yes", depthM: 154, hazards: ["cold_shock", "boat_traffic"], lifeguard: null });
  assert.deepEqual(como.map((r) => r.key), ["rule", "depth", "currents", "ban", "guard"]);
  const by = Object.fromEntries(como.map((r) => [r.key, r.value]));
  assert.equal(by.rule.key, "lake.swimYes");
  assert.deepEqual(by.depth, { key: "wx.ssDepthValue", params: { m: 154 } });
  assert.equal(by.currents, null, "no current on file is unknown, not none");
  assert.equal(by.ban.key, "wx.ssBanNo");
  assert.equal(by.guard, null);

  const bare = swimSafetyRows({ rule: "unknown", depthM: null, hazards: [], lifeguard: null });
  assert.ok(bare.every((r) => r.value === null));
  assert.equal(swimSafetyRows({ rule: "no", hazards: ["currents"], lifeguard: true })
    .find((r) => r.key === "ban").value.key, "wx.ssBanYes");
  assert.equal(swimSafetyRows({ rule: "yes", hazards: ["currents"], lifeguard: true })
    .find((r) => r.key === "currents").value.key, "lake.hazCurrents");
  assert.equal(swimSafetyRows({ rule: "yes", lifeguard: true }).find((r) => r.key === "guard").value.key, "wx.ssGuardYes");
});

test("T641: sunshine and water temperature series, the wind profile and a mapped swimming ban", () => {
  const sun = [114, 129, 193, 197, 239, 281, 313, 270, 214, 141, 88, 93];
  const e = climateExtras({ ...COMO, sun_h: sun, water_c: sun.map((v) => v / 10) });
  assert.deepEqual(e.sunH, sun);
  assert.equal(e.waterC.length, 12);
  assert.equal(climateExtras({ ...COMO, sun_h: [1, 2] }).sunH, null, "a short series is dropped");
  const w = windProfileOf({ ms: [1.9, 1.8, 1.9, 1.9, 1.9, 1.8, 1.7, 1.6, 1.7, 1.7, 1.7, 1.8] });
  assert.deepEqual(w, { lo: 6, hi: 7, peak: 0 });
  assert.equal(windProfileOf({ ms: [1, 2] }), null);
  assert.equal(windProfileOf(null), null);
  const rows = swimSafetyRows({ rule: "yes", depthM: null, hazards: [], lifeguard: true, banN: 2 });
  assert.deepEqual(rows.find((r) => r.key === "ban").value, { key: "wx.ssBanMapped", params: { n: 2 } });
  assert.equal(rows.find((r) => r.key === "guard").value.key, "wx.ssGuardYes");
});
