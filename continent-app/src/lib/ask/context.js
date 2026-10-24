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
import { formatMoney, formatEst } from '../money.js';
import { monthRow } from './rank.js';

// v2 (T563): comparisons and budget verdicts are written by code as notes
// of their own, and the prompt forbids the model any it is not given.
// v3 (T583): two or three short, warm sentences, no count, no repeated
// "has the highest score"; the chat also keeps only the first three.
// v4 (price plan rule 2, 2026-10-24): figures carry no estimate mark.
export const PROMPT_VERSION = 4;
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
    'After every sentence, the first one too, write the note numbers it comes from, like [2] or [1][4].',
    'Copy figures exactly as the notes write them.',
    'Compare places, or call one better, best, cheaper, drier or warmer, only when a note says so, and cite that note.',
    'Name places in the order the notes list them.',
    'Write 2 or 3 short sentences in a warm, plain voice, like a friend who knows the places: name the best one to three places and the one reason that matters for each.',
    'Do not say how many places match. Do not repeat the same phrase for each place, such as "has the highest score". No lists, no headings, no dashes.',
    'If the notes do not answer the question, say in one sentence that Carta does not know.',
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

const est = (eur, isEst, word) => (isEst ? formatEst(eur, word) : formatMoney(eur));
const monthEn = (m) => new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2026, m - 1, 15));
const dayOf = (pick) => pick.why?.find((r) => r.k === 'cost') || null;

/**
 * The comparisons and verdicts a question needs, written by code (T563):
 * the first live run showed a small model reverses a comparison it has to
 * work out ("Porto has less rain" from 60 mm against 31 mm) and calls a
 * place that is over budget a fit. Kept in English with the figures as the
 * fact rows write them; the model answers in the reader's language.
 */
export function comparisonNotes(facts, { estWord = 'est.', monthName = monthEn } = {}) {
  const out = [];
  const picks = facts.picks || [];
  if (facts.type === 'compare' && picks.length >= 2) {
    const m = facts.facets?.month || null;
    const pairs = [];
    for (let i = 0; i < picks.length; i++) for (let j = i + 1; j < picks.length; j++) pairs.push([picks[i], picks[j]]);
    for (const [a, b] of pairs.slice(0, 3)) {
      const A = a.dest.city; const B = b.dest.city;
      const ca = dayOf(a); const cb = dayOf(b);
      if (ca && cb) {
        out.push(ca.dayEur === cb.dayEur
          ? `${A} and ${B} cost the same a person a day: ${est(ca.dayEur, ca.est, estWord)}.`
          : ca.dayEur < cb.dayEur
            ? `${A} costs less a day than ${B}: ${est(ca.dayEur, ca.est, estWord)} against ${est(cb.dayEur, cb.est, estWord)} a person.`
            : `${B} costs less a day than ${A}: ${est(cb.dayEur, cb.est, estWord)} against ${est(ca.dayEur, ca.est, estWord)} a person.`);
      }
      const sa = a.dest.rating?.score; const sb = b.dest.rating?.score;
      if (sa != null && sb != null) {
        out.push(sa === sb ? `${A} and ${B} have the same score, ${sa.toFixed(1)}.`
          : `${sa > sb ? A : B} has the higher score: ${Math.max(sa, sb).toFixed(1)} against ${Math.min(sa, sb).toFixed(1)}; the score rates the place overall, not one interest.`);
      }
      if (m) {
        const ra = monthRow(a.dest, m); const rb = monthRow(b.dest, m);
        if (ra && rb) {
          const mn = monthName(m);
          out.push(Math.round(ra.rain) === Math.round(rb.rain) ? `${A} and ${B} get the same rain in ${mn}, ${Math.round(ra.rain)} mm.`
            : `${ra.rain < rb.rain ? A : B} is drier in ${mn}: ${Math.round(Math.min(ra.rain, rb.rain))} mm of rain against ${Math.round(Math.max(ra.rain, rb.rain))} mm.`);
          out.push(Math.round(ra.high) === Math.round(rb.high) ? `${A} and ${B} are equally warm by day in ${mn}, ${Math.round(ra.high)}°.`
            : `${ra.high > rb.high ? A : B} is warmer by day in ${mn}: ${Math.round(Math.max(ra.high, rb.high))}° against ${Math.round(Math.min(ra.high, rb.high))}°.`);
        }
      }
    }
  }
  // A list answer (find, near, plan): Carta's own order, and the extremes
  // among the places shown, so "the best match", "the cheapest" or "the
  // driest" stand on a note instead of the model's arithmetic.
  if ((facts.type === 'find' || facts.type === 'near' || facts.type === 'plan') && picks.length >= 2) {
    const names = picks.slice(0, 6).map((p) => p.dest.city);
    out.push(facts.type === 'plan'
      ? `The route visits ${names.join(', then ')}.`
      : `Carta lists these places best match first: ${names.join(', ')}.`);
    const costed = picks.slice(0, 6).map((p) => [p, dayOf(p)]).filter(([, c]) => c);
    if (costed.length >= 2) {
      const lo = costed.reduce((x, y) => (y[1].dayEur < x[1].dayEur ? y : x));
      const hi = costed.reduce((x, y) => (y[1].dayEur > x[1].dayEur ? y : x));
      if (lo[1].dayEur !== hi[1].dayEur) {
        out.push(`Of these, ${lo[0].dest.city} costs the least a day (${est(lo[1].dayEur, lo[1].est, estWord)} a person) and ${hi[0].dest.city} the most (${est(hi[1].dayEur, hi[1].est, estWord)}).`);
      }
    }
    const scored = picks.slice(0, 6).filter((p) => p.dest.rating?.score != null);
    if (scored.length >= 2) {
      const top = scored.reduce((x, y) => (y.dest.rating.score > x.dest.rating.score ? y : x));
      out.push(`Of these, ${top.dest.city} has the highest score, ${top.dest.rating.score.toFixed(1)}; the score rates the place overall, not one interest.`);
    }
    const m = facts.facets?.month || null;
    if (m) {
      const rows = picks.slice(0, 6).map((p) => [p, monthRow(p.dest, m)]).filter(([, r]) => r);
      if (rows.length >= 2) {
        const warm = rows.reduce((x, y) => (y[1].high > x[1].high ? y : x));
        const dry = rows.reduce((x, y) => (y[1].rain < x[1].rain ? y : x));
        out.push(`Of these in ${monthName(m)}, ${warm[0].dest.city} is the warmest by day (${Math.round(warm[1].high)}°) and ${dry[0].dest.city} the driest (${Math.round(dry[1].rain)} mm of rain).`);
      }
    }
  }
  if (facts.type === 'budget' && facts.query?.budget) {
    const budget = formatMoney(facts.query.budget);
    for (const p of picks.slice(0, 6)) {
      const r = p.price;
      if (!r) continue;
      const total = est(r.total, r.est, estWord);
      out.push(r.group === 'fits'
        ? `${p.dest.city} fits within ${budget}: ${total} for the group.`
        : `${p.dest.city} is over ${budget} at ${total}; it fits only by spending the buffer (${est(r.core, r.est, estWord)} without it).`);
    }
  }
  if (facts.type === 'when' && picks[0]) {
    const d = picks[0].dest;
    const months = facts.when?.months || [];
    if (months.length) {
      const dry = months.reduce((x, y) => (y.rain < x.rain ? y : x));
      const warm = months.reduce((x, y) => (y.high > x.high ? y : x));
      out.push(`${d.city}'s driest month is ${monthName(dry.m)}, ${Math.round(dry.rain)} mm of rain; its warmest is ${monthName(warm.m)}, ${Math.round(warm.high)}° by day.`);
    }
    out.push(d.crowding?.tier
      ? `Carta's crowd figure for ${d.city} covers the whole year, not single months, so Carta does not know its least crowded month.`
      : `Carta has no crowd figure for ${d.city}.`);
  }
  return out;
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
  // The code-made comparisons go first, right under the lead, so a small
  // model meets them before it starts weighing the fact rows itself.
  const cmp = comparisonNotes(facts, { estWord: labels.estWord, monthName: labels.monthNameEn });
  notes.unshift(...cmp.slice(0, 6).map((text) => ({ kind: 'cmp', destId: null, text: cut(text, MAX_NOTE_CHARS) })));
  if (answer?.lead) notes.unshift({ kind: 'fact', destId: null, text: cut(answer.lead, MAX_NOTE_CHARS) });
  if (answer?.table && (facts.type === 'when' || facts.type === 'compare')) {
    for (const row of answer.table.rows.slice(0, 12)) {
      if (notes.length >= 10) break;
      notes.push({ kind: 'fact', destId: null, text: cut(row.filter(Boolean).join(': '), MAX_NOTE_CHARS) });
    }
  }
  for (const n of answer?.notes || []) if (notes.length < 9) notes.push({ kind: 'fact', destId: null, text: cut(n, MAX_NOTE_CHARS) });
  const pickIds = new Set(facts.picks.map((p) => p.id));
  for (const p of passages) {
    if (notes.length >= MAX_NOTES) break;
    // Only passages about the picks (or about no one place): a passage on a
    // place the answer does not show would invite the model to name it.
    if (p.destId && !pickIds.has(p.destId)) continue;
    notes.push({ kind: 'passage', destId: p.destId || null, pid: p.pid, source: p.source, text: cut(p.text, MAX_NOTE_CHARS) });
  }
  const numbered = notes.slice(0, MAX_NOTES).map((n, i) => ({ ...n, n: i + 1 }));
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
