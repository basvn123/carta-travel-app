/*
 * Ask Carta's own wires, loaded once on first use and cached for the
 * session: the lexicon (T552, public/search/ask/lexicon.json, a few KB) and,
 * when the ask index layer has shipped (T551), its manifest and BM25 index.
 * Everything that reads these works without them: no lexicon means the
 * guided vocabulary alone, no index means the rules and the facts alone.
 */
import { dataUrl } from '../dataHost.js';

const cache = new Map();

function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(dataUrl(path))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null));
  }
  return cache.get(path);
}

export const loadAskLexicon = () => load('/search/ask/lexicon.json');
export const loadAskManifest = () => load('/search/ask/manifest.json');
