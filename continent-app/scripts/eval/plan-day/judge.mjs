#!/usr/bin/env node
/*
 * The plan-day LLM judge (T1148, ROADMAP F6). Optional, never in CI.
 *
 *   node scripts/eval/plan-day/judge.mjs --backend gemini [--model gemini-flash-latest] [--out judgments/gemini-<date>.json]
 *   node scripts/eval/plan-day/judge.mjs --prompts <dir>   (writes one prompt file per plan, for a session judge)
 *
 * Backends:
 *   gemini   the pipeline's Gemini key (GEMINI_API_KEY), temperature 0, the
 *            JSON schema of plan-day-lib JUDGE_SCHEMA. Pin the model; judge
 *            with a different model than the one that wrote the plans
 *            (self-preference, Panickssery et al. 2024).
 *   session  a Claude Code or Cowork session reads sample.json and the rubric (prompts/eval-judge)
 *            (never sample-key.json) and writes the verdicts file by hand,
 *            in the shape below. No API call of any kind.
 * The Claude API is never used here (CLAUDE.md).
 *
 * Verdicts file, one per judge run, in judgments/:
 *   { "backend": "gemini" | "session", "model": "...", "rubric_sha": "...",
 *     "at": ISO, "verdicts": { "p01": { "verdict": "pass", "named": 5, ..., "reason": "..." } } }
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { JUDGE_SCHEMA, JUDGMENTS_DIR, SAMPLE_PATH, judgePrompt, rubricSha } from './plan-day-lib.mjs';
import { callModel } from '../../../../supabase/functions/_shared/aiModels.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

/**
 * One verdict from a model judge, through the model gateway (T1137, E3):
 * feature eval-judge, provider and chain from config (AI_EVAL_JUDGE_PROVIDER,
 * AI_EVAL_JUDGE_MODELS), temperature 0, JSON against the judge schema.
 */
export async function geminiJudge(prompt, { model, key, fetchImpl } = {}) {
  const env = { ...process.env, ...(key ? { GEMINI_API_KEY: key } : {}), ...(model ? { AI_EVAL_JUDGE_MODELS: model } : {}) };
  const r = await callModel({ feature: 'eval-judge', env, user: prompt, json: true, schema: JUDGE_SCHEMA, temperature: 0, ...(fetchImpl ? { fetchImpl } : {}) });
  if (!r.ok) throw new Error(`judge ${r.code} ${r.upstream || r.status || ''}`.trim());
  return JSON.parse(r.text);
}

async function main() {
  const sample = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'));
  const prompts = arg('--prompts');
  if (prompts) {
    mkdirSync(prompts, { recursive: true });
    for (const p of sample.plans) writeFileSync(join(prompts, `${p.planId}.txt`), `${judgePrompt(p)}\n`);
    console.log(`${sample.plans.length} prompts written to ${prompts}`);
    return;
  }
  if (arg('--backend') !== 'gemini') { console.error('use --backend gemini, or --prompts <dir> for a session judge'); process.exit(2); }
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error('GEMINI_API_KEY is not set: the Gemini judge is optional and off here'); process.exit(2); }
  const model = arg('--model', process.env.CARTA_JUDGE_MODEL || 'gemini-flash-latest');
  const verdicts = {};
  for (const p of sample.plans) {
    try { verdicts[p.planId] = await geminiJudge(judgePrompt(p), { model, key }); } catch (e) { verdicts[p.planId] = { verdict: null, reason: String(e.message).slice(0, 120) }; }
    process.stdout.write(`${p.planId} ${verdicts[p.planId].verdict}\n`);
  }
  const at = new Date().toISOString();
  const out = arg('--out', join(JUDGMENTS_DIR, `gemini-${at.slice(0, 10)}.json`));
  writeFileSync(out, `${JSON.stringify({ backend: 'gemini', model, rubric_sha: rubricSha(), at, verdicts }, null, 1)}\n`);
  console.log(`verdicts written to ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
