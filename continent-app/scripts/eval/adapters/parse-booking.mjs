/*
 * Adapter: parse-booking on synthetic documents with gold fields (T1206,
 * register rows T1140-b and T1138-c). It guards the parse-booking prompt.
 *
 * Each document of scripts/eval/parse-booking/set.json goes through the
 * path supabase/functions/parse-booking/index.ts takes for a text import:
 * sanitizeTripContext, guardBookingInput, buildPrompt (with the system rules),
 * then the recorded model answer through parseModelJson, sanitizeParsed and
 * guardBookingOutput (text only: a link or code not in the text is cleared).
 * What survives is scored against the gold fields.
 *
 * The answers come from scripts/eval/parse-booking/answers.json (hand-written
 * reference answers with one planted fault; deterministic, what CI runs) or
 * from --answers <file> (the same shape, a live run's raw model texts). With
 * the reference answers this proves the prompt is built from the document and
 * the shipped path keeps every gold field; with recorded live answers it is
 * the quality eval of the model (field accuracy). No model is called here.
 *
 * Gate: every prompt check passes, field accuracy 0.9 or more, no invented link.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeResult, REPO } from '../lib/results.mjs';
import { buildPrompt, LANG_NAMES } from '../../../../supabase/functions/parse-booking/prompt.mjs';
import { sanitizeParsed, sanitizeTripContext } from '../../../../supabase/functions/parse-booking/logic.mjs';
import { cleanText } from '../../../../supabase/functions/plan-day/logic.mjs';
import { guardBookingInput, guardBookingOutput, systemRules, LIMITS } from '../../../../supabase/functions/_shared/aiGuard.mjs';
import { parseModelJson } from '../../../../supabase/functions/_shared/aiModels.mjs';

export const id = 'parse-booking';
export const title = 'Parse-booking fields on synthetic documents';

export const DIR = join(REPO, 'continent-app', 'scripts', 'eval', 'parse-booking');
export const SET_PATH = join(DIR, 'set.json');
export const ANSWERS_PATH = join(DIR, 'answers.json');
export const MIN_FIELD_ACCURACY = 0.9;
const NONCE = '0123456789ab';
export const BOOKING_FIELDS = ['kind', 'code', 'date', 'eur', 'amount', 'currency', 'link', 'city'];

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const squash = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Is one output field right? Euros converted from another currency may be 10 percent off. */
export function fieldOk(field, gold, got, goldBooking) {
  if (field === 'eur' || field === 'amount') {
    if (gold == null) return got == null;
    if (got == null) return false;
    const tol = field === 'eur' && goldBooking.currency ? 0.1 : 0.005;
    return Math.abs(got - gold) <= Math.max(0.01, tol * gold);
  }
  if (field === 'code') return squash(gold) === squash(got);
  if (field === 'city') return !gold || norm(gold) === norm(got);
  return String(gold ?? '') === String(got ?? '');
}

/** Pair each gold booking with an output one: same code, else same kind and date. */
export function matchBookings(gold, out) {
  const free = out.map((b, i) => i);
  const pairs = [];
  for (const g of gold) {
    let k = g.code ? free.findIndex((i) => squash(out[i].code) && squash(out[i].code) === squash(g.code)) : -1;
    if (k < 0) k = free.findIndex((i) => out[i].kind === g.kind && out[i].date === g.date);
    pairs.push([g, k < 0 ? null : out[free[k]]]);
    if (k >= 0) free.splice(k, 1);
  }
  return { pairs, extra: free.map((i) => out[i]) };
}

/** An activity name matches when one holds the other's words. */
const sameActivity = (a, b) => { const x = norm(a); const y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

/** Score one document's surviving output against its gold. Pure. */
export function scoreDoc(doc, safe) {
  const { pairs, extra } = matchBookings(doc.gold.bookings, safe.bookings);
  let fields = 0; let right = 0;
  const wrong = [];
  for (const [g, o] of pairs) {
    for (const f of BOOKING_FIELDS) {
      fields += 1;
      if (o && fieldOk(f, g[f], o[f], g)) right += 1;
      else wrong.push(`${g.code || g.kind}.${f}: want ${JSON.stringify(g[f] ?? null)}, got ${o ? JSON.stringify(o[f] ?? null) : 'no booking'}`);
    }
  }
  const acts = [...safe.activities];
  let actFound = 0; let actDays = 0;
  for (const g of doc.gold.activities) {
    const k = acts.findIndex((a) => sameActivity(a.name, g.name));
    if (k < 0) { wrong.push(`activity ${g.name}: missing`); continue; }
    actFound += 1;
    if ((acts[k].day ?? null) === (g.day ?? null)) actDays += 1; else wrong.push(`activity ${g.name}.day: want ${g.day ?? null}, got ${acts[k].day ?? null}`);
    acts.splice(k, 1);
  }
  const invented = extra.length + acts.length;
  if (invented) wrong.push(`${invented} booking(s) or activity(ies) not in the document`);
  const inventedLinks = safe.bookings.filter((b) => b.link && !doc.text.includes(b.link)).length;
  return { fields, right, actGold: doc.gold.activities.length, actFound, actDays, invented, inventedLinks, wrong };
}

/** The prompt checks: the document and every stop reach the prompt, fenced, in the asked language, under the cap. */
export function promptChecks(doc, prompt, ctx) {
  const fails = [];
  const block = new RegExp(`<<<DATA ${NONCE} PASTED>>>[\\s\\S]*${doc.text.split('\n')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*<<<END ${NONCE}>>>`);
  if (!block.test(prompt)) fails.push('the document is not inside the PASTED data block');
  for (const s of ctx.stops) if (!prompt.includes(s.city)) fails.push(`stop ${s.city} missing from the prompt`);
  if (!prompt.includes(LANG_NAMES[doc.lang] || 'English')) fails.push(`language ${doc.lang} not named`);
  if (prompt.length > LIMITS.bookingPromptChars) fails.push(`prompt ${prompt.length} characters, cap ${LIMITS.bookingPromptChars}`);
  return fails;
}

/** One document through the shipped text-import path. */
export function runDoc(doc, answerText) {
  const ctx0 = sanitizeTripContext(doc.context);
  const g = guardBookingInput({ texts: [cleanText(doc.text, 20000)], context: ctx0 });
  const sourceText = g.texts[0];
  const security = systemRules(NONCE);
  const prompt = buildPrompt({ context: g.context, lang: doc.lang, hasFiles: false, text: sourceText, nonce: NONCE });
  const pFails = promptChecks(doc, prompt, g.context);
  const parsed = answerText == null ? undefined : parseModelJson(answerText);
  const shaped = parsed === undefined ? { reason: 'json_parse' } : sanitizeParsed(parsed, { totalDays: g.context.totalDays || 60 });
  if (shaped.reason) return { pFails, rejected: shaped.reason, safe: { bookings: [], activities: [] } };
  const { repaired, ...safe } = guardBookingOutput(shaped, { sourceText, textOnly: true, systemText: `${security}\n${prompt}` });
  return { pFails, rejected: null, safe, repaired };
}

export async function run({ answers = null } = {}) {
  const set = J(SET_PATH);
  const rec = J(answers || ANSWERS_PATH);
  const rows = set.docs.map((d) => {
    const r = runDoc(d, rec.answers?.[d.id] ?? null);
    return { id: d.id, ...r, ...scoreDoc(d, r.safe) };
  });
  const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
  const fieldAcc = sum('fields') ? sum('right') / sum('fields') : 1;
  const actRecall = sum('actGold') ? sum('actFound') / sum('actGold') : 1;
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const failures = [];
  for (const r of rows) {
    for (const f of r.pFails) failures.push({ key: `${r.id}.prompt`, was: null, now: null, why: f });
    if (r.rejected) failures.push({ key: `${r.id}.answer`, was: null, now: r.rejected, why: 'the answer was rejected by the shipped path' });
    if (r.inventedLinks) failures.push({ key: `${r.id}.link`, was: 0, now: r.inventedLinks, why: 'a link the document does not print reached the traveller' });
  }
  if (fieldAcc < MIN_FIELD_ACCURACY) failures.push({ key: 'field_accuracy', was: MIN_FIELD_ACCURACY, now: r4(fieldAcc), why: `booking field accuracy under ${MIN_FIELD_ACCURACY}` });
  const perfect = rows.filter((r) => !r.wrong.length && !r.pFails.length && !r.rejected).length;
  return makeResult({
    eval: id, title, kind: 'extraction',
    status: failures.length ? 'fail' : 'pass', gated: true,
    headline: { key: 'field_accuracy', value: r4(fieldAcc), label: `booking fields right (${answers ? 'recorded answers' : 'reference answers'})`, higher_is_better: true },
    metrics: {
      field_accuracy: r4(fieldAcc),
      activity_recall: r4(actRecall),
      activity_day_accuracy: sum('actFound') ? r4(sum('actDays') / sum('actFound')) : null,
      invented: sum('invented'),
      invented_links: sum('inventedLinks'),
      repaired_fields: rows.reduce((t, r) => t + (r.repaired || 0), 0),
      prompt_check_fails: rows.reduce((t, r) => t + r.pFails.length, 0),
      docs: rows.length,
      gold_fields: sum('fields'),
    },
    gate: { ok: !failures.length, rule: `every prompt check, booking field accuracy ${MIN_FIELD_ACCURACY} or more, no invented link`, tolerance: null, baseline: null, failures },
    cases: { n: rows.length, passed: perfect },
    inputs: { set: 'continent-app/scripts/eval/parse-booking/set.json', version: set.version, answers: answers || 'continent-app/scripts/eval/parse-booking/answers.json', model: rec.model ?? null },
    notes: [
      ...rows.filter((r) => r.wrong.length).map((r) => `${r.id}: ${r.wrong.slice(0, 4).join('; ')}`),
      answers ? 'Scored on recorded model answers.' : 'Reference answers: this checks the prompt and the shipped path, not a model. Record live answers and pass --answers to score one.',
    ],
  });
}
