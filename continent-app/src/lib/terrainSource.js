/**
 * Where the 3D terrain (raster-dem) tiles come from (T233).
 *
 * Mapterhorn publishes no SLA, rate limit or fair-use policy, so the plan is to
 * mirror its European terrain into Carta's own R2 bucket and read it from
 * there. This module is the one place the app decides which host to use, so
 * the switch is a single config value and no map code changes when it flips.
 *
 *   VITE_TERRAIN_PMTILES_URL unset  -> Mapterhorn's public XYZ tiles (default)
 *   VITE_TERRAIN_PMTILES_URL set    -> the mirror, a single PMTiles archive
 *                                      read with HTTP range requests
 *
 * The attribution is the same in both modes: the tiles are still Mapterhorn's
 * data, only the host changes.
 *
 * Nothing draws terrain yet (PointMap's 3D toggle belongs to the terrain
 * work). The map that does will call terrainSourceSpec() and pass the result
 * to map.addSource('terrain', spec). A PMTiles URL needs the `pmtiles://`
 * protocol registered with maplibregl.addProtocol; that package is not a
 * dependency today, so `needsPmtilesProtocol` tells the caller to do it.
 */

export const MAPTERHORN_TILES = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
export const TERRAIN_ATTRIBUTION = "<a href='https://mapterhorn.com/attribution'>© Mapterhorn</a>";

// Same rule as dataHost.js: https only, or a loopback http host for local
// stand-ins. Anything else is ignored so a typo falls back to the default.
export function normalisePmtilesUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return '';
  if (u.search || u.hash) return '';
  if (!/\.pmtiles$/i.test(u.pathname)) return '';
  return s;
}

const ENV = (import.meta && import.meta.env) || {};

/**
 * The MapLibre source definition for terrain. `env` is for tests; the app
 * always reads the build's own environment.
 */
export function terrainSourceSpec(env = ENV) {
  const pm = normalisePmtilesUrl(env.VITE_TERRAIN_PMTILES_URL);
  const common = {
    type: 'raster-dem',
    encoding: 'terrarium',
    tileSize: 512,
    maxzoom: 13,
    attribution: TERRAIN_ATTRIBUTION,
  };
  if (pm) {
    return { mode: 'mirror', needsPmtilesProtocol: true, spec: { ...common, url: `pmtiles://${pm}` } };
  }
  return { mode: 'mapterhorn', needsPmtilesProtocol: false, spec: { ...common, tiles: [MAPTERHORN_TILES] } };
}
