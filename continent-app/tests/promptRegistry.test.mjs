/*
 * The prompt registry (T1140, ROADMAP E5).
 *
 * 1. Byte-identical: every JS prompt builder, now reading the registry, gives
 *    exactly the prompt the code gave before (prompts/_golden/js.json, written
 *    from commit 55a09c9c01 by scripts/prompts/capture-golden.mjs). The Python
 *    jobs have the same proof in tests/test_prompt_registry.py.
 * 2. No prompt text left in code: no eight-word run of any registry prompt
 *    appears in a code file, and no long "You are ..." style literal does.
 * 3. The registry holds: hashes match, the generated module is fresh and its
 *    two copies equal, and an in-place edit (no version bump) fails the check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as planDay from '../../supabase/functions/plan-day/prompt.mjs';
import * as suggestCity from '../../supabase/functions/suggest-city/prompt.mjs';
import * as parseBooking from '../../supabase/functions/parse-booking/prompt.mjs';
import * as guard from '../functions/_lib/aiGuard.js';
import { systemPrompt, userPrompt } from '../src/lib/ask/context.js';
import { judgePrompt, rubricSha } from '../scripts/eval/plan-day/plan-day-lib.mjs';
import { checkTree, compareWithBase, readRegistry, MODULE_COPIES } from '../../scripts/prompts/registry.mjs';
import { fragmentsSha, parseByFormat, PLACEHOLDER_RE } from '../../scripts/prompts/lib.mjs';
import * as bundled from '../functions/_lib/prompts.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const golden = JSON.parse(read('prompts/_golden/js.json'));
const sha = (s) => createHash('sha256').update(s).digest('hex');

/* ---- 1. byte-identical ---- */

test('plan-day: the registry prompt equals the old code on every case', () => {
  assert.ok(golden['plan-day'].length >= 50);
  for (const [i, c] of golden['plan-day'].entries()) assert.equal(planDay.buildPrompt(c.input), c.output, `plan-day case ${i}`);
  assert.equal(JSON.stringify(planDay.RESPONSE_SCHEMA), golden['plan-day.schema']);
});

test('suggest-city and parse-booking: the registry prompts equal the old code', () => {
  for (const [i, c] of golden['suggest-city'].entries()) assert.equal(suggestCity.buildPrompt(c.input), c.output, `suggest-city case ${i}`);
  assert.equal(JSON.stringify(suggestCity.RESPONSE_SCHEMA), golden['suggest-city.schema']);
  for (const [i, c] of golden['parse-booking'].entries()) assert.equal(parseBooking.buildPrompt(c.input), c.output, `parse-booking case ${i}`);
  assert.equal(JSON.stringify(parseBooking.RESPONSE_SCHEMA), golden['parse-booking.schema']);
});

test('security rules and Ask: the registry prompts equal the old code', () => {
  for (const c of golden['security-rules']) assert.equal(guard.systemRules(c.input.nonce), c.output);
  for (const c of golden['ask.user']) assert.equal(guard.askUserPrompt(c.input, 'n0nce7q'), c.output);
  for (const c of golden['ask.system']) assert.equal(systemPrompt(c.input.lang), c.output, c.input.lang);
  for (const c of golden['ask.device']) assert.equal(userPrompt(c.input), c.output);
});

test('the eval judge: same rubric hash and the same 40 prompts', () => {
  assert.equal(rubricSha(), golden['eval-judge.rubricSha']);
  const sample = JSON.parse(read('continent-app/scripts/eval/plan-day/sample.json'));
  const byId = Object.fromEntries(sample.plans.map((p) => [p.planId, p]));
  assert.equal(golden['eval-judge'].length, 40);
  for (const c of golden['eval-judge']) assert.equal(sha(judgePrompt(byId[c.input.planId])), c.sha256, c.input.planId);
});

test('a value holding {{x}} is not filled again (one pass)', () => {
  const out = bundled.frag(bundled.planDay, 'intro', { city: '{{country}}', country: 'X', dateISO: '{{dateISO}}' });
  assert.ok(out.includes('walking day in {{country}}, X on {{dateISO}}.'));
  assert.throws(() => bundled.frag(bundled.planDay, 'intro', { city: 'A' }), /needs \{\{country\}\}/);
  assert.throws(() => bundled.frag(bundled.planDay, 'nope'), /no fragment/);
});

/* ---- 2. no prompt text left in code ---- */

const CODE_ROOTS = ['supabase/functions', 'continent-app/src', 'continent-app/functions', 'continent-app/scripts', 'pipeline', 'scripts', 'Trips/carta-unified/carta-unified/pipeline'];
const CODE_EXT = /\.(m?js|cjs|jsx|ts|tsx|py)$/;
// The generated module is where the text is meant to be; tests and their fixtures may quote a prompt.
const NOT_CODE = new Set(MODULE_COPIES);
// Words only: quotes, escapes, "+" and line breaks of a split literal fall away.
const words = (s) => s.toLowerCase().replace(/\\[nt]/g, ' ').match(/[\p{L}\p{N}]+/gu) || [];
const RUN = 8;

/**
 * Code without its comments and docstrings, which may describe a prompt in
 * prose: JS line and block comments; Python # comments and triple-quoted
 * strings that stand alone as a statement (a prompt assigned to a name stays).
 */
function stripComments(f, text) {
  if (f.endsWith('.py')) {
    return text
      .replace(/^[ \t]*(?:[rRbBuU]{0,2})("{3}|'{3})[\s\S]*?\1/gm, ' ')
      .replace(/(^|[ \t])#[^\n]*/g, '$1');
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function codeFiles() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', ...CODE_ROOTS], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  return out.split('\n').filter((f) => CODE_EXT.test(f) && !NOT_CODE.has(f) && !/(^|\/)(tests?|node_modules|__pycache__)\//.test(f) && !/\.test\.m?js$|(^|\/)test_[^/]*\.py$/.test(f));
}

// Phrases a prompt shares with code that is not a prompt: a vocabulary the
// validator and the prompt must both spell out, and a validator message that
// restates a prompt rule. Each is data or a check, never sent to a model.
const ALLOWED = [
  ['parse-booking/logic.mjs', 'flight out flight home flight stay car transfer activity other'], // the booking kinds the validator accepts
  ['planner/flow/tripSettings.js', 'flight out flight home flight stay car transfer activity other'], // the same kinds in the app
  ['mytrips/AddBookingSheet.jsx', 'flight out flight home flight stay car transfer activity other'], // and in the form
  ['pipeline/common.py', '1 easy 2 moderate 3 active 4 demanding 5 expert'], // the effort scale
  ['pipeline/normalize.py', '1 easy 2 moderate 3 active 4 demanding 5 expert'], // the effort scale
  ['pipeline/generation_gate.py', 'every night but the last names its bed'], // the gate's message for the rule
  ['pipeline/generate_trip.py', 'two to four lowercase words joined by hyphens'], // a schema description, register row T1140-c
];

test('no eight-word run of any registry prompt is left in a code file', () => {
  const reg = readRegistry();
  const runs = new Map();
  for (const [id, e] of Object.entries(reg.prompts)) {
    const { frags } = parseByFormat(read(e.file), e.format, { file: e.file });
    for (const [name, text] of Object.entries(frags)) {
      if (name === 'schema') continue; // JSON keys and types; its descriptions are checked below
      for (const piece of text.split(PLACEHOLDER_RE)) {
        const w = words(piece);
        for (let i = 0; i + RUN <= w.length; i++) runs.set(w.slice(i, i + RUN).join(' '), `${id}/${name}`);
      }
    }
    for (const d of (frags.schema || '').matchAll(/"description": "([^"]+)"/g)) {
      const w = words(d[1]);
      for (let i = 0; i + RUN <= w.length; i++) runs.set(w.slice(i, i + RUN).join(' '), `${id}/schema`);
    }
  }
  assert.ok(runs.size > 500, `only ${runs.size} runs`);
  const files = codeFiles();
  assert.ok(files.length > 200, `only ${files.length} code files`);
  const hits = [];
  for (const f of files) {
    const w = words(stripComments(f, read(f)));
    for (let i = 0; i + RUN <= w.length; i++) {
      const k = w.slice(i, i + RUN).join(' ');
      if (runs.has(k) && !ALLOWED.some(([file, run]) => f.endsWith(file) && run.includes(k))) { hits.push(`${f}: "${k}" (${runs.get(k)})`); break; }
    }
  }
  assert.deepEqual(hits, [], 'prompt text in code; it belongs in prompts/ (prompts/README.md)');
});

test('no new prompt-shaped literal in code outside the registry', () => {
  // A long string that opens like a model instruction: a prompt someone wrote straight into code.
  const OPENER = /["'`](You (?:are|write|list|verify|judge|plan|fill|turn|check|answer|summari[sz]e|translate)\b[^"'`\n]{50,})/;
  const hits = codeFiles().filter((f) => !/\/i18n\//.test(f)).flatMap((f) => {
    const m = OPENER.exec(read(f));
    return m ? [`${f}: ${m[1].slice(0, 60)}`] : [];
  });
  assert.deepEqual(hits, []);
});

/* ---- 3. the registry and the bump check ---- */

test('the registry holds: hashes, versions, the generated module and its two copies', () => {
  const { failures } = checkTree();
  assert.deepEqual(failures, []);
  assert.equal(read(MODULE_COPIES[0]), read(MODULE_COPIES[1]));
  const reg = readRegistry();
  for (const [id, e] of Object.entries(reg.prompts)) {
    assert.ok(e.lastScore && e.lastScore.version === e.version, `${id}: no score for v${e.version}`);
    if (e.eval) assert.equal(e.lastScore.status, 'pass', id);
    else assert.ok(e.guard, `${id}: neither an eval nor a named guard`);
  }
});

const fakeFiles = (base, head) => (side, p) => (side === 'base' ? base : head)[p] ?? null;
const fileOf = (id, version, text) => `---\nid: ${id}\nversion: ${version}\n---\n### a\n~~~\n${text}\n~~~\n`;

test('the bump check: an in-place edit fails, a proper bump passes and names the eval to run', () => {
  const entry = (v, file, score = v) => ({ version: v, file, format: 'registry', eval: 'plan-day', lastScore: { version: score } });
  const base = { prompts: { x: entry(1, 'prompts/x/v1.md') } };
  const v1 = fileOf('x', 1, 'Be finished by 18:00.');

  // Seeded edit: v1's text changes, the version does not.
  const edited = compareWithBase(base, base, fakeFiles({ 'prompts/x/v1.md': v1 }, { 'prompts/x/v1.md': fileOf('x', 1, 'Be finished by 19:00.') }));
  assert.equal(edited.failures.length, 1);
  assert.match(edited.failures[0], /changed its text; versions are immutable/);

  // A bump with no score for the new version fails; with one it passes and asks for the eval.
  const files = fakeFiles({ 'prompts/x/v1.md': v1 }, { 'prompts/x/v1.md': v1, 'prompts/x/v2.md': fileOf('x', 2, 'Be finished by 19:00.') });
  const unscored = compareWithBase(base, { prompts: { x: entry(2, 'prompts/x/v2.md', 1) } }, files);
  assert.match(unscored.failures.join('\n'), /no score recorded/);
  const ok = compareWithBase(base, { prompts: { x: entry(2, 'prompts/x/v2.md') } }, files);
  assert.deepEqual(ok.failures, []);
  assert.deepEqual(ok.bumped, ['x']);

  // Two versions at once, or the new version in the old file, fail.
  assert.match(compareWithBase(base, { prompts: { x: entry(3, 'prompts/x/v3.md') } }, files).failures.join('\n'), /one version at a time/);
  assert.match(compareWithBase(base, { prompts: { x: entry(2, 'prompts/x/v1.md') } }, files).failures.join('\n'), /must be a new file/);
});

test('the bump check: hashes over the fragments only (prose and changelog may change)', () => {
  const a = parseByFormat(`---\nid: x\nversion: 1\n---\nAbout.\n### a\n~~~\nT\n~~~\n`, 'registry').frags;
  const b = parseByFormat(`---\nid: x\nversion: 1\n---\nOther prose.\r\n### a\r\n~~~\r\nT\r\n~~~\r\n`, 'registry').frags;
  assert.equal(fragmentsSha(a), fragmentsSha(b));
});

test('registry.mjs check --seed-edit fails (the CI self-test)', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/prompts/registry.mjs'), 'check', '--seed-edit'], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /prompt registry: FAIL/);
  assert.match(r.stdout, /plan-day: the text of prompts\/plan-day\/v1\.md changed without a version bump/);
});
