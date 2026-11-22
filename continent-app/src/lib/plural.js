/**
 * One plural rule for every count string (G12 round 2, flow-search F3): a
 * key with a singular twin (`filters.showOne`, `band.filtersOnOne`) takes it
 * when the language's own rule says "one", so French says "1 actif" and
 * "0 actif" while English keeps "0 on". Intl.PluralRules knows the six
 * languages; the rule objects are cached per language.
 */
const rules = new Map();

export function isOne(lang, n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return false;
  let r = rules.get(lang);
  if (!r) {
    try { r = new Intl.PluralRules(lang || 'en'); } catch { r = new Intl.PluralRules('en'); }
    rules.set(lang, r);
  }
  return r.select(num) === 'one';
}

/** The key for a count: `${base}One` when the language says one, else `${many}`. */
export function countKey(lang, n, one, many) {
  return isOne(lang, n) ? one : many;
}
