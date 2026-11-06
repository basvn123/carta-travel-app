/**
 * askSparse.js: BM25 over the Ask passages on the server (T1141, ROADMAP E2
 * item 1). The browser's bm25.json holds destinations and the lexicon only
 * (its download budget); the other sources are searched here, by
 * /api/ask, beside the dense half, and come back in the same row shape.
 *
 * scripts/build-ask-bm25.mjs writes one index per source in
 * SPARSE_SOURCES (bm25-<src>.json, the options of askTerms.js, the
 * country code stored) and lists them in manifest.bm25.server. A deploy
 * without them answers no sparse hits, nothing else changes.
 *
 * Which sources: measured on the E1 set (T1141 report). Beaches, lakes and
 * peaks cost about 10 MB of isolate memory and 3 ms a query; trails and
 * sights add a little recall but 55 MB more, too much beside the dense
 * vectors in a 128 MB isolate, so they stay dense only for now.
 *
 * Pure ESM, no node APIs: the Function and the eval both call it.
 */
import MiniSearch from 'minisearch';
import { ASK_BM25_OPTIONS, ASK_BM25_BOOST } from './askTerms.js';

export const SPARSE_SOURCES = Object.freeze(['beach', 'lake', 'peak']);
/** Hits kept per source, as the dense half's PER_SOURCE. */
export const SPARSE_PER_SOURCE = Object.freeze({ beach: 10, lake: 10, peak: 8, trail: 12, sight: 16, highlight: 24, journey: 8 });
/** The search options the browser uses too (retrieve.js). */
export const SPARSE_SEARCH = Object.freeze({
  boost: ASK_BM25_BOOST,
  prefix: (term) => term.length > 3,
  fuzzy: (term) => (term.length > 5 ? 0.2 : 0),
  combineWith: 'OR',
});

const PIDS = new WeakMap();

export function loadSparse(text) {
  return MiniSearch.loadJSON(text, ASK_BM25_OPTIONS);
}

/**
 * The top hits of one source for the BM25 words of a question.
 *   index  a loaded MiniSearch
 *   rows   the source's passage rows [pid, destId, text, payload]
 *   opts   { k, cc: Set, d: Set }
 * Returns rows as /api/ask answers them: [pid, destId, score, text, name].
 */
export function sparseSearch(index, rows, words, { k = 10, cc = null, d = null } = {}) {
  if (!index || !words) return [];
  let byPid = PIDS.get(rows);
  if (!byPid) { byPid = new Map(rows.map((r) => [r[0], r])); PIDS.set(rows, byPid); }
  const out = [];
  for (const h of index.search(words, SPARSE_SEARCH)) {
    const r = byPid.get(h.id);
    if (!r) continue;
    if (cc?.size && !cc.has(r[3]?.cc)) continue;
    if (d?.size && !d.has(r[1])) continue;
    out.push([r[0], r[1], Math.round(h.score * 1000) / 1000, r[2], r[3]?.name || '']);
    if (out.length >= k) break;
  }
  return out;
}
