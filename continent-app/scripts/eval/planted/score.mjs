/*
 * Scoring the cited-note verifier against planted errors (ROADMAP E1, wave 4,
 * north-star decision 7.3 row E-plant). Pure: the verifier module is passed
 * in, so the same plants are scored against the frozen "before" copy and
 * against src/lib/ask/verify.js with one code path. No model, no I/O.
 *
 * Counting rules:
 *   drop       the verifier fails the sentence (ok false): what a plant must get
 *   coincident the planted value also stands in a cited note or the question, so
 *              the sentence cannot be told from a true one: the residual. It is
 *              reported with a 95% Wilson bound and never counted against the bar.
 */
import { wilson, ruleOfThree } from '../lib/stats.mjs';

/** Run one plant: did the verifier fail its sentence, and why. */
// One checker is kept: plants arrive grouped by pack, and building a checker compiles a place
// pattern over the whole catalogue (hundreds of them at once ran out of memory).
let last = { pack: null, verify: null, key: '', check: null };
export function checkPlant(plant, pack, knownPlaces, verify, opts) {
  const key = JSON.stringify(opts || {});
  if (last.pack !== pack || last.verify !== verify || last.key !== key) last = { pack, verify, key, check: verify.makeChecker(pack, knownPlaces, opts) };
  const check = last.check;
  const { sentences } = verify.splitSentences(plant.sentence);
  const rs = sentences.map(check);
  // A plant is one sentence; if the splitter returns more, every one must fail.
  const dropped = rs.length > 0 && rs.every((r) => !r.ok);
  return { dropped, why: rs.flatMap((r) => r.why) };
}

/**
 * Score plants. `packOf(plant)` returns the plant's pack.
 * Returns the per kind table, the residual and the surviving plants.
 */
export function scorePlants(plants, packOf, knownPlaces, verify, opts) {
  const kinds = {};
  const survivors = [];
  const reasons = {};
  let coincidentKept = 0;
  for (const p of plants) {
    const k = (kinds[p.kind] ||= { total: 0, planted: 0, dropped: 0, coincident: 0, coincidentDropped: 0 });
    const r = checkPlant(p, packOf(p), knownPlaces, verify, opts);
    k.total++;
    if (p.expect === 'drop') {
      k.planted++;
      if (r.dropped) { k.dropped++; for (const w of r.why.slice(0, 1)) reasons[w.split(':')[0]] = (reasons[w.split(':')[0]] || 0) + 1; } else survivors.push({ ...p, why: r.why });
    } else if (p.expect === 'coincident') {
      k.coincident++;
      if (r.dropped) k.coincidentDropped++; else coincidentKept++;
    }
  }
  const planted = Object.values(kinds).reduce((s, k) => s + k.planted, 0);
  const dropped = Object.values(kinds).reduce((s, k) => s + k.dropped, 0);
  const coincident = Object.values(kinds).reduce((s, k) => s + k.coincident, 0);
  const total = planted + coincident;
  const w = wilson(coincident, total);
  return {
    total, planted, dropped, dropShare: planted ? dropped / planted : null,
    byKind: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { ...v, dropShare: v.planted ? v.dropped / v.planted : null }])),
    residual: {
      coincident, share: total ? coincident / total : null, lo: w.lo, hi: w.hi,
      keptByVerifier: coincidentKept,
      // Of the plants whose value cannot be told from a true one, how many did the verifier let through.
      keptShare: coincident ? coincidentKept / coincident : null,
    },
    // 0 survivors in n planted: the rule-of-three bound on the miss rate.
    missBound: survivors.length === 0 && planted ? ruleOfThree(planted) : null,
    reasons,
    survivors,
  };
}
