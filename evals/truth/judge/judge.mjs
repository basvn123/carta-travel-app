#!/usr/bin/env node
/*
 * The truth set text judge (T1144, ROADMAP D4). Optional, never in CI.
 *
 *   node evals/truth/judge/judge.mjs --prompts <dir>
 *        one prompt file per text, for a session judge (Claude Code or
 *        Cowork reads them and writes judgments/session-<date>.json by hand)
 *   node evals/truth/judge/judge.mjs --backend gemini [--model <id>] [--out <file>]
 *        Gemini through the model gateway (feature eval-judge), on the
 *        pipeline's GEMINI_API_KEY; pin the model
 *   node evals/truth/judge/judge.mjs --fixtures
 *        the Gemini path on the fixtures with a recorded answer per text and
 *        no network: shows the harness end to end, writes nothing
 *
 * Verdicts file: { "backend": "session" | "gemini", "model": "...",
 *   "rubric_sha": "...", "at": ISO, "verdicts": { "t01": { "verdict":
 *   "supported", "claims": [...], "reason": "..." } } }
 * The Claude API is never used here (CLAUDE.md).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES_DIR, JUDGMENTS_DIR, TEXT_SAMPLE_PATH, judgePrompt, rubricSha, runJudge } from './judge-lib.mjs';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** A fetch stand-in that answers each prompt with the recorded fixture answer for its text. */
export function fixtureFetch(answers) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    const prompt = body.contents[0].parts[0].text;
    const id = Object.keys(answers).find((k) => prompt.includes(`"subject": ${JSON.stringify(answers[k].subject)}`));
    if (!id) return { ok: false, status: 400, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(answers[id].answer) }] } }], usageMetadata: {} }) };
  };
}

export async function runFixtures() {
  const sample = J(join(FIXTURES_DIR, 'fixture-sample.json'));
  const answers = J(join(FIXTURES_DIR, 'fixture-answers.json'));
  const r = await runJudge(sample.items, { env: { GEMINI_API_KEY: 'fixture-not-a-key' }, model: 'fixture-model', fetchImpl: fixtureFetch(answers.answers) });
  return { sample, expected: answers.expected, ...r };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (argv.includes('--fixtures')) {
    const r = await runFixtures();
    let agree = 0;
    for (const it of r.sample.items) {
      const got = r.verdicts[it.text_id]?.verdict;
      const want = r.expected[it.text_id];
      if (got === want) agree += 1;
      console.log(`${it.text_id} ${got} (expected ${want})`);
    }
    console.log(`fixtures: ${agree} of ${r.sample.items.length} as expected`);
    process.exit(agree === r.sample.items.length ? 0 : 1);
  }
  const sample = J(TEXT_SAMPLE_PATH);
  const prompts = arg('--prompts');
  if (prompts) {
    mkdirSync(prompts, { recursive: true });
    for (const it of sample.items) writeFileSync(join(prompts, `${it.text_id}.txt`), judgePrompt(it));
    console.log(`${sample.items.length} prompts written to ${prompts} (rubric ${rubricSha()})`);
    return;
  }
  if (arg('--backend') !== 'gemini') { console.error('use --backend gemini, --prompts <dir> for a session judge, or --fixtures'); process.exit(2); }
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY is not set: the Gemini judge is optional and off here'); process.exit(2); }
  const model = arg('--model', process.env.CARTA_JUDGE_MODEL || null);
  const r = await runJudge(sample.items, { model });
  const out = arg('--out', join(JUDGMENTS_DIR, `gemini-${new Date().toISOString().slice(0, 10)}.json`));
  mkdirSync(JUDGMENTS_DIR, { recursive: true });
  writeFileSync(out, `${JSON.stringify({ backend: 'gemini', model: r.model, rubric_sha: rubricSha(), at: new Date().toISOString(), verdicts: r.verdicts }, null, 1)}\n`);
  console.log(`${Object.keys(r.verdicts).length} verdicts written to ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
