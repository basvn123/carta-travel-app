/**
 * askTerms.js: the one set of MiniSearch options for the Ask Carta BM25
 * index (T551). scripts/build-ask-bm25.mjs builds public/search/ask/bm25.json
 * with them, and whoever loads it must pass the same ones:
 *
 *   MiniSearch.loadJSON(text, ASK_BM25_OPTIONS)
 *   index.search(q, { boost: ASK_BM25_BOOST, prefix: ..., fuzzy: ... })
 *
 * Terms are lower-cased and accent-folded, so "cesky krumlov" finds
 * "Český Krumlov" and "ete" finds "été". Pure ESM, no node APIs.
 */

const MARKS = /[̀-ͯ]/g;
// Letters NFD leaves whole: fold them by hand so they match their plain form.
const LETTERS = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'đ': 'd', 'ł': 'l', 'ı': 'i', 'þ': 'th', 'ð': 'd' };
const LETTER_RE = /[ßæœøđłıþð]/g;

export function foldTerm(term) {
  return String(term || '').toLowerCase().normalize('NFD').replace(MARKS, '').replace(LETTER_RE, (c) => LETTERS[c]);
}

export const ASK_BM25_FIELDS = Object.freeze(['name', 'tags', 'text']);
export const ASK_BM25_BOOST = Object.freeze({ name: 3, tags: 2, text: 1 });

export const ASK_BM25_OPTIONS = Object.freeze({
  idField: 'id',
  fields: ASK_BM25_FIELDS,
  storeFields: [],
  processTerm: (term) => foldTerm(term) || null,
});

/** The document the index holds for one passage row [pid, destId, text, payload]. */
export function bm25Doc(row) {
  const [pid, , text, payload] = row;
  const p = payload || {};
  const tags = Array.isArray(p.tags) ? p.tags.map((t) => String(t).replace(/[-_]/g, ' ')).join(' ') : '';
  return { id: pid, name: p.name || p.value || '', tags, text: text || '' };
}
