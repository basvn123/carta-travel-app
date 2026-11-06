/*
 * Adapter: the plan-day eval (T1148, ROADMAP F6) in the shared results format.
 *
 * Two parts:
 * 1. The cases (plan-day/cases.json, 20 requests on real city decks) are
 *    planned and every plan is scored by the rule checks of plan-day-lib
 *    (through the shipped sanitizeAiStops and scheduleDay). The plans come
 *    from the reference planner (default, deterministic, what CI runs) or
 *    from a recorded file (--plans <file>: { "pd01": { summary, stops } },
 *    for example the live plan-day answers). Headline: the share of plans
 *    that meet every rule.
 * 2. The judge calibration: the 40-plan sample (plan-day/sample.json) with
 *    the hand labels (labels.json) and the newest judge verdicts file in
 *    plan-day/judgments/. Cohen's kappa is reported for judge against human,
 *    rules against human and judge against rules, with a 95 percent interval.
 *
 * Not gated: nothing fails a job on a model's plans yet. The judge may gate
 * only once its kappa against the hand labels is 0.61 or more.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeResult } from '../lib/results.mjs';
import { cohenKappa, judgeUse } from '../lib/kappa.mjs';
import {
  JUDGMENTS_DIR, LABELS_PATH, SAMPLE_KEY_PATH, SAMPLE_PATH,
  checkPlan, loadCases, referencePlan, rubricSha,
} from '../plan-day/plan-day-lib.mjs';

export const id = 'plan-day';
export const title = 'Plan-day plans and judge';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function newestJudgments(dir = JUDGMENTS_DIR) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (!files.length) return null;
  const all = files.map((f) => ({ f, d: J(join(dir, f)) })).sort((a, b) => String(b.d.at).localeCompare(String(a.d.at)));
  return { file: `continent-app/scripts/eval/plan-day/judgments/${all[0].f}`, ...all[0].d };
}

/** The three agreements over the sample. Pure: takes the loaded files. */
export function calibrate({ set, sample, key, labels, judgments }) {
  const byCase = new Map(set.cases.map((c) => [c.id, c]));
  const rows = sample.plans.map((p) => ({
    planId: p.planId,
    rules: checkPlan(byCase.get(key[p.planId].caseId), p.plan).verdict,
    human: labels?.[p.planId] ?? null,
    judge: judgments?.verdicts?.[p.planId]?.verdict ?? null,
  }));
  const pair = (a, b) => cohenKappa(rows.map((r) => [r[a], r[b]]));
  return {
    rows,
    judge_vs_human: pair('judge', 'human'),
    rules_vs_human: pair('rules', 'human'),
    judge_vs_rules: pair('judge', 'rules'),
  };
}

export async function run({ plans = null, judgments = null } = {}) {
  const set = loadCases();
  const recorded = plans ? J(plans) : null;
  const scored = set.cases.map((c) => {
    const plan = recorded ? recorded[c.id] : referencePlan(c);
    return { id: c.id, ...(plan ? checkPlan(c, plan) : { verdict: 'fail', score: 0, checks: [['missing', false, 'no plan for this case']] }) };
  });
  const passed = scored.filter((s) => s.verdict === 'pass').length;
  const share = passed / scored.length;
  const perCheck = {};
  for (const s of scored) for (const [k, ok] of s.checks) perCheck[k] = (perCheck[k] || 0) + (ok ? 1 : 0);

  const sample = J(SAMPLE_PATH);
  const key = J(SAMPLE_KEY_PATH).key;
  const labelsFile = existsSync(LABELS_PATH) ? J(LABELS_PATH) : null;
  const judged = judgments ? { file: judgments, ...J(judgments) } : newestJudgments();
  const cal = calibrate({ set, sample, key, labels: labelsFile?.labels, judgments: judged });
  const humanN = cal.rows.filter((r) => r.human != null).length;
  const k = cal.judge_vs_human;
  const notes = [];
  if (!humanN) notes.push('no hand labels yet (plan-day/labels.json): judge against human kappa is an owner step');
  if (!judged) notes.push('no judge verdicts in plan-day/judgments/');
  if (judged && judged.rubric_sha && judged.rubric_sha !== rubricSha()) notes.push(`judge verdicts used rubric ${judged.rubric_sha}, the rubric is now ${rubricSha()}`);
  const failures = scored.filter((s) => s.verdict !== 'pass').map((s) => ({ key: s.id, was: null, now: s.score, why: s.checks.filter((c) => !c[1]).map((c) => `${c[0]}: ${c[2]}`).join('; ') }));

  return makeResult({
    eval: id,
    title,
    kind: 'llm-plan',
    status: failures.length ? 'fail' : 'pass',
    gated: false,
    headline: { key: 'rules_pass', value: Math.round(share * 10000) / 10000, label: `plans meeting every rule (${recorded ? 'recorded plans' : 'reference planner'})`, higher_is_better: true },
    metrics: {
      rules_pass: Math.round(share * 10000) / 10000,
      mean_check_share: Math.round((scored.reduce((s, x) => s + x.score, 0) / scored.length) * 10000) / 10000,
      ...Object.fromEntries(Object.entries(perCheck).map(([c, n]) => [`checks.${c}`, Math.round((n / scored.length) * 10000) / 10000])),
      'sample.plans': sample.plans.length,
      'sample.rules_pass': cal.rows.filter((r) => r.rules === 'pass').length,
      'sample.human_labels': humanN,
      'sample.judge_verdicts': cal.rows.filter((r) => r.judge != null).length,
      'kappa.judge_vs_human': k.kappa,
      'kappa.rules_vs_human': cal.rules_vs_human.kappa,
      'kappa.judge_vs_rules': cal.judge_vs_rules.kappa,
    },
    gate: { ok: !failures.length, rule: 'advisory: every plan meets every rule check', tolerance: null, baseline: null, failures },
    cases: { n: scored.length, passed },
    judge: {
      backend: judged?.backend ?? null,
      model: judged?.model ?? null,
      file: judged?.file ?? null,
      rubric_sha: rubricSha(),
      n: sample.plans.length,
      use: judgeUse(k.kappa),
      agreement: { judge_vs_human: k, rules_vs_human: cal.rules_vs_human, judge_vs_rules: cal.judge_vs_rules },
    },
    inputs: { set: set.version, planner: recorded ? plans : 'reference', labels_by: labelsFile?.by ?? null },
    notes,
  });
}
