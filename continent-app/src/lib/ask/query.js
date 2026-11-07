/*
 * Ask Carta: the question as the BM25 index reads it (T1141, ROADMAP E2).
 *
 * The passages are English (pipeline/ask_index_layer.py writes them from
 * the catalogue), and a question in Dutch or Italian found almost nothing
 * there: on the E1 set the sparse list scored 0 recall@10 on most non
 * English questions. This turns a question into English search words, with
 * nothing but vocabularies Carta already holds:
 *
 *   1. the typed words, folded, less the stop words of all six languages
 *      and the month names (the facets carry the month; passages rarely
 *      name one)
 *   2. for each typed word or phrase of another language that the guided
 *      vocabulary knows (VIBE_WORDS_I18N, "dorp", "kastelen", "lago"),
 *      the English words of that vibe as well
 *   3. what the rules read: the English words of the vibe, the country's
 *      English name (passages open with "City, Country.") and the area
 *
 * No model, no network, a few microseconds. The same function serves the
 * browser (retrieve.js) and the eval (scripts/eval/ask-eval.mjs).
 */
import { STOP, VIBE_WORDS, VIBE_WORDS_I18N, words } from '../guidedSearch.js';

const MONTHS = new Set(('january february march april may june july august september october november december '
  + 'januari februari maart mei juni juli augustus oktober '
  + 'januar februar marz mai oktober dezember '
  + 'janvier fevrier mars avril juin juillet aout septembre octobre novembre decembre '
  + 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre '
  + 'gennaio febbraio aprile maggio giugno luglio settembre ottobre dicembre '
  + 'spring summer autumn fall winter lente zomer herfst winter fruhling sommer herbst '
  + 'printemps ete automne hiver primavera verano otono invierno estate autunno inverno').split(' '));

// Words that are questions or trip talk, not things a place is: they match
// every passage that says "day" or "plan" and push the right ones down.
const TRIP = new Set(('plan plane planea planifie pianifica itinerary route road trip week weekend days day dagen tage '
  + 'jours dias giorni dag tag jour dia giorno under below euro euros eur cheap cheapest budget a day per '
  + 'how what which is it are do does can should would like tell about visit time least more most best '
  + 'make me us two for kids easy still late early near close around next by within '
  + 'wanneer hoe wann wie quand comment cuando como quando com e').split(' '));

const ALL_STOP = new Set(Object.values(STOP).flatMap((s) => s.split(' ')));

/** English names of the guided areas whose id is not one (guided.json ids). */
const AREA_WORDS = {
  picos: 'picos de europa', highlands: 'scottish highlands', blackforest: 'black forest', julian: 'julian alps',
  lakedistrict: 'lake district', amalfi: 'amalfi coast', costabrava: 'costa brava', cotedazur: 'french riviera',
  cinqueterre: 'cinque terre', balearics: 'balearic islands', canaries: 'canary islands', ionian: 'ionian islands',
  basque: 'basque country',
};

let REGION = null;
function countryName(cc) {
  if (!cc) return '';
  try {
    if (!REGION) REGION = new Intl.DisplayNames(['en'], { type: 'region' });
    return REGION.of(cc) || '';
  } catch {
    return '';
  }
}

/** Every other-language vibe word or phrase (folded) to its vibe. */
const FOREIGN = (() => {
  const out = new Map();
  for (const table of Object.values(VIBE_WORDS_I18N)) {
    for (const [vibe, list] of Object.entries(table)) for (const w of list) if (!out.has(w)) out.set(w, vibe);
  }
  return out;
})();
const englishOf = (vibe) => (VIBE_WORDS[vibe] || []).slice(0, 2);

/**
 * The BM25 query of a question: a space separated string of folded words,
 * English first where Carta knows the English.
 */
export const QUERY_PARTS = { vibe: true, foreign: true, country: true, area: true };

export function bm25Query(intent, text, parts = QUERY_PARTS) {
  const toks = words(text);
  const out = [];
  const add = (w) => { for (const x of words(w)) if (x.length > 1 && !out.includes(x)) out.push(x); };
  const joined = ` ${toks.join(' ')} `;
  for (const [phrase, vibe] of FOREIGN) {
    if (!parts.foreign) break;
    if (phrase.includes(' ') ? joined.includes(` ${phrase} `) : toks.includes(phrase)) englishOf(vibe).forEach(add);
  }
  const f = intent?.facets || {};
  if (f.vibe && parts.vibe) englishOf(f.vibe).forEach(add);
  for (const nb of f.nb || []) add(nb);
  if (f.area && parts.area) add(AREA_WORDS[f.area] || f.area);
  if (f.country && parts.country) add(countryName(f.country));
  for (const w of toks) {
    if (ALL_STOP.has(w) || MONTHS.has(w) || TRIP.has(w) || /^\d+$/.test(w)) continue;
    // A foreign vibe word stays too: "bergen" is mountains in Dutch and a
    // city in Norway, and the name field (boost 3) must still find Bergen.
    add(w);
  }
  return out.join(' ');
}
