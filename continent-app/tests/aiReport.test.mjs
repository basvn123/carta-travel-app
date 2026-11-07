// T1215 (row T1156-d, ROADMAP F8): the "report this answer" client. What it
// sends, what it never sends, and that a missing table turns it off quietly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  reportArgs, sendAiReport, planAnswerText, REASONS, LIMITS,
  setAiReportSenderForTests, resetAiReportForTests,
} from '../src/lib/aiReport.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('reportArgs: the seven RPC arguments, clipped and trimmed', () => {
  const a = reportArgs({ feature: 'ask', reason: 'wrong_fact', question: '  warm  in May? ', answer: 'Seville [1].', lang: 'nl', model: 'server' });
  assert.deepEqual(Object.keys(a).sort(), ['p_answer', 'p_feature', 'p_lang', 'p_model', 'p_note', 'p_question', 'p_reason']);
  assert.equal(a.p_question, 'warm in May?');
  assert.equal(a.p_note, null);
  const long = reportArgs({ feature: 'plan', reason: 'other', question: 'q'.repeat(999), answer: 'a'.repeat(9999), note: 'n'.repeat(999), lang: 'xx' });
  assert.equal(long.p_question.length, LIMITS.question);
  assert.equal(long.p_answer.length, LIMITS.answer);
  assert.equal(long.p_note.length, LIMITS.note);
  assert.equal(long.p_lang, 'en');
});

test('reportArgs: refuses an unknown feature or reason and an empty answer', () => {
  assert.equal(reportArgs({ feature: 'book', reason: 'other', answer: 'x' }), null);
  assert.equal(reportArgs({ feature: 'ask', reason: 'bad', answer: 'x' }), null);
  assert.equal(reportArgs({ feature: 'ask', reason: 'other', answer: '   ' }), null);
  assert.deepEqual(REASONS, ['wrong_fact', 'wrong_place', 'unsafe', 'other']);
});

test('never an account id: the arguments are only the migration\'s', () => {
  const sql = read('../supabase/migrations/074_ai_reports.sql');
  assert.match(sql, /function public\.ai_report\(\s*p_feature\s+text,\s*p_reason\s+text,\s*p_question\s+text,\s*p_answer\s+text,\s*p_lang\s+text,\s*p_model\s+text default null,\s*p_note\s+text default null/);
  assert.doesNotMatch(sql, /create table[^;]*\b(user_id|reporter_id|email)\b[^;]*;/s);
  assert.match(sql, /revoke all on table public\.ai_reports from public, anon, authenticated/);
  assert.match(read('../docs/legal/ARTICLE30.md'), /\| `ai_reports` \| 074 \|/);
});

test('sendAiReport: ok, the server\'s refusals, and the not-live switch', async () => {
  const calls = [];
  setAiReportSenderForTests(async (args) => { calls.push(args); return { data: { ok: true } }; });
  assert.deepEqual(await sendAiReport({ feature: 'ask', reason: 'other', answer: 'x' }), { ok: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(await sendAiReport({ feature: 'ask', reason: 'nope', answer: 'x' }), { ok: false, code: 'bad_input' });
  assert.equal(calls.length, 1);

  setAiReportSenderForTests(async () => ({ data: { error: 'too_many' } }));
  assert.deepEqual(await sendAiReport({ feature: 'ask', reason: 'other', answer: 'x' }), { ok: false, code: 'too_many' });
  setAiReportSenderForTests(async () => { throw new Error('offline'); });
  assert.deepEqual(await sendAiReport({ feature: 'ask', reason: 'other', answer: 'x' }), { ok: false, code: 'error' });

  let n = 0;
  setAiReportSenderForTests(async () => { n += 1; return { error: { code: 'PGRST202' } }; });
  assert.deepEqual(await sendAiReport({ feature: 'plan', reason: 'other', answer: 'x' }), { ok: false, code: 'not_live' });
  assert.deepEqual(await sendAiReport({ feature: 'plan', reason: 'other', answer: 'x' }), { ok: false, code: 'not_live' });
  assert.equal(n, 1, 'a missing function is asked once per page load');
  resetAiReportForTests();
});

test('planAnswerText: the summary, then each stop with its time', () => {
  assert.equal(planAnswerText({ summary: 'A slow day.', stops: [{ arrive: '09:00', name: 'Belfry' }, { name: 'Canal' }] }), 'A slow day. | 09:00 Belfry; Canal');
  assert.equal(planAnswerText(null), '');
});
