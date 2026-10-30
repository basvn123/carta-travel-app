/**
 * prefill.js, what a sentence already answers (T654), now a thin wrapper over
 * the one trip parser, lib/plan/parseTrip.js (T857). Tell Carta reads the
 * parser directly; this keeps the older call shape for its callers and tests.
 *
 * prefillFromText(text, { countries, vocab, lang, destinations, origins, today })
 *   -> { patch, answered, countries }
 *   patch      a partial settings object (party, when, priority, booked, guide, places)
 *   answered   the question ids the patch answers
 *   countries  the catalogue country names the text names (with a vocabulary),
 *              else the names in `countries` the text says
 */
import { parseTrip, applyTrip, placeCountries } from '../../lib/plan/parseTrip.js';
import { defaultSettings, screenGiven } from './tripSettings.js';
import { foldName } from '../../lib/searchIndex.js';

const folded = (s) => ` ${foldName(String(s || '')).replace(/[.,;:!?()"]/g, ' ').replace(/\s+/g, ' ').trim()} `;

export function prefillFromText(text, { countries = [], vocab = null, lang = 'en', destinations = null, origins = null, today } = {}) {
  const parsed = parseTrip(text, { vocab, lang, destinations, origins, today });
  const { patch, answered } = applyTrip(defaultSettings(), parsed);
  let named = placeCountries(patch.places);
  if (!vocab) {
    const tx = folded(text);
    named = countries.filter((c) => c && tx.includes(folded(c)));
  }
  return { patch, answered: answered.filter((id) => id !== 'places'), countries: named };
}

/**
 * The answers a screen gave (T856, T857): every answered question whose
 * source is not the words. Settings from before T857 carry no sources; for
 * them the trip's own words (settings.note) are read again to tell them apart.
 */
export function screenAnswered(s) {
  if (!s) return [];
  if (s.sources && Object.keys(s.sources).length) return screenGiven(s);
  const words = new Set(prefillFromText(s.note || '').answered);
  return (s.answered || []).filter((id) => !words.has(id));
}
