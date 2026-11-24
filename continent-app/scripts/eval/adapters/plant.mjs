/*
 * Adapter: the planted-error eval, E-plant (ROADMAP E1, E7; north-star decision
 * 7.3). A structural gate: the cited-note verifier (src/lib/ask/verify.js) must
 * drop every planted error it can tell from a true sentence.
 *
 * What it scores: the frozen plants of tests/fixtures/plantedGolden.json (made
 * once over the Ask, ask-golden and any-question packs by planted/freeze.mjs)
 * and the 100 hand plants. Six generated kinds, three hand kinds. No catalogue
 * and no model, so CI runs it.
 *
 * Gate, per kind: no plant survives unless its value is in a cited note or the
 * question by the verifier's own reading (the residual, reported with its bound
 * and never counted against the bar); all 100 hand plants dropped. `--seed-drop`
 * scores the frozen OLD verifier instead: the gate must fail (the seeded self-test).
 */
import { scoreGolden } from '../planted/golden.mjs';
import { makeResult } from '../lib/results.mjs';
import { ruleOfThree } from '../lib/stats.mjs';
import * as verifyNow from '../../../src/lib/ask/verify.js';
import * as verifyBefore from '../../../tests/fixtures/verifyBefore.mjs';

export const id = 'plant';
export const title = 'Planted errors: the cited-note verifier drops them';

const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

export async function run({ seedDrop = false, packLimit = null } = {}) {
  const r = scoreGolden(seedDrop ? verifyBefore : verifyNow, undefined, { packLimit });
  const failures = [];
  const metrics = {};
  for (const [kind, v] of Object.entries(r.generated.byKind)) {
    metrics[`drop.${kind}`] = r4(v.barShare);
    metrics[`n.${kind}`] = v.planted;
    metrics[`explained.${kind}`] = v.explained;
    const missed = v.planted - v.explained - v.dropped;
    if (missed > 0) failures.push({ key: `generated.${kind}`, was: 1, now: r4(v.barShare), why: `${missed} of ${v.planted} planted ${kind} errors survive the verifier` });
  }
  for (const [kind, v] of Object.entries(r.hand.byKind)) {
    metrics[`hand.${kind}`] = r4(v.dropShare);
    if (v.dropped < v.planted) failures.push({ key: `hand.${kind}`, was: 1, now: r4(v.dropShare), why: `${v.planted - v.dropped} of ${v.planted} hand plants survive` });
  }
  const g = r.generated;
  metrics['drop.all'] = r4(g.barShare);
  metrics['plants.total'] = g.total;
  metrics['plants.malformed'] = g.malformed;
  metrics['residual.coincident'] = g.residual.coincident;
  metrics['residual.share'] = r4(g.residual.share);
  metrics['residual.hi95'] = r4(g.residual.hi);
  metrics['residual.survivors_same_value'] = g.explained;
  metrics['miss_bound95'] = g.survivors.length === 0 ? r4(ruleOfThree(g.planted - g.explained)) : null;
  metrics['reversed.dropped'] = r.reversed.filter((x) => x.dropped).length;
  const status = failures.length ? 'fail' : 'pass';
  return makeResult({
    eval: id, title, kind: 'text-check', status, gated: true,
    headline: { key: 'drop.all', value: r4(g.barShare), label: 'planted errors dropped (all kinds, residual apart)', higher_is_better: true },
    metrics,
    gate: {
      ok: !failures.length,
      rule: 'every planted kind dropped 100% except plants whose value is in a cited note or the question; all 100 hand plants dropped',
      tolerance: 0,
      baseline: 'tests/fixtures/plantedGolden.json (frozen plants), scripts/eval/planted/hand.mjs',
      failures: failures.slice(0, 30),
    },
    cases: { n: g.planted + r.hand.planted, passed: g.dropped + r.hand.dropped },
    inputs: { plants: r.plants, packs: r.packs, hand: r.hand.planted, seed: r.seed, verifier: seedDrop ? 'seeded: the old verifier' : 'src/lib/ask/verify.js', seed_drop: !!seedDrop },
    notes: [
      `residual: ${g.residual.coincident} of ${g.total} generated plants carry a value that is also in a cited note (${(g.residual.share * 100).toFixed(2)}%, 95% upper bound ${(g.residual.hi * 100).toFixed(2)}%); ${g.explained} more survived for the same reason (same number in another unit, same name without accents)`,
      `reversed comparison ("Porto is cheaper than Lisbon" under the right note): ${r.reversed.filter((x) => x.dropped).length} of ${r.reversed.length} dropped: out of reach of a text rule, the stated residual of the comparison rule`,
    ],
  });
}
