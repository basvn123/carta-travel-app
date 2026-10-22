/*
 * A follow-up in an Ask Carta chat (T572). "Where to stay there?" after an
 * answer about Porto names no place, so the parser reads it as a question
 * about all of Europe. This binds such a question to the place the last
 * answer was about: a question that names no place and either points back
 * ("there", "daar", "dort", "là", "allí", "lì") or asks nothing of its own
 * (no vibe, area, country, budget or other facet, a month at most).
 *
 *   bindFollowUp(text, intent, prev) -> intent (bound or as it was)
 *   prev = { id, city } the place the last answer was about, or null
 *
 * A bound intent is about that place (or keeps `when` and `plan`, which take
 * a place too) and carries `followOf: prev.id`, so the turn can say which
 * place it answered about. Its unknown words are dropped: they were the
 * words of the question around the place ("stay", "eat"), not a search.
 */

// Words that point back to a place, as typed (accents kept, so French and
// Spanish "la" the article never matches "là").
const BACK = new Set([
  'there', 'here', 'daar', 'daarheen', 'hier', 'dort', 'dorthin', 'là', 'là-bas',
  'allí', 'allá', 'ahí', 'lì', 'laggiù',
]);
// Facets that make a question its own search, not a follow-up.
const OWN = ['vibe', 'area', 'country', 'near', 'budget', 'nb', 'nocar', 'quiet', 'warm'];
const KEEPS_PLACE = new Set(['when', 'plan', 'about']);

export function pointsBack(text) {
  return String(text || '').toLowerCase().split(/[\s,.;:!?()"']+/).some((w) => BACK.has(w));
}

export function bindFollowUp(text, intent, prev) {
  if (!intent || !prev?.id) return intent;
  if (intent.places?.length || intent.compare?.length || intent.type === 'budget') return intent;
  const f = intent.facets || {};
  const own = OWN.some((k) => (Array.isArray(f[k]) ? f[k].length : !!f[k]));
  if (own && !pointsBack(text)) return intent;
  if (!own && !pointsBack(text) && intent.type !== 'about' && (intent.unknown || []).length === 0) return intent;
  return {
    ...intent,
    type: KEEPS_PLACE.has(intent.type) ? intent.type : 'about',
    places: [prev.id],
    unknown: [],
    followOf: prev.id,
  };
}
