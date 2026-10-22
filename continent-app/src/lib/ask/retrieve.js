/*
 * Ask Carta, stage 2: hybrid retrieval (T554). Two searches over the
 * passages the ask index layer built (T551), fused by reciprocal rank:
 *
 *   sparse  BM25 in the browser (MiniSearch, public/search/ask/bm25.json,
 *           place names, blurbs, tags and the lexicon: exact names and
 *           words are never lost to a vector)
 *   dense   /api/ask, the open static model on Carta's own Function: the
 *           question's meaning against destinations and their highlights,
 *           sights and trails, filtered on country or place first
 *
 * Either half may be missing (no index yet, offline, slow): the answer then
 * stands on the other, or on the rules alone, and says nothing false about
 * it. The result feeds rank.js (a relevance rank per place) and context.js
 * (the passages the written answer may quote).
 *
 *   makeRetriever(opts) -> async (intent, text) => {
 *     retrieved  Map(destId -> { rank, pids })
 *     passages   [{ pid, destId, text, source, name }]
 *     slots      a facet delta for words only the lexicon placed
 *     dense      true when /api/ask answered
 *   }
 */
import { dataUrl } from '../dataHost.js';

/** The rank constant of reciprocal rank fusion (Cormack et al. use 60). */
export const RRF_K = 60;
export const DENSE_TIMEOUT_MS = 1200;

const SOURCES = {
  find: 'dest,highlight', near: 'dest,highlight', budget: 'dest,highlight', plan: 'dest,highlight,trail',
  about: 'highlight,sight,trail', when: 'highlight', compare: 'highlight,sight',
};

let bm25Promise = null;
/** The BM25 index, loaded once; null when it is not on this deploy. */
export function loadBm25() {
  if (!bm25Promise) {
    bm25Promise = Promise.all([
      fetch(dataUrl('/search/ask/bm25.json')).then((r) => (r.ok ? r.text() : null)),
      import('minisearch'),
      import('../../../functions/_lib/askTerms.js'),
    ]).then(([text, { default: MiniSearch }, terms]) => (text ? MiniSearch.loadJSON(text, terms.ASK_BM25_OPTIONS) : null))
      .catch(() => null);
  }
  return bm25Promise;
}

/** Ranked lists of ids, fused: a place high in either list ranks high. */
export function rrf(lists, k = RRF_K) {
  const score = new Map();
  for (const list of lists) {
    list.forEach((id, r) => score.set(id, (score.get(id) || 0) + 1 / (k + r + 1)));
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

const uniq = (ids) => [...new Set(ids.filter(Boolean))];

/** A lexicon match as a facet, only for a slot the question left empty. */
export function slotsFrom(lex, intent) {
  const delta = {};
  for (const [, slot, value] of lex || []) {
    if (slot === 'vibe' && !intent.facets.vibe && !delta.vibe) delta.vibe = value;
    if (slot === 'sort' && value === 'cost' && !intent.facets.sort) delta.sort = 'cost';
    if (slot === 'extra') {
      if (value === 'nocar') delta.nocar = true;
      else if (value === 'quiet') delta.quiet = true;
      else delta.nb = [...new Set([...(intent.facets.nb || []), ...(delta.nb || []), value])];
    }
  }
  return delta;
}

export function makeRetriever({ endpoint = '/api/ask', timeoutMs = DENSE_TIMEOUT_MS, bm25 = loadBm25, fetchImpl = (...a) => fetch(...a) } = {}) {
  return async function retrieve(intent, text) {
    const q = String(text || '').trim().slice(0, 200);
    if (!q) return null;
    const ids = [...(intent.places || []), ...(intent.compare || [])];
    const params = new URLSearchParams({ q, src: SOURCES[intent.type] || 'dest,highlight' });
    if (intent.facets.country) params.set('cc', intent.facets.country);
    if (ids.length) params.set('d', ids.slice(0, 12).join(','));
    if (intent.unknown?.length) params.set('u', intent.unknown.slice(0, 5).join('|'));

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const densePromise = fetchImpl(`${endpoint}?${params}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null).finally(() => clearTimeout(timer));
    const [index, dense] = await Promise.all([Promise.resolve(bm25()).catch(() => null), densePromise]);

    const lists = [];
    if (index) {
      const hits = index.search(q, { prefix: (term) => term.length > 3, fuzzy: (term) => (term.length > 5 ? 0.2 : 0), combineWith: 'OR' });
      lists.push(uniq(hits.filter((h) => h.id.startsWith('dest:')).map((h) => h.id.slice(5))).slice(0, 60));
    }
    const passages = [];
    if (dense?.hits) {
      for (const [src, rows] of Object.entries(dense.hits)) {
        if (src === 'dest') { lists.push(uniq(rows.map((r) => r[1]))); continue; }
        lists.push(uniq(rows.map((r) => r[1])));
        for (const [pid, destId, , ptext, name] of rows) passages.push({ pid, destId, text: ptext, source: src, name });
      }
    }
    const order = rrf(lists);
    const pidsOf = new Map();
    for (const p of passages) {
      if (!p.destId) continue;
      if (!pidsOf.has(p.destId)) pidsOf.set(p.destId, []);
      pidsOf.get(p.destId).push(p.pid);
    }
    const retrieved = new Map(order.map((id, rank) => [id, { rank, pids: pidsOf.get(id) || [] }]));
    return {
      retrieved: retrieved.size ? retrieved : null,
      passages,
      slots: slotsFrom(dense?.lex, intent),
      dense: !!dense,
      sparse: !!index,
    };
  };
}
