/**
 * routeEffort.js, what a route asks of the person on it (T630).
 *
 * Pure helpers for the trail, cycling and mountain sheets and the cards:
 * the SAC grade as T1 to T6, walking time at four paces with breaks, the
 * average grade, the SAC colouring of a profile, and the slope warning.
 *
 * The base walking time is NOT computed here. The pipeline stores it per
 * route under DIN 33466 (pipeline/trails/elevation.py duration_min_din33466:
 * 4 km/h flat, 300 m/h up, 500 m/h down, the smaller of the flat and the
 * vertical time counted half and added to the larger; wire `duration_min`,
 * `elevation.duration_rule` = "DIN 33466"). The app only applies a fixed
 * multiplier to that stored time.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The pace choices, as fixed multipliers on the stored DIN 33466 time. DIN
 * 33466 is the sign-post pace of an average walker with a day pack, so
 * `normal` is 1.0. A family with children walks about 30% slower (small legs,
 * more stops); a fit walker about 20% faster; a trail runner roughly covers
 * the ground in 60% of the sign-post time. The values are defensible round
 * numbers and not a measurement: this is the one place to change them.
 */
export const PACES = [
  { key: 'family', mult: 1.3, labelKey: 'route.paceFamily' },
  { key: 'normal', mult: 1.0, labelKey: 'route.paceNormal' },
  { key: 'fit', mult: 0.8, labelKey: 'route.paceFit' },
  { key: 'runner', mult: 0.6, labelKey: 'route.paceRunner' },
];
export const DEFAULT_PACE = 'normal';

/** Rest per hour of walking, as a low and a high figure, in minutes. */
export const BREAK_MIN_PER_HOUR = [10, 15];

/**
 * The time at one pace: { walk, lo, hi } in minutes. `walk` is the base time
 * times the multiplier; `lo` and `hi` add the breaks (10 to 15 min per hour
 * of walking), so the total is shown as a range. Null without a base time.
 */
export function paceTime(baseMin, paceKey = DEFAULT_PACE) {
  const base = num(baseMin);
  const pace = PACES.find((p) => p.key === paceKey);
  if (base == null || base <= 0 || !pace) return null;
  const walk = base * pace.mult;
  const hours = walk / 60;
  return {
    walk: Math.round(walk),
    lo: Math.round(walk + hours * BREAK_MIN_PER_HOUR[0]),
    hi: Math.round(walk + hours * BREAK_MIN_PER_HOUR[1]),
  };
}

/** Minutes as "2 h 05 min" (under an hour: "45 min"). */
export function clock(min) {
  const m = num(min);
  if (m == null) return null;
  const r = Math.round(m);
  if (r < 60) return `${r} min`;
  const h = Math.floor(r / 60);
  const rest = r % 60;
  return rest ? `${h} h ${String(rest).padStart(2, '0')} min` : `${h} h`;
}

/** A range of minutes, worded by the caller's `join(a, b)` (the catalogue's
 *  "{a} to {b}"); one value when both ends read the same. */
export function clockRange(lo, hi, join) {
  const a = clock(lo);
  const b = clock(hi);
  if (a == null || b == null) return null;
  return a === b ? a : join(a, b);
}

/* SAC ------------------------------------------------------------------ */

export const SAC_WORDS = [
  'hiking', 'mountain_hiking', 'demanding_mountain_hiking',
  'alpine_hiking', 'demanding_alpine_hiking', 'difficult_alpine_hiking',
];

/** The SAC grade as 1 to 6 from the OSM word ("mountain_hiking") or the T
 *  spelling ("T2", "t2"); null for anything else. */
export function sacGrade(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().split(/[;,]/)[0].trim();
  const i = SAC_WORDS.indexOf(s);
  if (i >= 0) return i + 1;
  const m = /^t([1-6])$/.exec(s);
  return m ? Number(m[1]) : null;
}

/** "T1" to "T6", or null. */
export function sacLabel(raw) {
  const g = sacGrade(raw);
  return g ? `T${g}` : null;
}

/** The three filter buckets: T1, T2, and T3 and above. */
export const SAC_BANDS = [
  { key: 'T1', labelKey: 'route.sacT1' },
  { key: 'T2', labelKey: 'route.sacT2' },
  { key: 'T3', labelKey: 'route.sacT3plus' },
];
export function sacBand(raw) {
  const g = sacGrade(raw);
  return g == null ? null : g >= 3 ? 'T3' : `T${g}`;
}

/** The SAC value a row or a detail file carries: the OSM word the country row
 *  ships (`sac_scale`), else the detail's own, else the worst member way
 *  grade the grade evidence keeps (`grade_parts.sac_worst`). */
export function trailSacRaw(row, detail = null) {
  return row?.sac_scale || detail?.sac_scale || detail?.grade_parts?.sac_worst || null;
}

/**
 * Three tones for the profile, from the three the slope colouring already
 * has (signature.css is-slope0 to 2): T1 and T2 the quiet one, T3 and T4 the
 * middle one, T5 and T6 the strong one. No new colour.
 */
export function sacTone(label) {
  const g = sacGrade(label);
  return g == null ? null : g <= 2 ? 0 : g <= 4 ? 1 : 2;
}

/**
 * The runs of a profile that lie inside SAC segments, in the shape
 * RouteFigures.SlopeProfile draws: [{ cls, from, to }] with indexes into the
 * profile. `segments` is the wire's `sac_segments`, [[from_m, to_m, "T2"]].
 * A stretch with no segment is left out (drawn plain). Positions are
 * approximate by construction (pipeline/trails/way_tags.py sac_segments), so
 * a segment is clipped to the profile and never trusted past it.
 */
export function sacRuns(profile, segments) {
  if (!Array.isArray(profile) || profile.length < 2 || !Array.isArray(segments)) return [];
  const end = profile[profile.length - 1][0];
  const out = [];
  for (const seg of segments) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const a = num(seg[0]);
    const b = num(seg[1]);
    const cls = sacTone(seg[2]);
    if (a == null || b == null || cls == null || b <= a || a >= end) continue;
    let from = -1;
    let to = -1;
    for (let i = 0; i < profile.length; i += 1) {
      if (profile[i][0] >= a && from < 0) from = i;
      if (profile[i][0] <= Math.min(b, end)) to = i;
    }
    if (from >= 0 && to > from) out.push({ cls, from, to });
  }
  return out;
}

export const hasSacSegments = (segments) => Array.isArray(segments)
  && segments.some((s) => Array.isArray(s) && s.length >= 3 && sacGrade(s[2]) != null);

/* Grade ---------------------------------------------------------------- */

/**
 * The average grade in percent, up and down alike: (ascent + descent) over
 * distance, so it pairs with the steepest grade, which is measured either way.
 * A one-way descent of 769 m over 4.6 km reads 17%, not the 0.2% its 8 m of
 * climbing would give. Without a descent it falls back to ascent over
 * distance, then to `grade_parts.ascent_per_km` (m per km, so /10 is a percent).
 */
export function averageGradePct({ distanceM, ascentM, descentM, ascentPerKm } = {}) {
  const d = num(distanceM);
  const a = num(ascentM);
  const dn = num(descentM);
  if (d != null && d > 0 && a != null) return Math.round(((a + (dn ?? 0)) / d) * 1000) / 10;
  const k = num(ascentPerKm);
  return k != null ? Math.round(k) / 10 : null;
}

/* Cycling -------------------------------------------------------------- */

/** The route shape of a cycling row or detail: `rt` where the pipeline has
 *  derived it, else `loop` when a mapper tagged it. */
export function cycleShapeKey(r) {
  if (r?.rt) return r.rt;
  return r?.loop ? 'loop' : null;
}

/** The "up to" bands for the maximum duration filter. */
export const DURATION_BANDS = [
  { key: 'd120', max: 120, labelKey: 'route.upTo2h' },
  { key: 'd240', max: 240, labelKey: 'route.upTo4h' },
  { key: 'd360', max: 360, labelKey: 'route.upTo6h' },
  { key: 'd480', max: 480, labelKey: 'route.upTo8h' },
];

/** Every "up to" band a duration fits, so a 90 minute route is under all
 *  four and a chip's count is exactly the rows it leaves. */
export function durationBands(min) {
  const m = num(min);
  return m == null ? [] : DURATION_BANDS.filter((b) => m <= b.max).map((b) => b.key);
}

/* Mountains ------------------------------------------------------------ */

export const SLOPE_WARN_DEG = 30;

/** 'warn' over 30 degrees, 'ok' at or under, null without a reading. */
export function slopeState(deg) {
  const d = num(deg);
  return d == null ? null : d > SLOPE_WARN_DEG ? 'warn' : 'ok';
}

/** The rank parts for a range rank { n, h, p }; null without one. */
export function rangeRankParts(rank) {
  if (!rank || num(rank.n) == null) return null;
  return { n: rank.n, height: num(rank.h), prominence: num(rank.p) };
}

/** One hut as the page prints it: beds, opening, how to reach it. Each part
 *  is null when OSM has nothing, and the caller shows the placeholder. */
export function hutParts(h) {
  if (!h || !h.name) return null;
  return {
    name: String(h.name),
    m: num(h.m),
    beds: num(h.beds),
    open: h.open ? String(h.open) : null,
    phone: h.phone ? String(h.phone) : null,
    web: typeof h.web === 'string' && /^https?:\/\//i.test(h.web) ? h.web : null,
    email: h.email ? String(h.email) : null,
  };
}

/** A transit flag object { rail, bus, ferry } as the list of true modes. */
export function transitModes(tr) {
  if (!tr || typeof tr !== 'object') return [];
  return ['rail', 'bus', 'ferry'].filter((k) => tr[k] === true);
}
