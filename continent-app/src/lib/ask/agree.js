/*
 * Ask Carta, stage 6b: the written answer and the cards agree (T1101, E6).
 * Live failure (audit P-35): "quiet lake with good walks in June under 120 a
 * day" wrote Castel di Tora and showed Esztergom. verify.js keeps a sentence
 * to the notes; this keeps it to the cards the traveller sees:
 *
 *   - a sentence names only places that are on a visible card (a place that
 *     is in the notes but not on a card, or on a card not yet opened, fails)
 *   - a figure beside a named place comes from a cited note about that place
 *     (or from a note about no one place), never from another place's row
 *   - a month it names is one a cited note, or the question, names
 *   - where the answer ranks places, they are named in the cards' order
 *
 * Pure; runs per sentence on the stream (agreeSentence) and once on the
 * finished text (orderAgrees). Reads the pack; changes no price module.
 */
import { foldName } from '../searchIndex.js';

/** Types whose cards are a ranking: the text may not reorder them. */
export const RANKED = new Set(['find', 'budget', 'when', 'plan', 'near']);

const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];
const MONTHS = new Map();
for (const l of LANGS) {
  for (let m = 1; m <= 12; m++) {
    const name = new Intl.DateTimeFormat(l, { month: 'long' }).format(new Date(2026, m - 1, 15));
    MONTHS.set(foldName(name), m);
  }
}
const MONTH_RE = new RegExp(`(?:^|[^\\p{L}])(${[...MONTHS.keys()].join('|')})(?=$|[^\\p{L}])`, 'gu');

const digits = (s) => String(s).replace(/(\d)[.,\s'](?=\d{3}\b)/g, '$1');
const figuresOf = (s) => (digits(s).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'));
const monthsOf = (s) => new Set([...foldName(s).matchAll(MONTH_RE)].map((m) => MONTHS.get(m[1])));
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cityOf = (n) => String(n || '').replace(/\s*\(.*\)$/, '').trim();

/** Places named in a text, in order of first mention: [{ name, at }]. */
export function namedIn(text, names) {
  const list = [...new Set(names.map(cityOf))].filter((n) => n.length >= 4 && /^\p{Lu}/u.test(n));
  if (!list.length) return [];
  const re = new RegExp(`(?:^|[^\\p{L}])(${list.sort((a, b) => b.length - a.length).map(esc).join('|')})(?=$|[^\\p{L}])`, 'gu');
  const seen = new Map();
  for (const m of text.matchAll(re)) if (!seen.has(m[1])) seen.set(m[1], m.index);
  return [...seen].map(([name, at]) => ({ name, at }));
}

/**
 * The guard for one pack and its visible cards.
 *   cards       [{ id, city }] the cards on screen now, in order
 *   knownPlaces every catalogue city name
 * Returns { sentence(s) -> { ok, why }, order(sentences, type) -> bool }.
 */
export function makeAgreement(pack, cards, knownPlaces = []) {
  const shown = new Map(cards.map((c) => [cityOf(c.city), c.id]));
  const cityId = new Map((pack.places || []).map((p) => [cityOf(p.city), p.id]));
  for (const [c, id] of shown) cityId.set(c, id);
  const names = [...new Set([...knownPlaces, ...cityId.keys()])];
  const noteMonths = pack.notes.map((n) => monthsOf(n.text));
  const qMonths = monthsOf(pack.question);
  const qFigures = new Set(figuresOf(pack.question));
  const noteFigs = pack.notes.map((n) => new Set(figuresOf(n.text)));

  function sentence(s) {
    const why = [];
    const text = s.text;
    const named = namedIn(text, names);
    const off = named.find((x) => !shown.has(x.name));
    if (off) why.push(`nocard:${off.name}`);
    const ids = new Set(named.map((x) => cityId.get(x.name)).filter(Boolean));
    const cited = s.cites.map((c) => pack.notes[c - 1]).filter(Boolean);
    if (ids.size) {
      // A note about another place cannot carry a figure for this one.
      const usable = new Set();
      s.cites.forEach((c, i) => {
        const n = cited[i];
        if (n && (!n.destId || ids.has(n.destId))) for (const f of noteFigs[c - 1]) usable.add(f);
      });
      for (const f of figuresOf(text)) {
        if (!usable.has(f) && !qFigures.has(f)) { why.push(`otherplace:${f}`); break; }
      }
    }
    const allowedM = new Set(qMonths);
    for (const c of s.cites) for (const m of noteMonths[c - 1] || []) allowedM.add(m);
    for (const m of monthsOf(text)) if (!allowedM.has(m)) { why.push(`month:${m}`); break; }
    return { ok: why.length === 0, why };
  }

  /** The places first named across the kept sentences follow the cards' order. */
  function order(sentences, type) {
    if (!RANKED.has(type)) return true;
    const rank = new Map(cards.map((c, i) => [cityOf(c.city), i]));
    const seen = [];
    for (const s of sentences) {
      for (const x of namedIn(s.text, [...rank.keys()])) if (!seen.includes(x.name)) seen.push(x.name);
    }
    const idx = seen.map((n) => rank.get(n));
    return idx.every((v, i) => i === 0 || v > idx[i - 1]);
  }
  return { sentence, order };
}
