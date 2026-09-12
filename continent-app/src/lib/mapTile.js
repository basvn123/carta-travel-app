/**
 * mapTile.js: a real map crop as the picture of a place that has no photograph.
 *
 * Trails, cycling routes and the smaller lakes often ship without a Commons
 * photograph. The old pages drew a grey box with a letter in it, which reads
 * as a broken image. A basemap tile centred on the feature is an honest
 * picture of the same thing (where it is).
 *
 * Host: tile.openstreetmap.org. CARTO's raster endpoints answer a browser
 * (not curl) with an "API KEY REQUIRED" watermark since 2026, and the
 * Wikimedia tile server is for Wikimedia projects only. OSM's own tiles are
 * fine for this kind of sparse use (a handful per page view, only for rows
 * without a photograph, only while the section is open); the usage policy
 * asks for a real Referer, which the browser sends, and attribution, which
 * the credits line carries. Allowed by the production CSP img-src.
 */

const TILE_HOST = 'https://tile.openstreetmap.org';

/** Web Mercator tile URL for a point at zoom z (default 12, a town and its
 *  surroundings in one 256px square). Null for a missing coordinate. */
export function tileUrl(lat, lon, z = 12) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latR = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return `${TILE_HOST}/${z}/${x}/${y}.png`;
}
