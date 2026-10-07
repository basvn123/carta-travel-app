/**
 * derived.mjs, the sentences a non-English prerendered page carries instead of
 * English-only prose (T368, owner call T362 on T205-g).
 *
 * The Wikivoyage intro of a destination, the composer's hook of a trip and a
 * journey's hook, summary and day titles exist in English only. On a page in
 * another language they are displaced, not translated: the page opens with
 * sentences built here from the structured fields, through the six i18n
 * catalogues, the same way trailStory.js builds the layer pages. A page's own
 * proper names (a town, a trail) stay as they are; the English page is
 * untouched, because none of this runs for `en`.
 *
 * The page chrome around these sentences (headings, fact labels) is still
 * English in pages.mjs, and so is the country name. Turning the whole page
 * into six languages is the hreflang wave of T222-b; this module is the rule
 * that makes that wave possible for destinations, trips and journeys.
 */
import { en } from '../../src/i18n/en.js';
import { de } from '../../src/i18n/de.js';
import { es } from '../../src/i18n/es.js';
import { fr } from '../../src/i18n/fr.js';
import { it } from '../../src/i18n/it.js';
import { nl } from '../../src/i18n/nl.js';

const CATALOGUES = { en, de, es, fr, it, nl };
export const DERIVED_LANGS = Object.keys(CATALOGUES);

/** A catalogue string with {vars} filled in, English as the fallback. */
export function tr(lang, key, vars = {}) {
  const raw = (CATALOGUES[lang] && CATALOGUES[lang][key]) || en[key] || key;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

const nf = (lang, opts) => new Intl.NumberFormat(lang, opts);

/** "A, B and C" in the page's language. */
export function listNames(lang, names) {
  try { return new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(names); } catch { return names.join(', '); }
}

/** The lead sentences of a destination page: what it is, and what a day costs. */
export function destLead(lang, { name, country, score, day }) {
  const lead = Number.isFinite(score)
    ? tr(lang, 'prerender.destLead', { name, country, score: nf(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(score) })
    : tr(lang, 'prerender.destLeadPlain', { name, country });
  const cost = day != null ? tr(lang, 'prerender.destCost', { name, day }) : null;
  return [lead, cost].filter(Boolean);
}

export function destRank(lang, { rank, n, country }) {
  return tr(lang, 'prerender.destRank', { rank: nf(lang, {}).format(rank), n: nf(lang, {}).format(n), country });
}

export function tripLead(lang, { days, nights, names, perDayEur }) {
  const out = [tr(lang, 'prerender.tripLead', { days, nights, names: listNames(lang, names) })];
  if (perDayEur) out.push(tr(lang, 'prerender.tripCost', { eur: `€${nf(lang, { maximumFractionDigits: 0 }).format(perDayEur)}` }));
  return out;
}

export function journeyLead(lang, { name, days, country, perDayEur }) {
  const out = [tr(lang, 'prerender.journeyLead', { name, days, country })];
  if (perDayEur) out.push(tr(lang, 'prerender.journeyCost', { eur: `€${nf(lang, { maximumFractionDigits: 0 }).format(perDayEur)}` }));
  return out;
}
