/**
 * trailShape.js, the walk drawn as itself.
 *
 * A third of the walks in the wire ship without a photograph, and the two
 * honest answers to that are somebody else's picture (the nearest town's
 * hero, which trailCards.js borrows and labels) or the walk's own shape. This
 * file is the second one, for the walks with no town close enough to borrow
 * from: the geometry is already on the card, so the card can draw the path
 * instead of showing a grey hole where a picture should be.
 *
 * The projection is equirectangular with a cosine correction on longitude,
 * which is what keeps a north-south walk from being drawn as wide as an
 * east-west one of the same length. Over a bounding box a few kilometres
 * across, nothing more accurate is worth the arithmetic.
 */

/** Every coordinate ring in a LineString or MultiLineString geometry. */
function rings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

/**
 * An SVG path for one trail, in a viewBox that already has the walk's own
 * proportions, so the caller only has to say how big to draw it.
 *
 * Returns null when there is nothing to draw, which the card treats the same
 * way it treats a missing photograph.
 */
export function trailPath(geometry, opts = {}) {
  const parts = rings(geometry).filter((r) => r && r.length > 1);
  if (!parts.length) return null;

  let minLon = Infinity; let maxLon = -Infinity;
  let minLat = Infinity; let maxLat = -Infinity;
  for (const ring of parts) {
    for (const [lon, lat] of ring) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;

  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)) || 1;
  const w = Math.max((maxLon - minLon) * k, 1e-9);
  const h = Math.max(maxLat - minLat, 1e-9);
  // Draw into a box of the caller's aspect, the walk centred in it, with a
  // margin so the stroke never touches the edge.
  const aspect = opts.aspect || 3 / 2;
  const pad = 0.12;
  const boxW = 100;
  const boxH = boxW / aspect;
  const scale = Math.min((boxW * (1 - pad * 2)) / w, (boxH * (1 - pad * 2)) / h);
  const offX = (boxW - w * scale) / 2;
  const offY = (boxH - h * scale) / 2;
  const x = (lon) => (offX + (lon - minLon) * k * scale).toFixed(2);
  const y = (lat) => (offY + (maxLat - lat) * scale).toFixed(2);

  const d = parts
    .map((ring) => ring
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
      .map(([lon, lat], i) => `${i ? 'L' : 'M'}${x(lon)} ${y(lat)}`)
      .join(' '))
    .join(' ');

  return { d, viewBox: `0 0 ${boxW} ${boxH.toFixed(2)}` };
}
