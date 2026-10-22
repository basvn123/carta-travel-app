/*
 * A place Carta does not cover (T571). The parser drops a name it does not
 * know into Intent.unknown, and a question like "a trip to Dubai in
 * November" then reads as "a trip in November", so the answer plans a week
 * in the Balkans. This finds the name a traveller meant as the destination
 * (an unknown word right after "to", "naar", "nach", "à", "a" or "in") so
 * the answer can say plainly that Carta covers Europe and that place is not
 * in it, instead of answering a different question.
 *
 *   outsidePlace(text, intent) -> 'Dubai' | null
 */

// The word before a destination, in the six languages (lower case).
const BEFORE = new Set(['to', 'in', 'into', 'naar', 'nach', 'in', 'à', 'au', 'aux', 'en', 'a', 'para', 'per', 'verso']);

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function outsidePlace(text, intent) {
  if (!intent || intent.places?.length || intent.compare?.length) return null;
  if (intent.facets?.near || intent.facets?.country) return null;
  const unknown = new Set((intent.unknown || []).map(fold));
  if (!unknown.size) return null;
  const words = String(text || '').split(/[\s,.;:!?()"]+/).filter(Boolean);
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (!BEFORE.has(words[i - 1].toLowerCase()) || !unknown.has(fold(w))) continue;
    // A name runs on while the next word is unknown too ("New York").
    let name = w;
    while (i + 1 < words.length && unknown.has(fold(words[i + 1])) && /^\p{Lu}/u.test(words[i + 1])) {
      name += ` ${words[++i]}`;
    }
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return null;
}
