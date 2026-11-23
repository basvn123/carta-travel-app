/*
 * Statistics for the evals (ROADMAP E1; north-star decision 7.1). Pure
 * functions, no I/O, no model. Every resampling takes a seed, so a number
 * printed once can be reproduced and a test can pin it.
 *
 *   mulberry32(seed)                     seeded random numbers in [0, 1)
 *   wilson(k, n)                         95% Wilson interval of a share
 *   ruleOfThree(n)                       upper 95% bound when 0 of n happened (3/n)
 *   plannedN({ q, delta })               n for 80% power, q = share of discordant pairs
 *   pairedBootstrap(old, new, opts)      mean difference and its one-sided 97.5% lower bound
 *   nonInferiority(old, new, { delta })  pass when that lower bound is above minus delta
 *   clusterBootstrap(cases, of, metric)  resample whole clusters (conversation, document)
 *   seededSelfTest(opts)                 the gate must fail on a seeded loss and pass on none
 */

const Z_ALPHA = 1.96; // two-sided 5%, which is one-sided 2.5%
const Z_POWER = 0.84; // 80% power

/** A small, fast seeded generator (mulberry32). Same seed, same stream. */
export function mulberry32(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Value at quantile p (0 to 1) of an already sorted list, nearest rank. */
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[i];
}

/** 95% Wilson score interval for k of n. Never reports a zero width at 0 or n. */
export function wilson(k, n, z = Z_ALPHA) {
  if (!n) return { k, n, p: null, lo: null, hi: null };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { k, n, p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Upper 95% bound on a rate when none of n were seen: 3 / n (decision 7.1 rule 1). */
export function ruleOfThree(n) {
  return n > 0 ? 3 / n : null;
}

/**
 * Pairs needed to see a true difference of 0 pass non-inferiority at 80%
 * power: n = (1.96 + 0.84)^2 * q / delta^2. delta is a share (0.05) or points (5).
 * q 0.15 and delta 5 points gives 470 (the table in decision 7.1).
 */
export function plannedN({ q, delta = 0.05 } = {}) {
  const d = delta >= 1 ? delta / 100 : delta;
  if (!(q > 0) || !(d > 0)) throw new Error('plannedN needs q > 0 and delta > 0');
  return Math.round(((Z_ALPHA + Z_POWER) ** 2 * q) / (d * d));
}

/**
 * Paired bootstrap of new minus old over the same cases. The lower bound is
 * the 2.5th percentile of the resampled mean difference, that is the
 * one-sided 97.5% lower bound the gates use.
 */
export function pairedBootstrap(oldScores, newScores, { resamples = 2000, seed = 1 } = {}) {
  if (oldScores.length !== newScores.length) throw new Error('paired scores must have the same length');
  const n = oldScores.length;
  const diffs = newScores.map((x, i) => Number(x) - Number(oldScores[i]));
  if (!n) return { n: 0, mean: null, lower: null, upper: null, resamples, seed };
  const rand = mulberry32(seed);
  const means = new Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += diffs[Math.floor(rand() * n)];
    means[r] = s / n;
  }
  means.sort((a, b) => a - b);
  const discordant = diffs.filter((d) => d !== 0).length;
  return { n, mean: mean(diffs), lower: quantile(means, 0.025), upper: quantile(means, 0.975), discordant: discordant / n, resamples, seed };
}

/** Non-inferiority: pass when the lower bound of new minus old is above minus delta. */
export function nonInferiority(oldScores, newScores, { delta = 0.05, resamples = 2000, seed = 1 } = {}) {
  const d = delta >= 1 ? delta / 100 : delta;
  const b = pairedBootstrap(oldScores, newScores, { resamples, seed });
  return { ...b, delta: d, pass: b.n > 0 && b.lower > -d };
}

/**
 * Cluster bootstrap of a metric: turns inside a conversation, fields inside a
 * document are resampled together, so n is the number of clusters.
 * `clusterOf(case)` names the cluster, `metric(case)` is a number (a 0 or 1).
 */
export function clusterBootstrap(cases, clusterOf, metric, { resamples = 2000, seed = 1 } = {}) {
  const groups = new Map();
  for (const c of cases) {
    const k = clusterOf(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(Number(metric(c)));
  }
  const list = [...groups.values()];
  const g = list.length;
  const all = list.flat();
  if (!g) return { clusters: 0, cases: 0, mean: null, lower: null, upper: null, resamples, seed };
  const rand = mulberry32(seed);
  const means = new Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    let m = 0;
    for (let i = 0; i < g; i++) {
      const pick = list[Math.floor(rand() * g)];
      for (const x of pick) s += x;
      m += pick.length;
    }
    means[r] = s / m;
  }
  means.sort((a, b) => a - b);
  return { clusters: g, cases: all.length, mean: mean(all), lower: quantile(means, 0.025), upper: quantile(means, 0.975), resamples, seed };
}

/**
 * The seeded self-test (decision 7.1 rule 7, the pattern of ask-eval.yml):
 * a baseline of n binary outcomes, a copy with `loss` of the passes turned
 * into failures at seeded positions. The gate must FAIL the loss and PASS the
 * identical copy; if either is wrong the gate itself is broken.
 */
export function seededSelfTest({ n = 470, rate = 0.8, loss = 0.1, delta = 0.05, seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const old = Array.from({ length: n }, () => (rand() < rate ? 1 : 0));
  const worse = old.slice();
  const passes = old.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  // Fisher-Yates over the passing positions, then flip the first loss * n of them.
  for (let i = passes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [passes[i], passes[j]] = [passes[j], passes[i]];
  }
  for (const i of passes.slice(0, Math.round(loss * n))) worse[i] = 0;
  const lossResult = nonInferiority(old, worse, { delta, seed });
  const sameResult = nonInferiority(old, old.slice(), { delta, seed });
  return { lossFails: !lossResult.pass, identicalPasses: sameResult.pass, ok: !lossResult.pass && sameResult.pass, loss: lossResult, identical: sameResult };
}
