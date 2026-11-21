/**
 * Where a place lands on the light Europe plate (public/europe_map.json,
 * G12 My trips atlas, decision 4): the plate is drawn in a Lambert azimuthal
 * equal-area projection centred on 52N 10E, then shifted and scaled into a
 * 1000-wide viewBox (pipeline/oneoff/build_europe_map.py). The plate file
 * does not carry its frame, so the constants live here.
 *
 * PLATE was fitted by least squares to the 59 points the prototype's prep
 * script projected with the builder's own frame (prototype/prep_atlas.py in
 * the run folder); the largest miss is 0.06 units, under the 0.1 the plate
 * is rounded to. Rebuild the plate and these must be refitted.
 *
 * Pure: no DOM.
 */

const R = 6371;
const LON0 = (10 * Math.PI) / 180;
const LAT0 = (52 * Math.PI) / 180;

export const PLATE = Object.freeze({
  minx: -1758.53,
  maxy: 2288.33,
  scale: 0.249314,
  w: 1000,
  h: 1034.5,
});

/** Lambert azimuthal equal-area, in km from 52N 10E: [x east, y north]. */
export function laea(lat, lon) {
  const lam = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const k = Math.sqrt(2 / (1 + Math.sin(LAT0) * Math.sin(phi) + Math.cos(LAT0) * Math.cos(phi) * Math.cos(lam - LON0)));
  return [
    R * k * Math.cos(phi) * Math.sin(lam - LON0),
    R * k * (Math.cos(LAT0) * Math.sin(phi) - Math.sin(LAT0) * Math.cos(phi) * Math.cos(lam - LON0)),
  ];
}

/** A latitude and longitude on the plate's viewBox: [x, y], y down. Null without a position. */
export function project(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const [x, y] = laea(lat, lon);
  return [(x - PLATE.minx) * PLATE.scale, (PLATE.maxy - y) * PLATE.scale];
}

/**
 * The viewBox that shows every point with room round it, at the slot's own
 * aspect (width / height). `minW` keeps one city from filling the slot (in
 * plate units, so 220 is about four countries wide in the middle of Europe);
 * `pad` is the share of the points' span added on each side.
 * @returns {{x, y, w, h}}
 */
export function frame(points, aspect = 1, { minW = 220, pad = 0.4 } = {}) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!pts.length) return { x: 0, y: 0, w: PLATE.w, h: PLATE.w / aspect };
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  let w = Math.max(x1 - x0, 1) * (1 + pad * 2);
  let h = Math.max(y1 - y0, 1) * (1 + pad * 2);
  w = Math.max(w, minW);
  h = Math.max(h, minW / aspect);
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * A frame kept inside the plate, so a wide pane never shows past the plate's
 * land edges (a flat cut of the east and a strip of bare pane, judgement 1).
 * The plate's west edge is open Atlantic, so the frame may run up to `west`
 * units past it (more sea, nothing cut); the north, east and south edges cut
 * land and hold. A frame too big for that room shrinks round its centre at
 * the same aspect, then slides back inside; the aspect is the pane's, so
 * the plate still covers it.
 * @returns {{x, y, w, h}}
 */
export function clampFrame(f, W = PLATE.w, H = PLATE.h, west = 400) {
  let { w, h } = f;
  const aspect = w / h;
  if (w > W + west) { w = W + west; h = w / aspect; }
  if (h > H) { h = H; w = h * aspect; }
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const x = Math.min(Math.max(cx - w / 2, -west), W - w);
  const y = Math.min(Math.max(cy - h / 2, 0), H - h);
  return { x, y, w, h };
}

/** A frame as an SVG viewBox string. */
export const viewBoxOf = (f) => `${f.x.toFixed(1)} ${f.y.toFixed(1)} ${f.w.toFixed(1)} ${f.h.toFixed(1)}`;
