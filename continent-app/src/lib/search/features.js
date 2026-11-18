/**
 * Feature words (G12, decision.md section 3): the filter pane is gone, so
 * "beach", "lake" or "old town" typed into the search become removable
 * tokens that narrow the places a result holds. Six languages, folded the
 * way the rest of search folds, matched as whole words only so "Skiathos"
 * is never "ski".
 *
 * A token keeps the catalogue's own category tags (app_data `categories`),
 * the same tags the old kind filter read (lib/trip_kinds.js).
 */
import { foldName } from '../searchIndex.js';

export const FEATURES = Object.freeze({
  beach: {
    tags: ['beach'],
    words: ['beach', 'beaches', 'strand', 'stranden', 'strande', 'plage', 'plages', 'playa', 'playas', 'spiaggia', 'spiagge'],
  },
  lake: {
    tags: ['lake', 'lakes'],
    words: ['lake', 'lakes', 'meer', 'meren', 'see', 'seen', 'lac', 'lacs', 'lago', 'lagos', 'laghi'],
  },
  hiking: {
    tags: ['hiking', 'national-park'],
    words: ['hiking', 'hike', 'walking', 'wandelen', 'wandeling', 'wandern', 'wanderung', 'randonnee', 'randonnees',
      'rando', 'senderismo', 'escursionismo', 'escursioni', 'trekking'],
  },
  ski: {
    tags: ['skiing'],
    words: ['ski', 'skiing', 'skien', 'skifahren', 'esqui', 'sci'],
  },
  oldtown: {
    tags: ['historic', 'medieval'],
    words: ['old town', 'oude stad', 'oude binnenstad', 'altstadt', 'vieille ville', 'centre historique',
      'casco antiguo', 'casco historico', 'centro storico', 'citta vecchia', 'centro historico'],
  },
  islands: {
    tags: ['island', 'islands'],
    words: ['island', 'islands', 'eiland', 'eilanden', 'insel', 'inseln', 'ile', 'iles', 'isla', 'islas', 'isola', 'isole'],
  },
});

export const FEATURE_KEYS = Object.freeze(Object.keys(FEATURES));

// Longest phrase first, so "old town" wins over a one-word match inside it.
const PHRASES = FEATURE_KEYS
  .flatMap((key) => FEATURES[key].words.map((w) => ({ key, words: foldName(w).split(/\s+/) })))
  .sort((a, b) => b.words.length - a.words.length);

/**
 * Lifts feature words out of a query.
 *   extractTokens('beach portu')  -> { tokens: ['beach'], rest: 'portu' }
 *   extractTokens('Lago di Garda', ['lake']) -> nothing lifted (dropped)
 * `dropped` holds tokens the traveller removed: their words stay text.
 */
export function extractTokens(query, dropped = []) {
  const words = foldName(query).split(/\s+/).filter(Boolean);
  const off = new Set(dropped);
  const tokens = [];
  const keep = [];
  for (let i = 0; i < words.length;) {
    const hit = PHRASES.find((p) => !off.has(p.key)
      && p.words.every((w, j) => words[i + j] === w));
    if (hit) {
      if (!tokens.includes(hit.key)) tokens.push(hit.key);
      i += hit.words.length;
    } else {
      keep.push(words[i]);
      i += 1;
    }
  }
  return { tokens, rest: keep.join(' ') };
}

/**
 * The typed text without one feature's words, keeping the rest as typed
 * (fixes-r1 Q6): removing the Beach token takes "beach" out of the field,
 * so it does not come back as a name search for "Palm Beach".
 */
export function removeFeature(query, key) {
  const words = String(query || '').split(/\s+/).filter(Boolean);
  const phrases = (FEATURES[key]?.words || []).map((w) => foldName(w).split(/\s+/))
    .sort((a, b) => b.length - a.length);
  const out = [];
  for (let i = 0; i < words.length;) {
    const hit = phrases.find((ph) => ph.every((w, j) => words[i + j] !== undefined && foldName(words[i + j]) === w));
    if (hit) i += hit.length;
    else { out.push(words[i]); i += 1; }
  }
  return out.join(' ');
}

/** True when a place's categories carry every token's feature. */
export function hasFeatures(categories, tokens) {
  if (!tokens?.length) return true;
  const cats = categories || [];
  return tokens.every((k) => (FEATURES[k]?.tags || []).some((tag) => cats.includes(tag)));
}
