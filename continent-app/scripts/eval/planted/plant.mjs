/*
 * The planted-error generator (ROADMAP E1; north-star decision 7.3, row E-plant).
 *
 * The cited-note verifier (src/lib/ask/verify.js) must drop a written sentence
 * whose figure or place is not in the notes it cites. This generator builds
 * such sentences on purpose, over every context pack of the Ask eval, so
 * the verifier can be scored against them ("share dropped", pass bar 100%).
 * Scoring the verifier is wave A3. This file only makes plants: pure,
 * seeded, no model, no I/O.
 *
 * Kinds (decision 7.3):
 *   cross-note-figure  a figure from note i in a sentence that cites note j, which lacks it
 *   cross-note-place   a place from note i in a sentence citing note j, which lacks it
 *   other-day          a figure from another day's notes
 *   other-trip         a figure from another trip's notes
 *   previous-turn      a figure from a previous turn's notes
 *   pre-edit           a figure the traveller changed since (a value before the edit)
 * Every plant expects the verdict "drop". A plant whose value also stands in
 * a cited note by coincidence cannot be told apart from a true sentence; it
 * is kept apart (`coincident`) and reported as the residual share, never
 * counted against the 100% bar.
 *
 * The day, trip and previous-turn kinds need foreign notes. plantAll takes
 * them from neighbouring packs of the corpus (the stand-ins an Ask corpus
 * has); a caller with real trip context passes `context` to plantsFor.
 */
import { mulberry32 } from '../lib/stats.mjs';

export const PLANT_KINDS = ['cross-note-figure', 'cross-note-place', 'other-day', 'other-trip', 'previous-turn', 'pre-edit'];

// A figure as the verifier reads one: digits with an optional currency, degree, percent or unit.
// The unit must end the word, so "87 here" is not "87 h".
const FIGURE = /(?:[€£$]\s?)?\d+(?:[.,]\d+)?(?:\s?(?:°C?|%|mm|km|min|h|k)(?!\p{L}))?/gu;

const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();

/** The distinct figures a text holds, as written. Single digits are skipped: too ambiguous to plant. */
export function figuresOf(text) {
  const out = [];
  for (const m of String(text || '').matchAll(FIGURE)) {
    const f = m[0].trim();
    if (f.replace(/\D/g, '').length < 2 && !/[€£$]/.test(f)) continue;
    if (!out.some((x) => norm(x) === norm(f))) out.push(f);
  }
  return out;
}

const has = (text, value) => norm(text).includes(norm(value));

/** The sentence of a note that holds `value`, cut to a readable length. */
function sentenceWith(text, value) {
  const parts = String(text).split(/(?<=[.!?])\s+/);
  const hit = parts.find((p) => has(p, value)) || String(text);
  const s = hit.replace(/\s*\[\d+\]/g, '').trim();
  return s.length > 180 ? `${s.slice(0, 177).trimEnd()}...` : s;
}

const asSentence = (s, cite) => `${s.replace(/[.!?]+$/, '')}. [${cite}]`;

/** A value that is certainly not any figure of the pack: the pre-edit stand-in (figure moved by a fifth, then by one). */
function editedValue(fig, taken) {
  const n = Number(String(fig).replace(/[^\d.,]/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  for (let bump = Math.max(2, Math.round(n * 0.2)); bump < Math.max(50, n * 2); bump++) {
    const v = Math.round((n + bump) * 10) / 10;
    const text = String(fig).replace(/\d+(?:[.,]\d+)?/, String(v));
    if (!taken.some((t) => has(t, text))) return text;
  }
  return null;
}

function pick(rand, list, n) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/**
 * Plants for one pack.
 *   pack     { question, notes: [{ n, text }], places: [{ id, city }] } (buildPack)
 *   context  { otherDay, otherTrip, previousTurn }: each { figures: [..], note?: string } or absent
 *   perKind  most plants of one kind for this pack
 */
export function plantsFor(pack, { seed = 1, perKind = 4, context = {}, packId = '' } = {}) {
  const rand = mulberry32(seed);
  const notes = pack.notes || [];
  const everyText = [pack.question, ...notes.map((n) => n.text)];
  const plants = [];
  const push = (kind, sentence, cites, planted, source) => {
    const cited = cites.map((c) => notes.find((n) => n.n === c)?.text || '');
    const coincident = cited.some((t) => has(t, planted.value)) || has(pack.question, planted.value);
    plants.push({
      id: `${packId || 'pack'}:${kind}:${plants.length}`,
      kind, sentence, cites, planted, source,
      expect: coincident ? 'coincident' : 'drop',
    });
  };

  // cross-note: every ordered pair (i, j), i != j, where i has the value and j does not.
  const figPairs = [];
  const placePairs = [];
  for (const a of notes) {
    for (const b of notes) {
      if (a.n === b.n) continue;
      for (const f of figuresOf(a.text)) if (!has(b.text, f)) figPairs.push({ a, b, f });
      for (const p of pack.places || []) if (p.city && has(a.text, p.city) && !has(b.text, p.city)) placePairs.push({ a, b, p });
    }
  }
  for (const { a, b, f } of pick(rand, figPairs, perKind)) push('cross-note-figure', asSentence(sentenceWith(a.text, f), b.n), [b.n], { type: 'figure', value: f }, { note: a.n });
  for (const { a, b, p } of pick(rand, placePairs, perKind)) push('cross-note-place', asSentence(sentenceWith(a.text, p.city), b.n), [b.n], { type: 'place', value: p.city }, { note: a.n, id: p.id });

  // foreign context: a figure that stands in the foreign notes and in no note of this pack.
  for (const [kind, key] of [['other-day', 'otherDay'], ['other-trip', 'otherTrip'], ['previous-turn', 'previousTurn']]) {
    const src = context[key];
    if (!src?.figures?.length || !notes.length) continue;
    const fresh = src.figures.filter((f) => !everyText.some((t) => has(t, f)));
    for (const f of pick(rand, fresh, perKind)) {
      const cite = notes[Math.floor(rand() * notes.length)].n;
      push(kind, asSentence(src.note ? sentenceWith(src.note, f) : `The figure is ${f}`, cite), [cite], { type: 'figure', value: f }, { context: key });
    }
  }

  // pre-edit: a figure of this pack as it stood before an edit moved it.
  const own = [...new Set(notes.flatMap((n) => figuresOf(n.text)))];
  for (const f of pick(rand, own, perKind)) {
    const old = editedValue(f, everyText);
    if (!old) continue;
    const note = notes.find((n) => has(n.text, f));
    push('pre-edit', asSentence(sentenceWith(note.text, f).replace(f, old), note.n), [note.n], { type: 'figure', value: old }, { note: note.n, was: f });
  }
  return plants;
}

/** A plant is well formed when it can be scored: known kind, a cited note that exists, the planted value in the sentence, a verdict. */
export function wellFormed(plant, pack) {
  if (!PLANT_KINDS.includes(plant.kind)) return false;
  if (!plant.cites?.length || !plant.cites.every((c) => (pack.notes || []).some((n) => n.n === c))) return false;
  if (!plant.planted?.value || !has(plant.sentence, plant.planted.value)) return false;
  if (!/\[\d+\]/.test(plant.sentence)) return false;
  return plant.expect === 'drop' || plant.expect === 'coincident';
}

/**
 * Plants for a corpus of packs, with foreign context taken from neighbours:
 * the previous pack stands for the previous turn, the next pack with the same
 * first place (else two on) for another day, a pack seven on for another trip.
 */
export function plantAll(packs, { seed = 1, perKind = 4 } = {}) {
  const figs = (p) => (p ? [...new Set(p.notes.flatMap((n) => figuresOf(n.text)))] : []);
  const ctx = (p) => (p ? { figures: figs(p), note: p.notes.map((n) => n.text).join(' ') } : null);
  const out = [];
  packs.forEach((entry, k) => {
    const pack = entry.pack || entry;
    const id = entry.id || `p${k}`;
    const first = pack.places?.[0]?.id;
    const sameDay = packs.slice(k + 1).find((x) => (x.pack || x).places?.[0]?.id === first && first);
    const context = {
      previousTurn: ctx((packs[k - 1] || {}).pack || packs[k - 1]),
      otherDay: ctx((sameDay || packs[(k + 2) % packs.length] || {}).pack || sameDay || packs[(k + 2) % packs.length]),
      otherTrip: ctx((packs[(k + 7) % packs.length] || {}).pack || packs[(k + 7) % packs.length]),
    };
    for (const p of plantsFor(pack, { seed: seed + k, perKind, context, packId: id })) out.push({ ...p, pack: id });
  });
  return out;
}

/** Counts by kind and the share that could not be told apart (the residual). */
export function summarisePlants(plants) {
  const byKind = Object.fromEntries(PLANT_KINDS.map((k) => [k, { total: 0, drop: 0, coincident: 0 }]));
  for (const p of plants) { byKind[p.kind].total++; byKind[p.kind][p.expect]++; }
  const coincident = plants.filter((p) => p.expect === 'coincident').length;
  return { total: plants.length, drop: plants.length - coincident, coincident, coincidentShare: plants.length ? coincident / plants.length : null, byKind };
}
