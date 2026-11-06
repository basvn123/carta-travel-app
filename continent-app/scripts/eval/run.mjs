#!/usr/bin/env node
/*
 * The one eval runner (T1148, ROADMAP F6). Every Carta eval runs through it
 * and writes the shared results format (scripts/eval/lib/results.mjs).
 *
 *   node scripts/eval/run.mjs [ask] [trail-summaries] [data-quality] [plan-day] [taxonomy] [trails-external] [all]
 *        [--check] [--write] [--dashboard] [--json]
 *        [--seed-drop]             (ask: a known regression, the gate must fail)
 *        [--plans <file>]          (plan-day: score recorded plans, not the reference planner)
 *        [--judgments <file>]      (plan-day: this verdicts file, not the newest in judgments/)
 *        [--predictions <file>]    (taxonomy: score this tagger output, not the today's-tags baseline)
 *
 *   no eval named  all five
 *   --check        exit 1 when a gated eval fails, 2 when one errors
 *   --write        write each result to the results folder (data/reports/evals/
 *                  or CARTA_EVAL_OUT): latest/<eval>.json and a history.jsonl line
 *   --dashboard    rewrite docs/reference/evals.md from the results folder
 *   --json         print the results as JSON instead of the table
 *
 * Evals (adapters in scripts/eval/adapters/):
 *   ask              S52's Ask eval (T1136), its runEval and gate unchanged
 *   trail-summaries  the trail summaries fact check (T1179), Python
 *   data-quality     the data quality gate (T1142) as a data eval, Python
 *   plan-day         plan-day rule checks and the judge calibration (kappa)
 *   taxonomy         taxonomy tagging, P@5 and F1 on hand labels (T1149, ROADMAP F1)
 *   trails-external  trails against outside references, coverage and top band (T1181), Python
 * No eval calls a model. The plan-day judge is its own optional step
 * (scripts/eval/plan-day/judge.mjs). The Claude API is never used.
 * S52's own entry point, scripts/eval/ask-eval.mjs, keeps working as before.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESULTS_DIR, REPO, readHistory, validateResult, writeResult } from './lib/results.mjs';

export const EVALS = ['ask', 'trail-summaries', 'data-quality', 'plan-day', 'taxonomy', 'trails-external'];
export const DASHBOARD_PATH = join(REPO, 'docs', 'reference', 'evals.md');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

export async function runOne(name, opts = {}) {
  const t0 = Date.now();
  const mod = await import(`./adapters/${name}.mjs`);
  let r;
  try {
    r = await mod.run(opts);
  } catch (e) {
    r = {
      schema: 'carta-eval/1', eval: name, title: mod.title || name, kind: { ask: 'retrieval', 'trail-summaries': 'text-check', 'data-quality': 'data', 'plan-day': 'llm-plan', taxonomy: 'classification', 'trails-external': 'data' }[name],
      at: new Date().toISOString(), git: null, status: 'error', gated: true,
      headline: { key: 'error', value: null, label: 'the eval did not run', higher_is_better: true },
      metrics: {}, gate: { ok: false, rule: 'the eval must run', tolerance: null, baseline: null, failures: [{ key: 'error', was: null, now: null, why: String(e.message || e).slice(0, 400) }] },
      cases: null, judge: null, inputs: {}, notes: [],
    };
  }
  r.inputs = { ...r.inputs, seconds: Math.round((Date.now() - t0) / 100) / 10 };
  return r;
}

/* ---- printing ---- */

const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

function printTable(results) {
  console.log('eval              status   gated  headline                                         value    cases');
  for (const r of results) {
    const c = r.cases ? `${r.cases.passed}/${r.cases.n}` : '';
    console.log(`${r.eval.padEnd(17)} ${r.status.padEnd(8)} ${String(r.gated).padEnd(6)} ${r.headline.label.slice(0, 48).padEnd(48)} ${pct(r.headline.value).padStart(7)}  ${c}`);
    for (const f of (r.gate?.failures || []).slice(0, 8)) console.log(`    ${r.gated ? 'FAIL' : 'note'} ${f.key}: ${f.why}`);
    if ((r.gate?.failures || []).length > 8) console.log(`    and ${r.gate.failures.length - 8} more`);
    if (r.judge) {
      const a = r.judge.agreement;
      const k = (x) => (x.kappa == null ? `n/a (${x.n} pairs${x.note ? `, ${x.note}` : ''})` : `${x.kappa} [${x.ci95.join(', ')}] ${x.band}, ${x.n} pairs`);
      console.log(`    judge ${r.judge.model || r.judge.backend || 'none'}: vs human ${k(a.judge_vs_human)}; rules vs human ${k(a.rules_vs_human)}; judge vs rules ${k(a.judge_vs_rules)}; use: ${r.judge.use}`);
    }
    for (const n of r.notes || []) console.log(`    ${n}`);
  }
}

/* ---- the dashboard page ---- */

const SPARK = '▁▂▃▄▅▆▇█';
export function spark(values) {
  const v = values.filter((x) => typeof x === 'number');
  if (!v.length) return '';
  const lo = Math.min(...v); const hi = Math.max(...v);
  return v.map((x) => SPARK[hi === lo ? 7 : Math.round(((x - lo) / (hi - lo)) * 7)]).join('');
}

export function dashboard(dir = RESULTS_DIR) {
  const history = readHistory(dir);
  const latest = EVALS.map((e) => {
    const p = join(dir, 'latest', `${e}.json`);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  }).filter(Boolean);
  const lines = [
    '# Eval results',
    '',
    'Generated by `node continent-app/scripts/eval/run.mjs --write --dashboard` (T1148, ROADMAP F6). Do not edit by hand: the next run rewrites it.',
    'Every eval writes the same format (`carta-eval/1`, see `continent-app/scripts/eval/lib/results.mjs`) to `data/reports/evals/`: `latest/<eval>.json` and one line per run in `history.jsonl`.',
    'How the evals work is in the "Evals" section of `docs/HANDBOOK.md`.',
    '',
    '## Latest score and trend',
    '',
    '| Eval | Status | Gated | Headline | Latest | Trend (oldest to newest, last 20 runs) | Runs | Last run |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of latest) {
    const runs = history.filter((h) => h.eval === r.eval);
    const values = runs.slice(-20).map((h) => h.headline?.value);
    lines.push(`| ${r.title} (\`${r.eval}\`) | ${r.status} | ${r.gated ? 'yes' : 'no'} | ${r.headline.label} | ${pct(r.headline.value)} | ${values.length > 1 ? spark(values) : 'one run so far'} ${values.length > 1 ? `(${pct(Math.min(...values.filter(Number.isFinite)))} to ${pct(Math.max(...values.filter(Number.isFinite)))})` : ''} | ${runs.length} | ${r.at.slice(0, 16).replace('T', ' ')} UTC, \`${r.git || 'n/a'}\` |`);
  }
  for (const r of latest) {
    lines.push('', `## ${r.title}`, '');
    if (r.gate) lines.push(`Gate: ${r.gate.rule}${r.gate.tolerance != null ? `, tolerance ${r.gate.tolerance}` : ''}${r.gate.baseline ? `, against ${r.gate.baseline}` : ''}. Result: **${r.gate.ok ? 'ok' : 'not ok'}**.`);
    if (r.cases) lines.push('', `Cases: ${r.cases.passed} of ${r.cases.n} pass.`);
    const fails = r.gate?.failures || [];
    if (fails.length) {
      lines.push('', '| Failure | Why |', '|---|---|');
      for (const f of fails.slice(0, 20)) lines.push(`| ${f.key} | ${String(f.why).replace(/\|/g, '/')} |`);
    }
    const keys = Object.keys(r.metrics).filter((k) => !/^clauses\.|\.(completeness|validity|freshness)$/.test(k)).slice(0, 24);
    if (keys.length) {
      lines.push('', '| Metric | Value |', '|---|---|');
      for (const k of keys) lines.push(`| ${k} | ${r.metrics[k] ?? 'n/a'} |`);
    }
    if (r.judge) {
      const a = r.judge.agreement;
      lines.push('', `Judge: ${r.judge.backend || 'none yet'}${r.judge.model ? `, ${r.judge.model}` : ''}, rubric \`${r.judge.rubric_sha}\`, ${r.judge.n} plans in the calibration sample. Use of the judge at this agreement: **${r.judge.use}** (gate at kappa 0.61 or more, advisory from 0.41).`, '',
        '| Agreement (Cohen\'s kappa) | Pairs | Observed agreement | Kappa | 95% interval | Band |', '|---|---|---|---|---|---|');
      for (const [name, x] of [['judge vs human labels', a.judge_vs_human], ['rule checks vs human labels', a.rules_vs_human], ['judge vs rule checks', a.judge_vs_rules]]) {
        lines.push(`| ${name} | ${x.n} | ${x.po ?? 'n/a'} | ${x.kappa ?? 'n/a'} | ${x.ci95 ? x.ci95.join(' to ') : 'n/a'} | ${x.band || x.note || 'n/a'} |`);
      }
    }
    for (const n of r.notes || []) lines.push('', `Note: ${n}`);
  }
  if (!latest.length) lines.push('No results yet. Run the command above.');
  return `${lines.join('\n')}\n`;
}

/* ---- main ---- */

async function main() {
  const named = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--plans', '--judgments', '--predictions'].includes(argv[i - 1])));
  const which = !named.length || named.includes('all') ? EVALS : named;
  const unknown = which.filter((e) => !EVALS.includes(e));
  if (unknown.length) { console.error(`unknown eval: ${unknown.join(', ')} (known: ${EVALS.join(', ')})`); process.exit(2); }
  const opts = { seedDrop: flag('--seed-drop'), plans: arg('--plans'), judgments: arg('--judgments'), predictions: arg('--predictions') };
  const results = [];
  for (const e of which) results.push(await runOne(e, opts));
  for (const r of results) {
    const bad = validateResult(r);
    if (bad.length) { console.error(`${r.eval}: result not valid: ${bad.join('; ')}`); process.exit(2); }
  }
  if (flag('--json')) console.log(JSON.stringify(results, null, 1));
  else printTable(results);
  if (flag('--write')) {
    if (opts.seedDrop) console.log('seeded drop: nothing written');
    else { for (const r of results) writeResult(r); console.log(`results written to ${RESULTS_DIR}`); }
  }
  if (flag('--dashboard')) {
    mkdirSync(dirname(DASHBOARD_PATH), { recursive: true });
    writeFileSync(DASHBOARD_PATH, dashboard());
    console.log(`dashboard written to ${DASHBOARD_PATH}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY && !opts.seedDrop) {
    const rows = results.map((r) => `| ${r.eval} | ${r.status} | ${r.headline.label} | ${pct(r.headline.value)} |`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Evals\n\n| Eval | Status | Headline | Value |\n|---|---|---|---|\n${rows.join('\n')}\n`);
  }
  if (flag('--check')) {
    const errored = results.filter((r) => r.status === 'error');
    const failed = results.filter((r) => r.gated && r.status === 'fail');
    if (errored.length) { console.log(`eval runner: ERROR in ${errored.map((r) => r.eval).join(', ')}`); process.exit(2); }
    if (failed.length) { console.log(`eval runner: FAIL in ${failed.map((r) => r.eval).join(', ')}`); process.exit(1); }
    console.log('eval runner: pass');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
