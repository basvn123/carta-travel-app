/*
 * Ask Carta, stage 4: the context pack, the "augmented" in retrieval
 * augmented generation (T556). One short list of numbered notes is all the
 * model may use:
 *
 *   [1]..[k]    one fact row per pick, written by code from rank.js facts
 *               (prices, months, crowds): the only numbers the answer may use
 *   [k+1]..[n]  the retrieved passages (dossier highlights, guide leads,
 *               trails), each with its place and source
 *
 * The same pack drives both back ends (on device, Workers AI), the cache
 * key and the check (verify.js), so a written answer can only say what
 * these notes say. Pure; no i18n beyond the facts answer it is given.
 */
import { stripDashes } from '../format.js';

export const PROMPT_VERSION = 1;
/** Caps that keep one answer inside the free Workers AI budget. */
export const MAX_NOTES = 14;
export const MAX_NOTE_CHARS = 300;
export const MAX_QUESTION_CHARS = 200;
export const MAX_ANSWER_TOKENS = 380;

const LANG_NAME = { en: 'English', nl: 'Dutch', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian' };

const cut = (s, n) => {
  const x = stripDashes(String(s || '')).replace(/\s+/g, ' ').trim();
  return x.length <= n ? x : `${x.slice(0, n - 1).replace(/\s+\S*$/, '')}.`;
};

/**
 * The system prompt. Kept short: small models follow few rules well, so
 * each rule is one the verifier also checks.
 */
export function systemPrompt(lang) {
  return [
    `You write short travel answers for Carta in ${LANG_NAME[lang] || 'English'}.`,
    'Use only the numbered notes. Never add a fact, price, number, month or place that is not in them.',
    'After every sentence write the note numbers it comes from, like [2] or [1][4].',
    'Copy figures exactly as the notes write them, including "~" and "est.".',
    'Write 3 to 5 plain sentences: answer the question first, then the reasons. No lists, no headings, no dashes.',
    'If the notes do not answer the question, say so in one sentence.',
    '/no_think',
  ].join('\n');
}

/** One fact row as a note, from a facts-answer pick (compose.js) and its facts (rank.js). */
function factNote(pick, shown) {
  const parts = [`${pick.dest.city}, ${pick.dest.country}`];
  for (const w of shown?.whyAll || shown?.why || []) parts.push(w);
  if (shown?.price) {
    parts.push(`total ${shown.price.total} for the group`);
    for (const l of shown.price.lines) parts.push(`${l.label} ${l.eur}`);
    if (shown.price.unpriced?.length) parts.push(`not in the total: ${shown.price.unpriced.join(', ')}`);
  }
  if (shown?.nights != null) parts.push(`${shown.nights} nights`);
  if (pick.dest.climate?.best?.length && shown?.bestText) parts.push(shown.bestText);
  if (pick.dest.rating?.score != null) parts.push(`score ${pick.dest.rating.score.toFixed(1)} of 10`);
  if (pick.dest.blurb) parts.push(pick.dest.blurb);
  return parts.join('; ');
}

/**
 * The pack for one question.
 *
 *   facts    rank.js answerFacts()
 *   answer   compose.js composeAnswer() (its picks carry the worded reasons)
 *   passages [{pid, destId, text, source}] in retrieval order
 *   labels   { monthsText(dest) -> "May, June" } for the best months
 */
export function buildPack({ question, lang, facts, answer, passages = [], labels = {} }) {
  const notes = [];
  const places = new Map();
  const shownById = new Map((answer?.picks || []).map((p) => [p.id, p]));
  for (const pick of facts.picks.slice(0, 6)) {
    const shown = { ...shownById.get(pick.id) };
    if (labels.monthsText) shown.bestText = `best months ${labels.monthsText(pick.dest)}`;
    notes.push({ kind: 'fact', destId: pick.id, text: cut(factNote(pick, shown), MAX_NOTE_CHARS) });
    places.set(pick.id, pick.dest);
  }
  if (answer?.table && (facts.type === 'when' || facts.type === 'compare')) {
    for (const row of answer.table.rows.slice(0, 12)) {
      if (notes.length >= 8) break;
      notes.push({ kind: 'fact', destId: null, text: cut(row.filter(Boolean).join(': '), MAX_NOTE_CHARS) });
    }
  }
  if (answer?.lead) notes.unshift({ kind: 'fact', destId: null, text: cut(answer.lead, MAX_NOTE_CHARS) });
  for (const n of answer?.notes || []) if (notes.length < 9) notes.push({ kind: 'fact', destId: null, text: cut(n, MAX_NOTE_CHARS) });
  const pickIds = new Set(facts.picks.map((p) => p.id));
  for (const p of passages) {
    if (notes.length >= MAX_NOTES) break;
    // Only passages about the picks (or about no one place): a passage on a
    // place the answer does not show would invite the model to name it.
    if (p.destId && !pickIds.has(p.destId)) continue;
    notes.push({ kind: 'passage', destId: p.destId || null, pid: p.pid, source: p.source, text: cut(p.text, MAX_NOTE_CHARS) });
  }
  const numbered = notes.map((n, i) => ({ ...n, n: i + 1 }));
  return {
    v: PROMPT_VERSION,
    lang,
    question: cut(question, MAX_QUESTION_CHARS),
    notes: numbered,
    places: [...places.values()].map((d) => ({ id: d.id, city: d.city, country: d.country })),
  };
}

/** The user turn the model sees, from a pack or from its wire form. */
export function userPrompt(pack) {
  const notes = pack.notes.map((n) => (typeof n === 'string' ? n : n.text));
  return [
    `Question: ${pack.question}`,
    '',
    'Notes:',
    ...notes.map((text, i) => `[${i + 1}] ${text}`),
  ].join('\n');
}

/** A wire pack from the network, checked; null when it is not one. */
export function readWirePack(body) {
  if (!body || typeof body !== 'object') return null;
  const { v, lang, question, notes } = body;
  if (v !== PROMPT_VERSION || !LANG_NAME[lang]) return null;
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION_CHARS) return null;
  if (!Array.isArray(notes) || !notes.length || notes.length > MAX_NOTES) return null;
  if (notes.some((n) => typeof n !== 'string' || !n.trim() || n.length > MAX_NOTE_CHARS)) return null;
  return { v, lang, question: question.trim(), notes: notes.map((n) => n.trim()) };
}

/** What the browser sends to /api/ask/answer: the pack, nothing else. */
export function wirePack(pack) {
  return { v: pack.v, lang: pack.lang, question: pack.question, notes: pack.notes.map((n) => n.text) };
}

/** A stable key for one pack: same question, notes, language and prompt, same answer. */
export async function packKey(wire) {
  const text = JSON.stringify([wire.v, wire.lang, wire.question.toLowerCase(), wire.notes]);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
