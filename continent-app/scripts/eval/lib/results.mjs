/*
 * The one results format for every Carta eval (T1148, ROADMAP F6).
 *
 * Every adapter in scripts/eval/adapters/ returns a result of this shape,
 * and scripts/eval/run.mjs writes it. Schema "carta-eval/1":
 *
 *   schema    "carta-eval/1"
 *   eval      the eval's id ("ask", "trail-summaries", "data-quality", "plan-day", "taxonomy")
 *   title     a short human name
 *   kind      "retrieval" | "text-check" | "data" | "llm-plan" | "classification" (T1149)
 *   at        ISO time of the run
 *   git       short commit the run scored, or null
 *   status    "pass" | "fail" | "error" | "skipped"
 *   gated     true when a fail should fail the job (the eval has a gate)
 *   headline  { key, value, label, higher_is_better }: the one number the
 *             dashboard trends; value is a share from 0 to 1
 *   metrics   flat { "dotted.key": number | null }: every number of the run
 *   gate      { ok, rule, tolerance, baseline, failures: [{ key, was, now, why }] }
 *   cases     { n, passed } or null
 *   judge     null, or { backend, model, rubric_sha, n, agreement: {...} } (plan-day)
 *   inputs    free object: set version, scope, data the run read
 *   notes     [string]
 *
 * Output folder (the "results folder"): data/reports/evals/ at the repo
 * root, or CARTA_EVAL_OUT. Inside it:
 *   latest/<eval>.json    the last result of each eval, whole
 *   history.jsonl         one line per written result, without `metrics`
 *                         keys beyond the headline's (kept small for git)
 * Runs write there only with --write; a plain run prints and writes nothing.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'carta-eval/1';
export const KINDS = ['retrieval', 'text-check', 'data', 'llm-plan', 'classification'];
export const STATUSES = ['pass', 'fail', 'error', 'skipped'];

const here = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(here, '../../../..');
export const RESULTS_DIR = process.env.CARTA_EVAL_OUT ? resolve(process.env.CARTA_EVAL_OUT) : join(REPO, 'data', 'reports', 'evals');

export function gitSha(cwd = REPO) {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

/** Flatten a nested object of numbers into { "a.b.c": n }. Non-numbers are dropped. */
export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) out[key] = null;
    else if (typeof v === 'number') out[key] = Number.isFinite(v) ? v : null;
    else if (typeof v === 'boolean') out[key] = v ? 1 : 0;
    else if (typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
  }
  return out;
}

export function makeResult(p) {
  return {
    schema: SCHEMA,
    eval: p.eval,
    title: p.title,
    kind: p.kind,
    at: p.at || new Date().toISOString(),
    git: p.git === undefined ? gitSha() : p.git,
    status: p.status,
    gated: !!p.gated,
    headline: p.headline,
    metrics: p.metrics || {},
    gate: p.gate || null,
    cases: p.cases || null,
    judge: p.judge || null,
    inputs: p.inputs || {},
    notes: p.notes || [],
  };
}

/** Problems with a result, as strings; an empty list means it is valid. */
export function validateResult(r) {
  const bad = [];
  if (!r || typeof r !== 'object') return ['not an object'];
  if (r.schema !== SCHEMA) bad.push(`schema is ${r.schema}, want ${SCHEMA}`);
  for (const k of ['eval', 'title', 'at']) if (typeof r[k] !== 'string' || !r[k]) bad.push(`${k} missing`);
  if (!KINDS.includes(r.kind)) bad.push(`kind ${r.kind} not one of ${KINDS.join(', ')}`);
  if (!STATUSES.includes(r.status)) bad.push(`status ${r.status} not one of ${STATUSES.join(', ')}`);
  if (typeof r.gated !== 'boolean') bad.push('gated not a boolean');
  const h = r.headline;
  if (!h || typeof h.key !== 'string' || typeof h.label !== 'string' || typeof h.higher_is_better !== 'boolean') bad.push('headline needs key, label, higher_is_better');
  else if (r.status !== 'skipped' && r.status !== 'error' && !(typeof h.value === 'number' && h.value >= 0 && h.value <= 1)) bad.push(`headline value ${h.value} not a share from 0 to 1`);
  if (!r.metrics || typeof r.metrics !== 'object' || Array.isArray(r.metrics)) bad.push('metrics not an object');
  else for (const [k, v] of Object.entries(r.metrics)) if (v !== null && typeof v !== 'number') bad.push(`metric ${k} not a number`);
  if (r.gate != null && (typeof r.gate.ok !== 'boolean' || !Array.isArray(r.gate.failures))) bad.push('gate needs ok and failures');
  if (!Array.isArray(r.notes)) bad.push('notes not a list');
  return bad;
}

/** The small form kept in history.jsonl. */
export function historyLine(r) {
  return {
    schema: r.schema, eval: r.eval, at: r.at, git: r.git, status: r.status, gated: r.gated,
    headline: r.headline, gate_ok: r.gate ? r.gate.ok : null, failures: r.gate ? r.gate.failures.length : 0,
    cases: r.cases, kappa: r.judge?.agreement?.judge_vs_human?.kappa ?? null,
  };
}

export function writeResult(r, dir = RESULTS_DIR) {
  const problems = validateResult(r);
  if (problems.length) throw new Error(`eval result ${r?.eval} is not valid: ${problems.join('; ')}`);
  mkdirSync(join(dir, 'latest'), { recursive: true });
  writeFileSync(join(dir, 'latest', `${r.eval}.json`), `${JSON.stringify(r, null, 1)}\n`);
  appendFileSync(join(dir, 'history.jsonl'), `${JSON.stringify(historyLine(r))}\n`);
  return dir;
}

export function readHistory(dir = RESULTS_DIR) {
  const p = join(dir, 'history.jsonl');
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn line is skipped */ }
  }
  return out;
}
