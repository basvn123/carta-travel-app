/**
 * "Report this answer" for AI-written text (T1215, row T1156-d, ROADMAP F8).
 * One first-party RPC, `ai_report` (migration 074), callable signed out. The
 * team reads the rows (admin_list_ai_reports) and turns a reproducible one
 * into an eval case: the Ask question set or the plan-day town set.
 *
 * What is sent: the feature ('ask' or 'plan'), a reason from REASONS, the
 * question (Ask's question, or a day plan's town and free text), the answer
 * as shown, the app language, the model when known and an optional note.
 * No account id, no trip or plan id. The server adds a salted hash of the
 * address for its rate limit (5 an hour) and keeps rows 180 days.
 *
 * NOT LIVE YET: until 074 is pasted the RPC does not exist (PGRST202). The
 * first such answer turns sending off for the page load and every call
 * answers { ok: false, code: 'not_live' }; the button then offers the mail.
 * Never throws.
 */
export const FEATURES = ['ask', 'plan'];
export const REASONS = ['wrong_fact', 'wrong_place', 'unsafe', 'other'];
const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];
const MISSING = ['PGRST202', 'PGRST205', '42P01', '42883'];
export const LIMITS = Object.freeze({ question: 300, answer: 2000, model: 60, note: 500 });

let off = false;
let sender = null;

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** The RPC arguments for a report, or null when it cannot be sent. Pure. */
export function reportArgs({ feature, reason, question = '', answer = '', lang = 'en', model = null, note = '' } = {}) {
  if (!FEATURES.includes(feature) || !REASONS.includes(reason)) return null;
  const a = clip(answer, LIMITS.answer);
  if (!a) return null;
  return {
    p_feature: feature,
    p_reason: reason,
    p_question: clip(question, LIMITS.question),
    p_answer: a,
    p_lang: LANGS.includes(lang) ? lang : 'en',
    p_model: clip(model, LIMITS.model) || null,
    p_note: clip(note, LIMITS.note) || null,
  };
}

/** A day plan as one line of text: the summary, then each stop with its time. Pure. */
export function planAnswerText(plan) {
  if (!plan) return '';
  const stops = (plan.stops || []).map((s) => [s.arrive, s.name].filter(Boolean).join(' ')).filter(Boolean);
  return [plan.summary || '', stops.join('; ')].filter(Boolean).join(' | ');
}

async function rpc(args) {
  if (sender) return sender(args);
  const { authConfigured, getSupabase } = await import('./supabaseClient.js');
  if (!authConfigured) return { error: { code: 'PGRST202' } };
  const supabase = await getSupabase();
  if (!supabase) return { error: { code: 'PGRST202' } };
  return supabase.rpc('ai_report', args);
}

/** Send one report: { ok: true } or { ok: false, code } with code
 *  'bad_input', 'too_many', 'not_live' or 'error'. */
export async function sendAiReport(input) {
  const args = reportArgs(input);
  if (!args) return { ok: false, code: 'bad_input' };
  if (off) return { ok: false, code: 'not_live' };
  try {
    const { data, error } = (await rpc(args)) || {};
    if (error) {
      if (MISSING.includes(error.code)) { off = true; return { ok: false, code: 'not_live' }; }
      return { ok: false, code: 'error' };
    }
    if (data?.error) return { ok: false, code: data.error === 'too_many' ? 'too_many' : 'bad_input' };
    return data?.ok ? { ok: true } : { ok: false, code: 'error' };
  } catch {
    return { ok: false, code: 'error' };
  }
}

/** Test seams. */
export function setAiReportSenderForTests(fn) { sender = fn; }
export function resetAiReportForTests() { sender = null; off = false; }
