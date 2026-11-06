/*
 * Cohen's kappa for two raters over the same items (T1148, ROADMAP F6).
 *
 *   kappa = (p_o - p_e) / (1 - p_e)
 *   p_o   the share of items both raters put in the same class
 *   p_e   the sum over classes k of (rater A's share in k) times (rater B's share in k)
 *
 * The 95 percent interval uses the large-sample standard error
 * sqrt(p_o (1 - p_o) / (n (1 - p_e)^2)) (Cohen 1960). With 40 items it is
 * about 0.1 to 0.15 wide on each side, so the interval is always reported
 * next to the point value. Bands are Landis and Koch (1977).
 */

export const BANDS = [
  [0.81, 'almost perfect'],
  [0.61, 'substantial'],
  [0.41, 'moderate'],
  [0.21, 'fair'],
  [0, 'slight'],
  [-Infinity, 'poor'],
];

export function band(k) {
  if (k == null || !Number.isFinite(k)) return null;
  return BANDS.find(([floor]) => k >= floor)[1];
}

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

/**
 * pairs: [[a, b], ...], one per item, any comparable labels. Items where
 * either label is null or undefined are left out and counted as `missing`.
 */
export function cohenKappa(pairs) {
  const kept = pairs.filter(([a, b]) => a != null && b != null);
  const n = kept.length;
  const out = { n, missing: pairs.length - n, po: null, pe: null, kappa: null, se: null, ci95: null, band: null, table: {} };
  if (!n) return out;
  const classes = [...new Set(kept.flat().map(String))].sort();
  const ca = Object.fromEntries(classes.map((c) => [c, 0]));
  const cb = { ...ca };
  let agree = 0;
  for (const [a, b] of kept) {
    ca[String(a)] += 1;
    cb[String(b)] += 1;
    if (String(a) === String(b)) agree += 1;
    const key = `${a}|${b}`;
    out.table[key] = (out.table[key] || 0) + 1;
  }
  const po = agree / n;
  const pe = classes.reduce((s, c) => s + (ca[c] / n) * (cb[c] / n), 0);
  out.po = r4(po);
  out.pe = r4(pe);
  if (pe === 1) {
    // Both raters used one and the same class throughout: agreement is
    // total but kappa is undefined (0 / 0). Say so instead of inventing 1.
    out.note = 'both raters used a single class; kappa undefined';
    return out;
  }
  const kappa = (po - pe) / (1 - pe);
  const se = Math.sqrt((po * (1 - po)) / (n * (1 - pe) ** 2));
  out.kappa = r4(kappa);
  out.se = r4(se);
  out.ci95 = [r4(Math.max(-1, kappa - 1.96 * se)), r4(Math.min(1, kappa + 1.96 * se))];
  out.band = band(kappa);
  return out;
}

/** The use a judge may be put to at a given kappa (common practice, not a standard). */
export function judgeUse(k) {
  if (k == null) return 'uncalibrated';
  if (k >= 0.61) return 'may gate';
  if (k >= 0.41) return 'advisory';
  return 'do not use';
}
