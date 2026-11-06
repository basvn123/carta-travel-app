/**
 * The place linker as the Explore search box's matcher (T1153, ROADMAP F4),
 * behind placeLinkingOn() (flag.js).
 *
 * Returns the same shape as querySearchIndex (src/lib/searchIndex.js), so
 * ExploreTab and useExploreCatalog read it unchanged:
 *   { ids: Set|null, bbox, regionLabel, memberHits, suggestions }
 * A region word ("tuscany") still filters by its box, from the index.
 * Confident: the linked place (its airports as one). Not confident: the
 * "did you mean" places are the hits, and their names are the suggestions
 * the empty state offers when other filters leave nothing.
 */
import { querySearchIndex } from '../searchIndex.js';
import { makeLinker, linkPlace } from './linker.js';

let cache = { key: null, linker: null };

/**
 * One linker per loaded index; built on the first query. The catalogue in
 * memory grows as Explore loads it, so the linker is rebuilt only when the
 * number of places changes, not on every new object.
 */
export function linkerFor(searchIndex, destinations = null, lexicon = null) {
  const n = destinations ? Object.keys(destinations).length : 0;
  if (cache.key !== searchIndex || cache.n !== n || cache.lex !== lexicon) {
    cache = { key: searchIndex, n, lex: lexicon, linker: makeLinker({ searchIndex, destinations, lexicon }) };
  }
  return cache.linker;
}

export function linkSearchHits(linker, searchIndex, rawQuery, ctx = {}) {
  const base = querySearchIndex(searchIndex, rawQuery);
  if (base.ids === null || base.bbox) return base; // too short, or a region
  const r = linkPlace(linker, rawQuery, ctx);
  const picked = r.confident ? [r.candidates[0]] : r.candidates.filter((c) => c.score >= linker.opts.suggest).slice(0, 3);
  const ids = new Set(picked.flatMap((c) => c.members || [c.id]));
  const memberHits = picked.filter((c) => c.kind === 'member' && c.label).map((c) => ({ id: c.id, member: c.label }));
  const suggestions = r.confident ? [] : picked.map((c) => c.name).filter(Boolean);
  return { ids, bbox: null, regionLabel: null, memberHits, suggestions, linked: r.linked ? r.linked.id : null };
}
