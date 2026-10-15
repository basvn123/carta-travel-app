/**
 * Before you go, as short rows (T430, carta-design "Detail page grammar":
 * at most four short icon rows, safety first, never folded).
 *
 * The page used to say this in sentences ("Not for you if you have no rope
 * and no glacier training. The usual way up crosses a glacier." and then the
 * hazard list said it again in a paragraph). Each row is now a few words and
 * one short line under them, with a line icon, so it reads at a glance:
 *
 *   Glacier on the way up
 *   Rope, crampons and someone who can use them
 *
 * Rows come from two places the page already holds: the hazard codes of a
 * lake or a summit (safety rows), and the not-for lines of lib/notFor.js
 * (fit rows). A fit row that restates a hazard already shown is dropped, as
 * notFor.js does. The catch-all "Carta shows the usual picture" line is not
 * a row: it said nothing about the place (owner, 2026-10-15).
 *
 * Pure: returns { key, icon, titleKey, subKey, params, safety } objects for
 * the component to translate.
 */

export const BEFORE_GO_MAX = 4;

// Hazard code -> [icon, short name]. The title key is go.haz.<name>.t, the
// line under it go.haz.<name>.s.
const HAZARD_ROWS = {
  glacier: ['alert', 'glacier'],
  crevasse: ['alert', 'crevasse'],
  altitude: ['mountain', 'altitude'],
  exposure: ['alert', 'exposure'],
  via_ferrata: ['alert', 'ferrata'],
  rockfall: ['alert', 'rockfall'],
  volcanic: ['alert', 'volcanic'],
  gas: ['alert', 'gas'],
  weather: ['cloud', 'weather'],
  wind: ['cloud', 'wind'],
  navigation: ['compass', 'navigation'],
  cold: ['snow', 'cold'],
  long_day: ['clock', 'longDay'],
  lightning: ['storm', 'lightning'],
  cold_shock: ['swim', 'coldShock'],
  algal_bloom: ['alert', 'algae'],
  water_quality: ['swim', 'waterQuality'],
  currents: ['swim', 'currents'],
  dam_release: ['alert', 'dam'],
  boat_traffic: ['ferry', 'boats'],
  cliffs: ['alert', 'cliffs'],
};

// notFor.js key -> [icon, short name, safety]. Keys that a hazard row
// already covers are listed in HAZARD_OF_LINE and skipped there.
const FIT_ROWS = {
  'notfor.mtnGlacier': ['alert', 'glacier', true],
  'notfor.mtnExposure': ['alert', 'exposure', true],
  'notfor.mtnGrade': ['boot', 'grade', false],
  'notfor.mtnAltitude': ['mountain', 'altitude', true],
  'notfor.mtnLightning': ['storm', 'lightning', true],
  'notfor.mtnNoLift': ['boot', 'noLift', false],
  'notfor.beachSurface': ['beach', 'surface', false],
  'notfor.beachWaterSufficient': ['swim', 'waterSufficient', false],
  'notfor.beachWaterPoor': ['swim', 'waterPoor', true],
  'notfor.beachServices': ['bottle', 'services', false],
  'notfor.beachCove': ['beach', 'cove', false],
  'notfor.lakeSwimNo': ['ban', 'swimNo', true],
  'notfor.lakeSwimLimited': ['swim', 'swimLimited', false],
  'notfor.lakeCold': ['swim', 'coldShock', true],
  'notfor.lakeAlgae': ['alert', 'algae', true],
  'notfor.lakeDam': ['alert', 'dam', true],
  'notfor.lakeCurrent': ['swim', 'currents', true],
  'notfor.trailRoad': ['road', 'road', false],
  'notfor.trailGrade': ['boot', 'hardGround', false],
  'notfor.trailClimb': ['mountain', 'climb', false],
  'notfor.trailLong': ['route', 'long', false],
  'notfor.cycleGravel': ['bike', 'gravel', false],
  'notfor.cycleMtb': ['bike', 'mtb', false],
  'notfor.cycleUnpaved': ['road', 'unpaved', false],
  'notfor.cycleTraffic': ['car', 'traffic', true],
  'notfor.cycleHilly': ['mountain', 'hilly', false],
  'notfor.tripCar': ['car', 'car', false],
  'notfor.tripMoves': ['suitcase', 'moves', false],
  'notfor.tripSeason': ['calendar', 'season', false],
  'notfor.journeyHard': ['boot', 'hard', false],
  'notfor.journeyFamily': ['family', 'family', false],
};

// Hazard rows and fit rows share a short name where they say the same thing,
// so one of them is enough.
export function beforeGoItems({ hazards = [], lines = [] } = {}) {
  const out = [];
  const seen = new Set();
  for (const code of hazards) {
    const row = HAZARD_ROWS[code];
    if (!row || seen.has(row[1])) continue;
    seen.add(row[1]);
    out.push({ key: `haz-${code}`, icon: row[0], titleKey: `go.${row[1]}.t`, subKey: `go.${row[1]}.s`, params: {}, safety: true });
  }
  for (const l of lines) {
    const row = FIT_ROWS[l?.key];
    if (!row || seen.has(row[1])) continue;
    seen.add(row[1]);
    out.push({ key: l.key, icon: row[0], titleKey: `go.${row[1]}.t`, subKey: `go.${row[1]}.s`, params: l.params || {}, safety: row[2] });
  }
  // Safety first, then the page's own order.
  return out
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (Number(b.x.safety) - Number(a.x.safety)) || (a.i - b.i))
    .map(({ x }) => x)
    .slice(0, BEFORE_GO_MAX);
}
