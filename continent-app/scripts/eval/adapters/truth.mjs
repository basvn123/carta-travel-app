/*
 * Adapter: the truth set (T1144, ROADMAP D4) in the shared results format,
 * as a data eval. It runs evals/run_truth.py's score() in memory: the
 * shipped data against the answers in evals/truth/sheet.csv (verified by the
 * owner, or seeded from a cited source field in the repo). The headline is
 * the share of answered rows the data gets right. It gates only once 80
 * percent of the sheet is verified by hand; until then it is advisory. The
 * gate: accuracy not below the lower Wilson bound of evals/truth/baseline.json.
 *
 * The text check's calibration rides along as `judge`: the newest verdicts
 * in evals/truth/judge/judgments/ against the owner's labels.json (Cohen's
 * kappa), and the share of planted faults each rater catches. No model is
 * called here. --seed-drop plants one wrong value in memory (the score falls).
 */
import { makeResult } from '../lib/results.mjs';
import { runPython } from './python.mjs';
import { loadCalibration, rubricSha } from '../../../../evals/truth/judge/judge-lib.mjs';

export const id = 'truth';
const NOT_USED = { n: 0, missing: 0, po: null, pe: null, kappa: null, se: null, ci95: null, band: null, table: {}, note: 'no rule rater in the text check; the planted key is a recall check (text.planted_caught)' };
export const title = 'Truth set';

export async function run({ seedDrop = false, judgments = null } = {}) {
  const seedWrong = seedDrop;
  const d = runPython(`
import json, sys
sys.path.insert(0, 'evals')
import run_truth as t
r = t.score(seed_wrong=${seedWrong ? 'True' : 'False'})
r.pop("rows")
print(json.dumps(r))
`);
  const m = d.metrics;
  const { sample, labelsFile, judged, cal } = loadCalibration({ judgments });
  const humanN = cal.rows.filter((r) => r.human != null).length;
  const notes = [];
  if (!m['rows.verified']) notes.push('no row verified by hand yet: the score is on seeded answers only (owner step, evals/truth/GUIDE.md)');
  if (!d.gate.gated) notes.push(`advisory until 80 percent of the sheet is verified (now ${Math.round(m.verified_share * 1000) / 10} percent)`);
  if (d.planted) notes.push(`seeded wrong value planted in ${d.planted.item_id}.${d.planted.field}`);
  if (!humanN) notes.push('no hand labels for the text check yet (evals/truth/judge/labels.json): judge against human kappa is an owner step');
  if (judged && judged.rubric_sha && judged.rubric_sha !== rubricSha()) notes.push(`judge verdicts used rubric ${judged.rubric_sha}, the rubric is now ${rubricSha()}`);
  const failures = [
    ...d.gate.failures.map((why) => ({ key: 'accuracy', was: d.gate.baseline?.accuracy ?? null, now: m.accuracy, why })),
    ...d.failures.map((f) => ({ ...f, why: `wrong: ${f.why}` })),
  ];
  const metrics = { ...m };
  delete metrics.verified_share;
  Object.assign(metrics, {
    verified_share: m.verified_share,
    'ci95.low': d.ci95 ? d.ci95[0] : null,
    'ci95.high': d.ci95 ? d.ci95[1] : null,
    'text.sample': sample.items.length,
    'text.human_labels': humanN,
    'text.judge_verdicts': cal.rows.filter((r) => r.judge != null).length,
    'text.kappa.judge_vs_human': cal.judge_vs_human.kappa,
    'text.planted_caught.judge': cal.planted_caught.judge.share,
    'text.planted_caught.human': cal.planted_caught.human.share,
    'text.shipped_supported.judge': cal.shipped_supported.judge,
    'text.shipped_supported.human': cal.shipped_supported.human,
  });
  return makeResult({
    eval: id,
    title,
    kind: 'data',
    status: d.gate.ok ? 'pass' : 'fail',
    gated: !!d.gate.gated,
    headline: { key: 'accuracy', value: m.accuracy ?? 0, label: 'answered truth-set rows the data gets right', higher_is_better: true },
    metrics,
    gate: {
      ok: d.gate.ok,
      rule: 'accuracy at or above the lower 95 percent Wilson bound of the baseline; gated from 80 percent verified',
      tolerance: null,
      baseline: d.gate.baseline ? `baseline ${d.gate.baseline.accuracy} on ${d.gate.baseline.scored_rows} rows (${d.gate.baseline.at})` : null,
      failures,
    },
    cases: { n: m.scored_rows, passed: m.right_rows },
    judge: {
      backend: judged?.backend ?? null,
      model: judged?.model ?? null,
      file: judged?.file ?? null,
      rubric_sha: rubricSha(),
      n: sample.items.length,
      use: cal.use,
      agreement: { judge_vs_human: cal.judge_vs_human, rules_vs_human: NOT_USED, judge_vs_rules: NOT_USED },
    },
    inputs: { sample: d.sample.version, seed: d.sample.seed, items: d.sample.items, by_kind: d.sample.by_kind, wire_generated_at: d.sample.wire_generated_at, labels_by: labelsFile?.by ?? null },
    notes,
  });
}
