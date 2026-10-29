/**
 * Swap city (T841, owner board panel 7: "let them choose, pick it
 * themselves or let Carta guide, with question logic that makes sense"):
 * the places that could take a stop's place, keeping its dates and nights.
 * Pure, so the node tests hold it.
 *
 * "I know where" searches every place by name; with no query it lists the
 * nearest ones. "Help me choose" asks what the traveller wants there, how
 * big a place and how far off the route, then ranks the places in reach the
 * way Explore's For you does (lib/match.js sortForYou), so a swap and a
 * browse agree.
 */
import { cityCoords, haversineKm } from '../../lib/runtime_pricing.js';
import { normalizeTaste } from '../../lib/taste.js';
import { sortForYou } from '../../lib/match.js';

/** How far from the stop each answer reaches, in km as the crow flies. */
export const REACH_KM = Object.freeze({ near: 60, mid: 150, far: 400 });

// Diacritics and case do not matter in a search ("Sankt Wolfgang", "salzburg").
const fold = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Places that could take the stop's place: every destination with a
 * position, not already on the trip, with its distance from the stop.
 *   destinations  the catalogue ({ id: dest })
 *   from          the stop's destination
 *   exclude       destination ids on the trip
 *   query         a name to search for ('' lists by distance)
 *   maxKm         only places this close (null: any distance)
 *   limit         how many to return
 * Returns [{ dest, km }] nearest first, or best name match first with a query.
 */
export function swapCandidates({ destinations, from, exclude = [], query = '', maxKm = null, limit = 8 } = {}) {
  const here = from ? cityCoords(from) : null;
  const skip = new Set(exclude);
  const q = fold(query);
  const out = [];
  for (const dest of Object.values(destinations || {})) {
    if (!dest || skip.has(dest.id)) continue;
    const c = cityCoords(dest);
    if (!Number.isFinite(c?.lat) || !Number.isFinite(c?.lon)) continue;
    const km = here && Number.isFinite(here.lat) ? haversineKm(here.lat, here.lon, c.lat, c.lon) : null;
    if (maxKm != null && (km == null || km > maxKm)) continue;
    let rank = 0;
    if (q) {
      const name = fold(dest.city);
      if (name === q) rank = 3;
      else if (name.startsWith(q)) rank = 2;
      else if (name.includes(q)) rank = 1;
      else continue;
    }
    out.push({ dest, km, rank });
  }
  out.sort((a, b) => (b.rank - a.rank) || ((a.km ?? Infinity) - (b.km ?? Infinity)));
  return out.slice(0, limit).map(({ dest, km }) => ({ dest, km }));
}

/**
 * Carta's picks for a stop: the places within `reach` of it, ranked by the
 * traveller's answers ({ likes[], size }) for the month of the stay.
 * Returns up to `limit` of [{ dest, km }].
 */
export function swapPicks({ destinations, from, exclude = [], likes = [], size = null, reach = 'mid', month = null, limit = 5 } = {}) {
  const pool = swapCandidates({ destinations, from, exclude, maxKm: REACH_KM[reach] ?? REACH_KM.mid, limit: 400 });
  const taste = normalizeTaste({ likes, size });
  const byId = new Map(pool.map((p) => [p.dest.id, p]));
  return sortForYou(pool.map((p) => p.dest), taste, month).slice(0, limit).map((d) => byId.get(d.id));
}
