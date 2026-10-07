/**
 * The tag filter of the curated trip list (T089).
 *
 * A trip carries up to six free-form tags ("hut-to-hut", "unesco"); the wire
 * has about a thousand distinct ones, far too many to offer as buttons. The
 * list therefore offers only the tags that are common in the style that is
 * open: written on at least three of its trips, at most twelve of them, the
 * most common first. The vocabulary is read before any other filter, so the
 * buttons do not come and go as the search or the cost band change; only
 * their counts do.
 *
 * Pure functions only, so the node tests import them without a JSX loader.
 */
export const TAG_MIN = 3;
export const TAG_MAX = 12;

/** A tag slug as a person reads it: "slow-travel" is "slow travel". */
export const tagLabel = (tag) => String(tag || '').replace(/-/g, ' ').trim();

const tagsOf = (card) => (Array.isArray(card?.tags) ? card.tags.filter(Boolean) : []);

/** The tags worth a button for these cards, most common first, ties by name. */
export function tagVocabulary(cards, { min = TAG_MIN, max = TAG_MAX } = {}) {
  const n = new Map();
  for (const c of cards || []) for (const tag of new Set(tagsOf(c))) n.set(tag, (n.get(tag) || 0) + 1);
  return [...n.entries()]
    .filter(([, count]) => count >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([tag]) => tag);
}

/** The cards that carry the tag. No tag means every card. */
export function filterByTag(cards, tag) {
  if (!tag) return cards;
  return cards.filter((c) => tagsOf(c).includes(tag));
}

/** How many of the cards carry each tag of the vocabulary. */
export function tagCounts(cards, vocabulary) {
  const out = {};
  for (const tag of vocabulary) out[tag] = 0;
  for (const c of cards || []) for (const tag of new Set(tagsOf(c))) if (tag in out) out[tag] += 1;
  return out;
}
