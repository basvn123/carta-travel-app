/**
 * The bridge from a picked suggestion to Explore's list (G12). A pick keeps
 * today's flow: the panel runs the same search App runs on Enter, with the
 * result's label as the query ("Near Zermatt", "Valais"). Before that it
 * records here which places the label means, and lib/searchIndex.js
 * querySearchIndex answers that label with these hits, so the existing list
 * filter (useExploreCatalog `searchHits.ids`) shows them with no change to
 * Explore's layout or its code.
 *
 * Kept in sessionStorage too, so a reload of a searched list keeps its
 * places; a label typed by hand is never a pick and searches as before.
 */
const KEY = 'carta.search.picked';
const MAX = 12;
let memory = null;

function read() {
  if (memory) return memory;
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    memory = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(memory)) memory = [];
  } catch {
    memory = [];
  }
  return memory;
}

function write(list) {
  memory = list;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* private mode or full storage: the pick still works this session */ }
}

const norm = (q) => String(q || '').trim().toLowerCase();

/** Remember that `query` means `hits` (lib/search/resolve.js hitsFor). */
export function rememberPick(query, hits) {
  const q = norm(query);
  if (!q || !hits?.ids) return;
  const entry = {
    q,
    ids: [...hits.ids],
    regionLabel: hits.regionLabel || null,
    picked: hits.picked || null,
  };
  write([entry, ...read().filter((e) => e.q !== q)].slice(0, MAX));
}

/** The hits a picked label stands for, or null when it was never picked. */
export function pickedHits(query) {
  const q = norm(query);
  if (!q) return null;
  const e = read().find((x) => x.q === q);
  if (!e) return null;
  return {
    ids: new Set(e.ids),
    bbox: null,
    regionLabel: e.regionLabel,
    memberHits: [],
    suggestions: [],
    picked: e.picked,
  };
}

/** For tests. */
export function resetPicked() {
  memory = [];
  try { sessionStorage?.removeItem(KEY); } catch { /* nothing to clear */ }
}
