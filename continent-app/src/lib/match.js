/**
 * The personal match (Viantra rating v5, Layer 3): how well a place fits the
 * traveller's taste (lib/taste.js), read from the place's taste profile on
 * the wire (`dest.taste`, schema v19). Pure; every number comes from
 * config/rating.json `match`.
 *
 *   F = sum(w_k p_k) / sum(w_k) x prod(c_j)
 *
 * w is 1 per chosen like and 0.5 each for size and quiet; p is the place's
 * value for that key (a frozen percentile, so it means the same everywhere);
 * each c is a conflict factor (busy month for a quiet traveller, car needed
 * for a no-car one, over 30 degrees for someone avoiding heat).
 *
 *   forYou = Q + lambda (F - 0.5)
 *
 * The match reorders and explains; it never changes the place's own score,
 * and an empty taste returns null so every screen behaves as before.
 */
import RATING from '../../config/rating.json' with { type: 'json' };
import { normalizeTaste, hasMatchSignal } from './taste.js';

export const MATCH = Object.freeze({ ...RATING.match });

const clamp01 = (x) => Math.max(0, Math.min(1, x));
// T786: a like the profile could not measure ships as null and is left out
// of F (a 0 would read as "nothing here").
const likeValue = (profile, k) => {
  const v = profile?.likes?.[k];
  return Array.isArray(v) && v[0] != null && Number.isFinite(Number(v[0])) ? clamp01(Number(v[0])) : null;
};
const likeFact = (profile, k) => {
  const v = profile?.likes?.[k];
  return Array.isArray(v) ? v[1] ?? null : null;
};

/** The crowd tier (0 quiet to 3 crowded) in a month (1-12), or the year's mean. */
function crowdIn(profile, month) {
  const c = profile?.crowd_by_month;
  if (!Array.isArray(c) || c.length !== 12) return null;
  const m = Number(month);
  if (m >= 1 && m <= 12) return Number.isFinite(c[m - 1]) ? c[m - 1] : null;
  const vals = c.filter(Number.isFinite);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

/**
 * The fit of one place: { F, pct, bars[], conflicts[], top } or null when the
 * taste is empty or the place has no profile.
 *
 *   bars       [{ key, kind: 'like' | 'size' | 'quiet', p, fact }] one per pick
 *   conflicts  [{ key: 'busy' | 'car' | 'heat', c, month? }]
 *   top        the picks that fit best, strongest first (the card's reason)
 *
 * `opts.avoidHeat` (the traveller asked to avoid heat: Help me choose's
 * "avoid heat" answer) adds the heat conflict when the month's mean high is
 * over heat_max_c; the high is `opts.tmax` or the profile's tmax_by_month
 * (T787). The taste itself has no heat answer, so Explore never adds it.
 */
export function fit(taste, profile, month = null, opts = {}) {
  if (!hasMatchSignal(taste) || !profile) return null;
  const t = normalizeTaste(taste);
  const bars = [];
  let num = 0;
  let den = 0;
  for (const k of t.likes) {
    const p = likeValue(profile, k);
    if (p == null) continue;
    bars.push({ key: k, kind: 'like', p, fact: likeFact(profile, k) });
    num += MATCH.like_weight * p;
    den += MATCH.like_weight;
  }
  if (t.size && t.size !== 'mix' && profile.size) {
    const p = MATCH.size_fit?.[t.size]?.[profile.size];
    if (p != null) {
      bars.push({ key: t.size, kind: 'size', p, fact: { size: profile.size } });
      num += MATCH.size_weight * p;
      den += MATCH.size_weight;
    }
  }
  if (t.quiet) {
    const crowd = crowdIn(profile, month);
    let p = null;
    if (t.quiet === 'quiet' && crowd != null) p = clamp01(1 - crowd / 3);
    if (t.quiet === 'lively') p = likeValue(profile, 'nightlife');
    if (p != null) {
      bars.push({ key: t.quiet, kind: 'quiet', p, fact: { crowd, month: month || null } });
      num += MATCH.quiet_weight * p;
      den += MATCH.quiet_weight;
    }
  }

  const conflicts = [];
  const m = Number(month);
  if (t.quiet === 'quiet' && m >= 1 && m <= 12) {
    const crowd = crowdIn(profile, m);
    if (crowd != null && crowd >= MATCH.busy_min_tier) conflicts.push({ key: 'busy', c: MATCH.conflicts.busy, month: m });
  }
  if (t.noCar && profile.car_need === true) conflicts.push({ key: 'car', c: MATCH.conflicts.car });
  const tmax = opts.tmax ?? (m >= 1 && m <= 12 ? profile.tmax_by_month?.[m - 1] : null);
  if (opts.avoidHeat && tmax != null && Number(tmax) > MATCH.heat_max_c) {
    conflicts.push({ key: 'heat', c: MATCH.conflicts.heat, month: m || null });
  }

  // Nothing the place could be weighed on (a no-car answer alone is a
  // conflict, not a fit): no match, the screens keep their quality order.
  if (den === 0) return null;
  const F = clamp01((num / den) * conflicts.reduce((x, c) => x * c.c, 1));
  const top = bars.filter((b) => b.p >= 0.5).sort((a, b) => b.p - a.p);
  return { F, pct: Math.round(F * 100), bars, conflicts, top };
}

const weightOf = (b) => (b.kind === 'like' ? MATCH.like_weight : b.kind === 'size' ? MATCH.size_weight : MATCH.quiet_weight);

/**
 * The match's working, as points that add up to the shown figure (G12 map
 * view round 2, the WhyPopover): each bar earns w p / sum(w) x 100, rounded
 * by largest remainder so the bars add up to the rounded fit before any
 * conflict; the conflicts take the rest down to `f.pct`.
 *
 *   rows      [{ key, kind, p, share, points, tag }] most points first (ties
 *             in f.top order, then bar order); share is the bar's weight
 *             over the whole (its track's width), tag 'strongest' or
 *             'strong' on the first two rows with points
 *   conflict  the points the conflicts take (0 or more)
 *   conflicts [{ key, month, points }] one per conflict, its share of
 *             `conflict` (each factor takes its part of what the ones
 *             before it left), so every conflict row carries its figure
 *   pct       f.pct: sum(rows.points) - conflict === pct, always
 */
export function matchPoints(f) {
  if (!f || !Array.isArray(f.bars) || !f.bars.length) return null;
  const den = f.bars.reduce((s, b) => s + weightOf(b), 0);
  if (!(den > 0)) return null;
  const raw = f.bars.map((b) => (weightOf(b) * b.p) / den * 100);
  // The whole is worked out the way fit() works out F (the same sum in the
  // same order), so with no conflict it is exactly f.pct.
  const num = f.bars.reduce((s, b) => s + weightOf(b) * b.p, 0);
  const whole = Math.round(clamp01(num / den) * 100);
  const pts = raw.map(Math.floor);
  let left = whole - pts.reduce((s, x) => s + x, 0);
  // Largest remainder first; ties by the bar's order, so the rounding is stable.
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));
  for (let k = 0; left > 0 && k < order.length; k += 1, left -= 1) pts[order[k][1]] += 1;
  const rows = f.bars.map((b, i) => ({
    key: b.key, kind: b.kind, p: b.p, share: weightOf(b) / den, points: pts[i], tag: null,
  }));
  const topKeys = (f.top || []).map((b) => `${b.kind}:${b.key}`);
  const rank = (r) => { const i = topKeys.indexOf(`${r.kind}:${r.key}`); return i < 0 ? 1e3 : i; };
  // Judgement-4: the rows read as a ranking, so they follow the points all
  // the way down (f.top orders by fit, where a half-weight size bar can
  // lead with fewer points).
  rows.sort((a, b) => (b.points - a.points) || (rank(a) - rank(b)));
  const byPoints = rows.filter((r) => r.points > 0);
  if (byPoints[0]) byPoints[0].tag = 'strongest';
  if (byPoints[1]) byPoints[1].tag = 'strong';
  const conflict = Math.max(0, whole - f.pct);
  return { rows, conflict, conflicts: splitConflict(f.conflicts || [], clamp01(num / den) * 100, conflict), pct: f.pct };
}

// The factors multiply, so each conflict takes its factor's part of what the
// ones before it left; the parts are rounded by largest remainder so they
// add up to the conflict's whole.
function splitConflict(conflicts, base, total) {
  if (!conflicts.length) return [];
  let left = base;
  const raw = conflicts.map((c) => { const take = left * (1 - c.c); left -= take; return take; });
  const sum = raw.reduce((s, x) => s + x, 0);
  const scaled = raw.map((x) => (sum > 0 ? (x / sum) * total : 0));
  const pts = scaled.map(Math.floor);
  let rest = total - pts.reduce((s, x) => s + x, 0);
  const order = scaled.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));
  for (let k = 0; rest > 0 && k < order.length; k += 1, rest -= 1) pts[order[k][1]] += 1;
  return conflicts.map((c, i) => ({ key: c.key, month: c.month ?? null, points: pts[i] }));
}

/** True when a fit is high enough to show (55% and up). */
export function showMatch(f) {
  return !!f && f.F >= MATCH.show_min;
}

/** The quality a place is ordered by: the month score when a month is set. */
export function qualityOf(place, month = null) {
  const r = place?.rating;
  if (!r || r.score == null) return null;
  const m = Number(month);
  const ms = m >= 1 && m <= 12 ? r.month_scores?.[m] : null;
  return ms != null && Number.isFinite(Number(ms)) ? Number(ms) : Number(r.score);
}

/**
 * The "For you" order key: Q + lambda (F - 0.5). Null for an empty taste or
 * an unrated place, so the caller keeps its own order.
 */
export function forYou(place, taste, month = null, opts = {}) {
  const q = qualityOf(place, month);
  if (q == null) return null;
  const f = fit(taste, place?.taste, month, opts);
  if (!f) return null;
  return q + MATCH.lambda * (f.F - 0.5);
}

/**
 * Sort a list by "For you", best first, without dropping anything: places
 * the match cannot score keep their quality order below the scored ones.
 * Returns a new array.
 */
export function sortForYou(list, taste, month = null, opts = {}) {
  const keyed = list.map((p, i) => {
    const s = forYou(p, taste, month, opts);
    return { p, i, s: s ?? -Infinity, q: qualityOf(p, month) ?? -Infinity };
  });
  keyed.sort((a, b) => (b.s - a.s) || (b.q - a.q) || (a.i - b.i));
  return keyed.map((k) => k.p);
}
