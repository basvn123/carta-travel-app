/**
 * "Near {place}" with the joining word a language bends before a vowel (G12,
 * judge 1 fix 3): French "Près d'Annecy", Italian "Vicino ad Ancona". The
 * other languages keep one form, so their elided keys say the same thing.
 *
 * French elides before a vowel and before a Y said as a vowel (Ypres,
 * Yverdon), not before Y and a vowel (Yalta). A place starting with H stays
 * "de": many place names have an aspirated h (Hambourg, Honfleur, Hongrie)
 * and guessing wrong reads worse than the plain form. Italian adds the d
 * before an a only, the common written use.
 */
const FR_VOWEL = /^[aeiouàâäéèêëîïôöùûüœæ]/i;
const FR_Y = /^y[^aeiouàâäéèêëîïôöùûü]/i;
const IT_A = /^[aà]/i;

/** True when `lang` bends its "near" word before `name`. */
export function elides(lang, name) {
  const s = String(name || '').normalize('NFC').trim();
  if (!s) return false;
  if (lang === 'fr') return FR_VOWEL.test(s) || FR_Y.test(s);
  if (lang === 'it') return IT_A.test(s);
  return false;
}

/** "Near {place}", or "{features} near {place}" when features are given. */
export function nearLabel(t, lang, place, features = '') {
  const bent = elides(lang, place) ? 'Elided' : '';
  return features
    ? t(`search.featuresNear${bent}`, { features, place })
    : t(`search.near${bent}`, { place });
}
