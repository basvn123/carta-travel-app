/**
 * What a picked search result means for the list (G12, decision.md 3):
 *
 *   place     a Carta place: that place
 *   near      a town Carta does not cover: Carta's places by distance
 *   region    a region: the places inside it (its box, and its country
 *             when known, so a box over a border keeps to one side)
 *   country   the places in that country
 *   feature   only feature words: every place with them
 *
 * Feature tokens then keep the places that have every feature. Pure: the
 * caller passes Carta's places (lib/search/places.js cartaPlaces).
 */
import { hasFeatures } from './features.js';
import { kmBetween, inBox } from './places.js';

// "Near" reads as walking-and-bus distance first; a remote town still gets
// a short list from further out rather than nothing.
export const NEAR_KM = 40;
export const NEAR_MIN = 5;
export const NEAR_MAX_KM = 150;

/** Carta's places near a point, nearest first: [{ id, km }]. */
export function placesNear(places, lat, lon) {
  const all = [];
  for (const p of places) {
    const km = kmBetween(lat, lon, p.lat, p.lon);
    if (km <= NEAR_MAX_KM) all.push({ p, km });
  }
  all.sort((a, b) => a.km - b.km);
  const close = all.filter((x) => x.km <= NEAR_KM);
  const list = close.length >= NEAR_MIN ? close : all.slice(0, NEAR_MIN);
  return list.map(({ p, km }) => ({ p, id: p.id, km }));
}

function centre(bbox) {
  return { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 };
}

/**
 * -> ordered place ids for a result. A region with no Carta place inside
 * falls back to the places nearest its middle, so a pick never lands on an
 * empty list.
 */
export function resolveIds(result, places) {
  const tokens = result?.tokens || [];
  const keep = (p) => hasFeatures(p.categories, tokens);
  switch (result?.type) {
    case 'place':
      return places.some((p) => p.id === result.id) ? [result.id] : [];
    case 'near': {
      // Near a town with features: the nearby places that have them.
      const near = placesNear(places.filter(keep), result.lat, result.lon);
      return near.map((x) => x.id);
    }
    case 'region': {
      const inside = places.filter((p) => inBox(p, result.bbox)
        && (!result.cc || p.iso2 === result.cc) && keep(p));
      if (inside.length) return inside.map((p) => p.id);
      const c = centre(result.bbox);
      return placesNear(places.filter(keep), c.lat, c.lon).map((x) => x.id);
    }
    case 'country':
      return places.filter((p) => p.iso2 === result.cc && keep(p)).map((p) => p.id);
    case 'feature':
      return places.filter(keep).map((p) => p.id);
    default:
      return [];
  }
}

/**
 * The hits object Explore's list filter reads (useExploreCatalog
 * `searchHits`, the shape of lib/searchIndex.js querySearchIndex): the ids
 * decide, the box is left out because the ids already respect it.
 * `regionLabel` drives the list's "Showing places in {region}" line, so it
 * is set for a region or a country only.
 */
export function hitsFor(result, ids) {
  const area = result?.type === 'region' || result?.type === 'country';
  return {
    ids: new Set(ids),
    bbox: null,
    regionLabel: area ? result.name : null,
    memberHits: [],
    suggestions: [],
    picked: result?.type || null,
  };
}
