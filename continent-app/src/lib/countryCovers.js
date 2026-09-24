/**
 * Which photograph stands for a country.
 *
 * The Where step draws 43 countries as a wall of 4:3 photo cards, and this
 * decides what is in each one. It lives here rather than inside the wizard so
 * the rules below can be stated and tested against the real catalogue, which
 * is the only way to know whether a change to them made the grid better or
 * merely different.
 *
 * The base rule is the one the Destinations tab uses, so the two indexes show
 * a country the same way: the country's best-RATED place supplies the picture,
 * and fame only breaks ties. Ranking by fame instead handed every country its
 * capital's least flattering municipal building; rating gives Santorini,
 * Lauterbrunnen, Barcelona.
 *
 * Four things narrow it further, in the order the sort applies them:
 *
 *   1. A photograph another destination has a better claim to is not used at
 *      all (duplicateHeroes: the Roman Baths front Bath, not the Belgian town
 *      of Spa).
 *   2. An airport record loses to any real place. A gateway is famous without
 *      being worth looking at, and this grid is only pictures.
 *   3. A landscape frame beats a portrait one. See shapeBucket.
 *   4. No two countries show the same file, so a shared hero cannot make two
 *      cards in one grid look like the same country twice.
 */

import { duplicateHeroes } from './heroImage.js';

// Lead images that are not photographs: heraldry, locator maps, flags, and
// anything rendered from an SVG (which on Commons is nearly always a diagram).
// Those read as clip art in a grid of photos.
export const NON_PHOTO_IMG = /coat[_-]of[_-]arms|wappen|blason|escudo|flag|[_-]map[._]|position[_-]of|locator|karte|seal|emblem|logo|\.svg/i;

/**
 * Landscape enough for a 4:3 card, as one bit.
 *
 * A country card is a 4:3 box, so a PORTRAIT photograph is the problem: poured
 * into a landscape card it keeps a vertical strip through the middle, which is
 * a doorway, a spire's shaft or somebody's balcony. 150 of the catalogue's
 * 3,841 measured heroes are portrait or square.
 *
 * This buckets on ORIENTATION rather than on how much of the frame survives,
 * because the surviving fraction does not rank the way the eye does: a 2:1
 * panorama keeps 67 per cent of itself and looks fine, a 3:4 portrait keeps 56
 * and looks broken. Only the second is worth demoting.
 *
 *   1  landscape (4:5 or wider), or unmeasured - unknown is not the same as bad
 *   0  taller than it is wide
 *
 * One bit, deliberately. Shape should TIP the choice between comparable places,
 * not reorder the country. An earlier version sorted on the surviving fraction
 * in three bands and traded Mostar's bridge (fame 538) for Sutjeska (fame 31)
 * to win a few per cent of crop, which is the wrong trade: a grid of countries
 * is worth more when it shows places people recognise.
 *
 * Needs image.w / image.h, which pipeline/apply_image_dims.py puts on the wire.
 */
export function shapeBucket(image) {
  const w = image?.w;
  const h = image?.h;
  if (!w || !h) return 1;
  return w / h >= 0.8 ? 1 : 0;
}

/**
 * Cover photo per country.
 *
 * @param countries    countriesFromData() output: [{ country, cities: [{ id, dest }] }]
 * @param destinations the whole catalogue, for the duplicate-hero pass
 * @returns Map(countryName -> photo url)
 */
export function pickCountryCovers(countries, destinations) {
  const dupes = duplicateHeroes(destinations || {});
  return pickWithDupes(countries, dupes);
}

/** The picker, given an already-computed duplicate set (the memoised path). */
export function pickWithDupes(countries, dupes) {
  const covers = new Map();
  const used = new Set();
  // Highest-rated country first, so when two countries want the same file the
  // one with the stronger claim keeps it and the other steps down.
  const byRank = [...(countries || [])].sort((a, b) => (
    bestScore(b) - bestScore(a)
  ));
  for (const c of byRank) {
    const ranked = (c.cities || [])
      .filter((x) => x.dest?.image?.url && !dupes.has(x.id))
      .sort((a, b) => (a.dest.tier === 'airport') - (b.dest.tier === 'airport')
        || shapeBucket(b.dest.image) - shapeBucket(a.dest.image)
        || (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0)
        || (b.dest.rating?.fame || 0) - (a.dest.rating?.fame || 0));
    // Step down past the clip art, but never to nothing: a country with only
    // a coat of arms is better served by the coat of arms than by a grey hole.
    const usable = ranked.filter((x) => !NON_PHOTO_IMG.test(x.dest.image.url));
    const pool = usable.length ? usable : ranked;
    const pick = pool.find((x) => !used.has(x.dest.image.url)) || pool[0];
    if (pick) {
      covers.set(c.country, pick.dest.image.url);
      used.add(pick.dest.image.url);
    }
  }
  return covers;
}

const bestScore = (c) => (c.cities || []).reduce(
  (best, x) => Math.max(best, x.dest?.rating?.score || 0), 0,
);
