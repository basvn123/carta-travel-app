/**
 * The arithmetic behind the five signature visuals (T181, destinations spec
 * 5.5). Pure functions, no React, so tests/signature.test.mjs can hold them
 * still while the drawing changes.
 *
 * The family rule the spec sets is that every visual is the same instrument:
 * a twelve-cell month row or one 100%-wide bar, on --paper-dim, labelled in
 * mono, over one hairline axis. Everything here returns shares of 1 (for a
 * width or a height) or plain figures for the labels; the components in
 * browse/Signature.jsx and browse/RouteFigures.jsx only lay them out.
 *
 * Every scale is fixed rather than fitted to the one place on screen, so two
 * lakes, two mountains or two walks read against the same ruler. That is
 * what makes a tarn and Lake Geneva comparable, and what makes the card
 * strips scannable down a list.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* ── Slope ─────────────────────────────────────────────────────────────── */

/**
 * The two grades the trail wire already reports (pipeline/trails/elevation.py
 * steep_shares: steep10_pct and steep15_pct, the share of the walk steeper
 * than 10 and 15 percent). The profile on the page and the strip on the card
 * use the same two steps, so the shading on one is the bar on the other.
 */
export const SLOPE_STEPS = [10, 15];

/** 0 under 10 percent, 1 from 10 to 15, 2 over 15. Uphill or downhill alike. */
export function slopeClass(gradePct) {
  const g = Math.abs(num(gradePct) ?? 0);
  if (g > SLOPE_STEPS[1]) return 2;
  if (g > SLOPE_STEPS[0]) return 1;
  return 0;
}

/**
 * The profile cut into runs of one slope class: [{ cls, from, to }] where
 * from and to are indexes into the profile, so a run covers the segments
 * from..to. `profile` is [[along_m, ele_m], ...]. Fewer than two usable
 * points give no runs.
 *
 * Each segment's grade is read over a window of at least `spanM` metres
 * centred on it, because the pipeline measures its steep shares over about
 * 90 m (pipeline/trails/elevation.py, GRADE_SPAN_STEPS) and a 60 m step of
 * DEM noise would otherwise stripe the profile with one-sample "walls". A
 * profile coarser than the window (the cycling wire samples every 450 m)
 * is read segment by segment, as it is.
 */
export function slopeRuns(profile, spanM = 90) {
  if (!Array.isArray(profile) || profile.length < 2) return [];
  const n = profile.length;
  const runs = [];
  for (let i = 1; i < n; i += 1) {
    let a = i - 1;
    let b = i;
    while (profile[b][0] - profile[a][0] < spanM && (a > 0 || b < n - 1)) {
      if (b < n - 1) b += 1;
      if (profile[b][0] - profile[a][0] >= spanM) break;
      if (a > 0) a -= 1;
    }
    const dx = profile[b][0] - profile[a][0];
    const grade = dx > 0 ? ((profile[b][1] - profile[a][1]) / dx) * 100 : 0;
    const cls = slopeClass(grade);
    const last = runs[runs.length - 1];
    if (last && last.cls === cls) last.to = i;
    else runs.push({ cls, from: i - 1, to: i });
  }
  return runs;
}

/**
 * The three slope shares from the wire's two percentages, as MixBar parts
 * without their labels: [{ key, tone, share }] summing to 1. Null when the
 * wire carries no reading. Accepts the detail block's names (steep10_pct,
 * steep15_pct) and the card's (p10, p15).
 */
export function slopeShares(steep) {
  if (!steep) return null;
  const p10 = num(steep.steep10_pct ?? steep.p10);
  const p15 = num(steep.steep15_pct ?? steep.p15);
  if (p10 == null || p15 == null) return null;
  const over = clamp01(p15 / 100);
  const mid = clamp01(Math.max(0, p10 - p15) / 100);
  const under = clamp01(1 - over - mid);
  return [
    { key: 'under', tone: 'slope0', share: under },
    { key: 'mid', tone: 'slope1', share: mid },
    { key: 'over', tone: 'slope2', share: over },
  ];
}

/**
 * The profile read at a distance along it: the height there and the grade of
 * the segment it falls in. Linear between the two points either side.
 */
export function profileAt(profile, along) {
  if (!Array.isArray(profile) || profile.length < 2 || num(along) == null) return null;
  const last = profile[profile.length - 1];
  const d = Math.max(profile[0][0], Math.min(last[0], along));
  for (let i = 1; i < profile.length; i += 1) {
    const [d0, e0] = profile[i - 1];
    const [d1, e1] = profile[i];
    if (d <= d1 || i === profile.length - 1) {
      const span = d1 - d0;
      const t = span > 0 ? (d - d0) / span : 0;
      return {
        along: d,
        ele: e0 + t * (e1 - e0),
        grade: span > 0 ? ((e1 - e0) / span) * 100 : 0,
      };
    }
  }
  return null;
}

/**
 * A point on the route line `m` metres from its start. `pts` is
 * lib/trailGeo.routePoints output ([{ lon, lat, m }]). Null on an empty line.
 */
export function pointAlong(pts, m) {
  if (!Array.isArray(pts) || pts.length === 0 || num(m) == null) return null;
  if (m <= pts[0].m) return { lon: pts[0].lon, lat: pts[0].lat };
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (m <= b.m) {
      const span = b.m - a.m;
      const t = span > 0 ? (m - a.m) / span : 0;
      return { lon: a.lon + t * (b.lon - a.lon), lat: a.lat + t * (b.lat - a.lat) };
    }
  }
  const z = pts[pts.length - 1];
  return { lon: z.lon, lat: z.lat };
}

/* ── Month rows ────────────────────────────────────────────────────────── */

/**
 * One water temperature scale for every lake (and, once the sea record
 * exists, every beach): 0 to 28 degrees. The warmest month in the lake wire
 * is under that, so no bar is ever clipped, and a cold tarn reads as short
 * bars next to a warm lowland lake instead of being stretched to fill the row.
 */
export const TEMP_SCALE_C = 28;

/**
 * Twelve monthly values as cells: [{ n, value, h, on, peak }]. h is the bar
 * height as a share of the row, on the fixed scale; on is "at or above the
 * threshold"; peak marks the single warmest month (the first, on a tie).
 * Null unless all twelve are numbers.
 */
export function monthCells(values, { threshold = null, scale = TEMP_SCALE_C } = {}) {
  if (!Array.isArray(values) || values.length !== 12 || values.some((v) => num(v) == null)) return null;
  let peakAt = 0;
  values.forEach((v, i) => { if (v > values[peakAt]) peakAt = i; });
  return values.map((v, i) => ({
    n: i + 1,
    value: v,
    h: clamp01(v / scale),
    on: threshold != null && v >= threshold,
    peak: i === peakAt,
  }));
}

/* ── Mountains ─────────────────────────────────────────────────────────── */

/**
 * The altitude ruler: 0 to 5,000 m, a round figure just above Mont Blanc
 * (4,806 m in the mountain wire, the highest summit Carta publishes), so the
 * Alps' top fills the bar and a 900 m hill is a fifth of it.
 */
export const ALT_SCALE_M = 5000;

/**
 * Height and prominence as shares of the ruler: { base, prom } where base is
 * the part below the key col (drawn pale) and prom the part above it (drawn
 * solid). Prominence is capped at the height; a missing prominence draws the
 * whole height pale. Null without a height.
 */
export function altitudeParts(ele, prom) {
  const e = num(ele);
  if (e == null || e <= 0) return null;
  const p = Math.min(e, Math.max(0, num(prom) ?? 0));
  return { base: clamp01((e - p) / ALT_SCALE_M), prom: clamp01(p / ALT_SCALE_M) };
}

/* ── Lakes ─────────────────────────────────────────────────────────────── */

/**
 * The depth-versus-area wedge (destinations spec E4) on two fixed log
 * scales. Width is the square root of the area, from 0.1 km (a 1 ha pond)
 * to 100 km (10,000 km2, above Europe's largest lake in the wire); height is
 * the greatest depth from 1 m to 500 m. Returns shares of the track,
 * { w, h }, or null when either figure is missing.
 */
export const WEDGE_SIDE_KM = [0.1, 100];
export const WEDGE_DEPTH_M = [1, 500];

const logShare = (v, [lo, hi]) => clamp01((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)));

export function lakeWedge(areaKm2, depthM) {
  const a = num(areaKm2);
  const d = num(depthM);
  if (a == null || d == null || a <= 0 || d <= 0) return null;
  return {
    // A sliver still shows: a 1 ha pond keeps 3 percent of the width.
    w: Math.max(0.03, logShare(Math.sqrt(a), WEDGE_SIDE_KM)),
    h: Math.max(0.06, logShare(d, WEDGE_DEPTH_M)),
  };
}

/* ── Beaches ───────────────────────────────────────────────────────────── */

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The eight-point compass word for an azimuth in degrees: 'N' to 'NW'. */
export function compassPoint(deg) {
  const d = num(deg);
  if (d == null) return null;
  const k = Math.round((((d % 360) + 360) % 360) / 45) % 8;
  return DIRS[k];
}

/* ── Card strips ───────────────────────────────────────────────────────── */

/**
 * The paved share of a cycling card (the wire's `paved`, measured over the
 * length that carries a surface tag) as two MixBar parts. Null without it.
 */
export function pavedShares(paved) {
  const p = num(paved);
  if (p == null) return null;
  const s = clamp01(p);
  return [
    { key: 'paved', tone: 'paved', share: s },
    { key: 'unpaved', tone: 'gravel', share: 1 - s },
  ];
}

/* ── Route bars ────────────────────────────────────────────────────────── */

/**
 * Kilometres for a share of a length in metres, one decimal: "71.2 km".
 * Undefined without a usable length, so a key falls back to the share.
 */
export const kmOf = (share, totalM) => (Number.isFinite(totalM) && totalM > 0
  ? `${((share * totalM) / 1000).toFixed(1)} km` : undefined);

/**
 * The traffic split as MixBar parts. `split` is { free, shared, unknown } in
 * shares of 1, from lib/routeFigures.trafficSplit or from a cycling wire's
 * traffic_free_share and highway_known_share. With `totalM` each part carries
 * its kilometres (the cycling signature, T181).
 */
export function trafficMix(split, t, totalM = null) {
  if (!split) return null;
  return [
    { key: 'free', tone: 'free', label: t('route.trafficFree'), share: split.free || 0 },
    { key: 'shared', tone: 'shared', label: t('route.trafficShared'), share: split.shared || 0 },
    { key: 'unknown', tone: 'unknown', label: t('route.trafficUnknown'), share: split.unknown || 0 },
  ].map((p) => ({ ...p, value: kmOf(p.share, totalM) }));
}
