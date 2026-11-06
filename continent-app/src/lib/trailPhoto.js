/**
 * trailPhoto.js, which picture stands on a trail card (G8, T1127).
 *
 * 78% of the published walks have no photograph of their own (14,065 of
 * 17,958 in the shipped wire). The rule, in order, is:
 *
 *   1. own      the walk's own Commons photograph (shot on the route).
 *   2. feature  a licensed beach, lake or summit photograph that stands
 *               within FEATURE_KM of the walk's centre, when the walk's own
 *               highlights say it passes that kind of feature (lake, summit,
 *               coast). That is a picture of what the walk is about.
 *   3. town     the nearest catalogue place's hero within TOWN_KM (the rule
 *               lib/trailCards.js had since T3xx), captioned with the town.
 *   4. near     any licensed feature photograph within NEAR_KM, captioned.
 *   5. none     the designed route placeholder. Never a picture from further
 *               away: a photograph of somewhere else answers "what does this
 *               walk look like" with a confident lie.
 *
 * Only licensed images reach the pool: the beach, lake and mountain wires
 * carry licence and author per photograph (pipeline/photos gates), and the
 * veto list (photoVeto.js) is applied here. Pure; the pool is passed in.
 */
import { haversineKm } from './nearby.js';
import { okPhoto } from './photoVeto.js';

export const FEATURE_KM = 5;
export const TOWN_KM = 25;
export const NEAR_KM = 10;

/** The kind of feature each walk highlight asks for. */
const HIGHLIGHT_KIND = { lake: 'lake', summit: 'peak', peak: 'peak', coast: 'beach', beach: 'beach' };

/**
 * One pool entry per feature row that has a licensed, unvetoed photograph:
 * { lat, lon, kind, name, url, by, lic, page }. `rows` are a layer's wire
 * rows (images[0] is its lead photograph).
 */
export function poolFrom(kind, rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!Number.isFinite(r?.lat) || !Number.isFinite(r?.lon)) continue;
    const im = (r.images || []).find((i) => i && (i.u || i.url) && i.lic && okPhoto(i.u || i.url));
    if (!im) continue;
    out.push({
      lat: r.lat, lon: r.lon, kind, name: r.name || '',
      url: im.u || im.url, by: im.by || '', lic: im.lic, page: im.page || null,
    });
  }
  return out;
}

function nearest(pool, lat, lon, maxKm, kinds) {
  let best = null, bestKm = maxKm;
  for (const p of pool) {
    if (kinds && !kinds.has(p.kind)) continue;
    const km = haversineKm(lat, lon, p.lat, p.lon);
    if (km <= bestKm) { bestKm = km; best = p; }
  }
  return best ? { p: best, km: bestKm } : null;
}

/**
 * @param {object} a
 * @param {string|null} a.own       the walk's own photograph URL
 * @param {{lat:number,lon:number}|null} a.centre
 * @param {string[]} [a.highlights] the walk's f.hl
 * @param {{url:string,city:string,km:number}|null} [a.town] nearest hero, any distance
 * @param {object[]} [a.pool]       poolFrom() entries
 * @returns {{ url: string|null, of: string|null, source: string, by?: string, lic?: string, page?: string|null }}
 */
export function pickTrailPhoto({ own = null, centre = null, highlights = [], town = null, pool = [] } = {}) {
  if (own) return { url: own, of: null, source: 'own' };
  if (centre && pool.length) {
    const kinds = new Set((highlights || []).map((h) => HIGHLIGHT_KIND[h]).filter(Boolean));
    if (kinds.size) {
      const f = nearest(pool, centre.lat, centre.lon, FEATURE_KM, kinds);
      if (f) return fromPool(f.p, 'feature');
    }
  }
  if (town?.url && Number.isFinite(town.km) && town.km <= TOWN_KM) {
    return { url: town.url, of: town.city || null, source: 'town' };
  }
  if (centre && pool.length) {
    const f = nearest(pool, centre.lat, centre.lon, NEAR_KM, null);
    if (f) return fromPool(f.p, 'near');
  }
  return { url: null, of: null, source: 'none' };
}

const fromPool = (p, source) => ({ url: p.url, of: p.name || null, source, by: p.by, lic: p.lic, page: p.page });
