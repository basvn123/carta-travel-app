/*
 * Adapter: the logic engines' golden harness (G1, ROADMAP G4) in the shared
 * results format. It scores the three golden sets (month fit, ranking,
 * day feasibility) on real places and reports per slice (country, place
 * class, persona, G5) and the worst slice. The core is
 * scripts/eval/lib/logic-engines.mjs; the sets are in
 * tests/fixtures/logic-golden/; the bar is config/logic-golden.json.
 *
 * Gated: every case marked "current" (today's answer is the right one: a
 * regression guard) passes, and so does every slice's current cases.
 * Not gated: "target" cases, where the audit names the right answer and
 * today's engine fails. They are the gap each engine wave closes. The
 * headline is the share of all cases that pass, so it rises as waves land.
 * Offline, no model, no wire file needed.
 */
import { makeResult } from '../lib/results.mjs';
import { CONFIG, SETS, runGolden, share, sliceTable } from '../lib/logic-engines.mjs';

export const id = 'logic-engines';
export const title = 'Logic engines golden sets (month fit, ranking, day feasibility)';

export async function run({ which = null } = {}) {
  const results = runGolden({ which });
  const gate = CONFIG.gate;
  const cur = results.filter((r) => r.expect === 'current');
  const tgt = results.filter((r) => r.expect === 'target');
  const failures = [];
  for (const r of cur.filter((x) => !x.pass).slice(0, 20)) failures.push({ key: `${r.set}.${r.id}`, was: 1, now: 0, why: `current case fails: got ${JSON.stringify(r.got)}, want ${JSON.stringify(r.want)} (${r.source})` });
  const curShare = share(cur.filter((r) => r.pass).length, cur.length);
  if (curShare < gate.current_pass_min && !failures.length) failures.push({ key: 'current_pass', was: gate.current_pass_min, now: curShare, why: 'current cases below the bar' });
  const slices = sliceTable(results);
  for (const s of slices.filter((x) => x.current && x.currentPass / x.current < gate.worst_slice_current_pass_min)) failures.push({ key: `slice.${s.dim}.${s.value}`, was: gate.worst_slice_current_pass_min, now: share(s.currentPass, s.current), why: `slice ${s.dim}=${s.value}: ${s.currentPass} of ${s.current} current cases pass` });
  const rank = results.filter((r) => r.set === 'rank' && r.p_at_k != null);
  const meanP = rank.length ? rank.reduce((a, r) => a + r.p_at_k, 0) / rank.length : null;
  const meanN = rank.length ? rank.reduce((a, r) => a + r.ndcg_at_k, 0) / rank.length : null;
  if (meanP != null && meanP < gate.rank_mean_p_at_k_min) failures.push({ key: 'rank.mean_p_at_k', was: gate.rank_mean_p_at_k_min, now: Math.round(meanP * 1e4) / 1e4, why: 'mean P@k of the For you order fell under the bar' });
  const metrics = {
    current_pass: curShare, target_pass: share(tgt.filter((r) => r.pass).length, tgt.length),
    cases: results.length, current_cases: cur.length, target_cases: tgt.length,
    'rank.mean_p_at_k': meanP == null ? null : Math.round(meanP * 1e4) / 1e4, 'rank.mean_ndcg_at_k': meanN == null ? null : Math.round(meanN * 1e4) / 1e4,
  };
  for (const set of Object.keys(SETS)) {
    const rs = results.filter((r) => r.set === set);
    metrics[`${set}.pass`] = share(rs.filter((r) => r.pass).length, rs.length);
    metrics[`${set}.current_pass`] = share(rs.filter((r) => r.expect === 'current' && r.pass).length, rs.filter((r) => r.expect === 'current').length);
    metrics[`${set}.target_pass`] = share(rs.filter((r) => r.expect === 'target' && r.pass).length, rs.filter((r) => r.expect === 'target').length);
  }
  for (const s of slices) {
    const k = `slice.${s.dim}.${s.value}`;
    metrics[`${k}.current_pass`] = share(s.currentPass, s.current);
    metrics[`${k}.target_pass`] = share(s.targetPass, s.target);
  }
  const all = slices.filter((s) => s.current + s.target >= 2).map((s) => ({ ...s, rate: (s.currentPass + s.targetPass) / (s.current + s.target) })).sort((a, b) => a.rate - b.rate);
  const worst = all[0];
  const allPass = results.filter((r) => r.pass).length;
  return makeResult({
    eval: id, title, kind: 'retrieval',
    status: failures.length ? 'fail' : 'pass', gated: true,
    headline: { key: 'cases_pass', value: share(allPass, results.length), label: 'golden cases that pass (current and target)', higher_is_better: true },
    metrics,
    gate: { ok: !failures.length, rule: `every "current" case passes (in total and in every slice), mean rank P@k at least ${gate.rank_mean_p_at_k_min}; "target" cases are reported, not gated`, tolerance: null, baseline: 'continent-app/config/logic-golden.json', failures },
    cases: { n: results.length, passed: allPass },
    inputs: { which: which || 'follows config/flags.json', sets: Object.keys(SETS).join(', ') },
    notes: [
      `${tgt.length - tgt.filter((r) => r.pass).length} of ${tgt.length} target cases fail today: the gap the engine waves close (E5 month fit, E6 ranking, E8 day).`,
      worst ? `Worst slice: ${worst.dim}=${worst.value}, ${worst.currentPass + worst.targetPass} of ${worst.current + worst.target} cases pass.` : 'No slice with two cases.',
    ],
  });
}
