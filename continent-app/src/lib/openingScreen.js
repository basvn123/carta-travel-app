/**
 * The section opening screen (spec 5.3, T183): what the five outdoor sections
 * of the Destinations tab show before anybody has searched or filtered.
 *
 * Band 1, the icons: six or nine named places with their own photograph,
 * picked from the rows the section already loaded. Band 2, the useful cuts:
 * rails, each one a saved filter over the SAME facet model the filter sheet
 * uses, so "See all" opens the grid with exactly that filter on and the
 * count on the rail is the count the grid shows. Band 3 is the grid that was
 * already there.
 *
 * Everything here is pure and reads wire rows only, so the picks can be
 * tested and measured without a browser (tests/openingScreen.test.mjs).
 *
 * How Band 1 ranks, and why it differs by section:
 *   beach, lake, mountain   comp.acclaim, the measured fame term of each
 *                           layer's index (Wikipedia sitelinks and pageviews
 *                           plus the count of free photographs, 60 per cent
 *                           at home and 40 per cent across Europe; see
 *                           acclaim_component in pipeline/beaches,
 *                           pipeline/lakes and pipeline/mountains). That is
 *                           what "best-known" in the heading claims.
 *   cycle, trail            no fame term exists on these wires, so the rank
 *                           is the layer's own score and the heading says
 *                           "highest-rated" instead. Not dressed up as fame.
 * At most two per country, so one country cannot fill the band, and only rows
 * whose OWN photograph is on the wire: a town's hero standing in for a walk
 * would be a claim about the path that nobody checked.
 */
import { applyBeachFacets } from './beachStory.js';
import { applyLakeFacets } from './lakeStory.js';
import { applyMountainFacets } from './mountainStory.js';
import { cycleMatchesFacets } from './cycleStory.js';
import {
  tripBand, tripHighlights, tripSuitability, isListed,
} from './trailCards.js';

export const ICON_MAX = 9;
export const ICON_MIN = 6;
// Below this the band is not drawn at all: "The 2 highest-rated walks" is
// not a showcase, it is the coverage gap the band exists to expose, and the
// report counts it instead.
export const ICON_FLOOR = 3;
export const ICON_PER_COUNTRY = 2;
export const RAIL_MIN = 4;
export const RAIL_CAP = 12;
export const RAIL_MAX = 6;

/** The row's own photograph, or null. Never a stand-in. */
export function photoOf(layer, row) {
  if (!row) return null;
  if (layer === 'cycle') return row.img || null;
  if (layer === 'trail') return row.img?.u || null;
  return row.images?.[0]?.u || null;
}

const countryOf = (layer, row) => (layer === 'trail' ? row.country : row.cc) || '';

/** Band 1's ranking key per section; see the header for why it differs. */
export function iconRank(layer, row) {
  if (layer === 'trail') return row.rating ?? -1;
  if (layer === 'cycle') return row.score ?? -1;
  return row.comp?.acclaim ?? -1;
}

/** True when the row is something a person would call by its name. A cycle
 *  route with only a network number ("Regional route 45") is real, but it is
 *  not an icon. */
function isNamed(layer, row) {
  if (layer === 'trail') return !!(row.name || '').trim() && row.category !== 'citytrip';
  return !!(row.name || '').trim();
}

/**
 * The route a cycle row is a section of, as a dedupe key. OSM maps a long
 * route as one relation per section ("EuroVelo 6 - part Austria - leg 3",
 * "Murradweg Abs. 4 Ostufer"), and the wire carries the sections, so without
 * this the band showed NCN Route 1 twice and two legs of EuroVelo 6. The key
 * is the name up to its first section marker, and every EuroVelo spelling
 * (EuroVelo 6, EV6, Eurovélo 6) folds to one. A heuristic over names, not a
 * route model: grouping by cycle_network (spec 7.1, 7.2) is the real fix.
 */
export function cycleRouteKey(row) {
  const name = String(row?.name || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const ev = name.match(/\beuro\s?velo\s*(\d+)|\bev\s?(\d+)\b/);
  if (ev) return `ev${ev[1] || ev[2]}`;
  const cut = name.split(/\s[-\u2013]\s|[([,:]|\s(?:part|abschnitt|abs\.?|etappe|teil|leg|section|troncon)(?![a-z])/)[0];
  return cut.trim() || String(row?.id ?? '');
}

/**
 * Band 1: up to nine rows, at most two per country (and per trail family, so
 * nine stages of one long-distance path cannot fill a country's band; and per
 * route for cycling, see cycleRouteKey).
 *
 * The count is snapped to six or nine, the two sizes the grid lays out
 * without a ragged last row; between three and five it is shown as it is, and
 * under three the band is not drawn. Ties on the rank fall to the score.
 */
export function pickIcons(layer, rows) {
  const pool = (rows || []).filter((r) => photoOf(layer, r) && isNamed(layer, r)
    && !isListed(r));
  pool.sort((a, b) => (iconRank(layer, b) - iconRank(layer, a))
    || ((b.score ?? b.rating ?? 0) - (a.score ?? a.rating ?? 0)));
  const perCountry = new Map();
  const families = new Set();
  const out = [];
  for (const r of pool) {
    const cc = countryOf(layer, r);
    if (layer !== 'trail' && (perCountry.get(cc) || 0) >= ICON_PER_COUNTRY) continue;
    const fam = layer === 'trail' && r.fam && r.fam.size > 1 ? r.fam.k
      : layer === 'cycle' ? cycleRouteKey(r) : null;
    if (fam && families.has(fam)) continue;
    perCountry.set(cc, (perCountry.get(cc) || 0) + 1);
    if (fam) families.add(fam);
    out.push(r);
    if (out.length === ICON_MAX) break;
  }
  if (out.length >= ICON_MAX) return out;
  if (out.length >= ICON_MIN) return out.slice(0, ICON_MIN);
  if (out.length >= ICON_FLOOR) return out;
  return [];
}

/**
 * Band 2: the rails, by section. Each is a saved filter written in the
 * section's own facet vocabulary (BEACH_FACETS, LAKE_FACETS, MOUNTAIN_FACETS,
 * CYCLE_FACET_GROUPS, and the trail chips in DestinationsTab), titled by what
 * the traveller wants rather than by the facet's name.
 *
 * Two titles from the spec are not here, on purpose (T183 report):
 * "Under two hours from an airport we price" (Carta does not price flights,
 * T272, and no row carries a distance to an airport) and "Quiet in August"
 * (no layer row carries crowding by month). "Traffic-free the whole way" is
 * worded as "Mostly away from traffic", because the carfree chip it saves is
 * 70 per cent traffic-free (cycleShapes in lib/cycleStory.js), not 100.
 */
export const OPENING_RAILS = {
  beach: [
    { key: 'water', titleKey: 'open.beach.railWater', facets: { water: ['excellent'] } },
    { key: 'sunset', titleKey: 'open.beach.railSunset', facets: { bestfor: ['sunset'] } },
    { key: 'wild', titleKey: 'open.beach.railWild', facets: { wildness: ['wild'] } },
    { key: 'cove', titleKey: 'open.beach.railCove', facets: { size: ['cove'] } },
    { key: 'surf', titleKey: 'open.beach.railSurf', facets: { bestfor: ['surf'] } },
    { key: 'lifeguard', titleKey: 'open.beach.railLifeguard', facets: { facilities: ['lifeguard'] } },
  ],
  lake: [
    { key: 'june', titleKey: 'open.lake.railJune', facets: { swim: ['yes'], month: ['jun'] } },
    { key: 'path', titleKey: 'open.lake.railPath', facets: { shore: ['path'] } },
    { key: 'wild', titleKey: 'open.lake.railWild', facets: { wild: ['wild'] } },
    { key: 'park', titleKey: 'open.lake.railPark', facets: { prot: ['np'] } },
    { key: 'water', titleKey: 'open.lake.railWater', facets: { water: ['excellent'] } },
    { key: 'mountain', titleKey: 'open.lake.railMountain', facets: { setting: ['mountain'] } },
  ],
  mountain: [
    { key: 'transit', titleKey: 'open.mtn.railTransit', facets: { acc: ['transit'] } },
    { key: 'lift', titleKey: 'open.mtn.railLift', facets: { acc: ['liftTop'] } },
    { key: 'road', titleKey: 'open.mtn.railRoad', facets: { acc: ['roadTop'] } },
    { key: 'walk', titleKey: 'open.mtn.railWalk', facets: { diff: ['walkUp'] } },
    { key: 'water', titleKey: 'open.mtn.railWater', facets: { kind: ['water'] } },
    { key: 'volcano', titleKey: 'open.mtn.railVolcano', facets: { kind: ['volcano'] } },
  ],
  cycle: [
    { key: 'carfree', titleKey: 'open.cycle.railCarfree', facets: { shape: ['carfree'] } },
    { key: 'flat', titleKey: 'open.cycle.railFlat', facets: { climb: ['flat'] } },
    { key: 'day', titleKey: 'open.cycle.railDay', facets: { length: ['day'] } },
    { key: 'paved', titleKey: 'open.cycle.railPaved', facets: { surface: ['paved'] } },
    { key: 'gravel', titleKey: 'open.cycle.railGravel', facets: { bike: ['gravel'] } },
    { key: 'loop', titleKey: 'open.cycle.railLoop', facets: { shape: ['loop'] } },
  ],
  // The trail chips are separate state in DestinationsTab (bands, hls,
  // suits, loopsOnly); the keys here are those names.
  trail: [
    { key: 'loop', titleKey: 'open.trail.railLoop', facets: { loopsOnly: true } },
    { key: 'waterfall', titleKey: 'open.trail.railWaterfall', facets: { hls: ['waterfall'] } },
    { key: 'summit', titleKey: 'open.trail.railSummit', facets: { hls: ['summit'] } },
    { key: 'family', titleKey: 'open.trail.railFamily', facets: { suits: ['family'] } },
    { key: 'short', titleKey: 'open.trail.railShort', facets: { bands: ['short'] } },
    { key: 'lake', titleKey: 'open.trail.railLake', facets: { hls: ['lake'] } },
  ],
};

/** The same union-inside, intersection-across rule DestinationsTab's
 *  tripRows applies, for the four trail chip groups a rail can save. */
export function trailMatches(tr, f) {
  if (!tr || tr.category === 'citytrip') return false;
  if (f.bands?.length && !f.bands.includes(tripBand(tr))) return false;
  if (f.hls?.length && !f.hls.some((k) => tripHighlights(tr).includes(k))) return false;
  if (f.suits?.length && !f.suits.some((k) => tripSuitability(tr).includes(k))) return false;
  if (f.loopsOnly && !tr.is_loop) return false;
  return true;
}

/** Every row a rail's saved filter keeps, through the section's own filter
 *  function, so the rail and the grid cannot disagree. */
export function railMatches(layer, rows, facets) {
  const list = rows || [];
  if (layer === 'beach') return applyBeachFacets(list, facets);
  if (layer === 'lake') return applyLakeFacets(list, facets);
  if (layer === 'mountain') return applyMountainFacets(list, facets);
  if (layer === 'cycle') return list.filter((r) => cycleMatchesFacets(r, facets));
  if (layer === 'trail') return list.filter((r) => trailMatches(r, facets));
  return [];
}

const scoreOf = (layer, r) => (layer === 'trail' ? r.rating : r.score) ?? -1;

/**
 * Which rows a rail shows, in order: photographed rows first (a rail is a
 * row of pictures), then by score, then taking each country's best in turn so
 * a Europe-wide rail does not open on six rows from one country. A trail rail
 * is one country already, so it is score order alone.
 */
export function railOrder(layer, rows) {
  const sorted = [...rows].sort((a, b) => (
    (photoOf(layer, b) ? 1 : 0) - (photoOf(layer, a) ? 1 : 0))
    || (scoreOf(layer, b) - scoreOf(layer, a)));
  if (layer === 'trail') return sorted.slice(0, RAIL_CAP);
  const queues = new Map();
  for (const r of sorted) {
    const cc = countryOf(layer, r);
    if (!queues.has(cc)) queues.set(cc, []);
    queues.get(cc).push(r);
  }
  const lanes = [...queues.values()];
  const out = [];
  while (out.length < RAIL_CAP && lanes.some((q) => q.length)) {
    for (const q of lanes) {
      if (q.length && out.length < RAIL_CAP) out.push(q.shift());
    }
  }
  return out;
}

/**
 * The rails a section shows: every defined rail with at least RAIL_MIN rows
 * behind it, at most RAIL_MAX of them. Returns { def, n, rows } where n is
 * the full count (what "See all" opens) and rows the capped, ordered strip.
 * A rail under the minimum is dropped rather than shown thin; the opening
 * report counts how many survive per section.
 */
export function buildRails(layer, rows) {
  const out = [];
  for (const def of OPENING_RAILS[layer] || []) {
    const hit = railMatches(layer, rows, def.facets);
    if (hit.length < RAIL_MIN) continue;
    out.push({ def, n: hit.length, rows: railOrder(layer, hit) });
    if (out.length === RAIL_MAX) break;
  }
  return out;
}
