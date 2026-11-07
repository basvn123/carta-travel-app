/**
 * suggest-city's prompt and response schema (T1140, ROADMAP E5). The text
 * lives in the prompt registry (prompts/suggest-city/v<N>.md), bundled
 * through ../_shared/prompts.js; this file only decides which lines apply.
 * The system slot holds aiGuard's systemRules. Since v2 (T1206) the
 * traveller's wish and the client-sent candidate deck are fenced as data
 * blocks with the call's nonce, as plan-day's are.
 */
import { frag, suggestCity as P } from '../_shared/prompts.js';
import { dataBlock } from '../_shared/aiGuard.mjs';

/** @type {Record<string, string>} */
export const LANG_NAMES = {
  en: 'English', nl: 'Dutch', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
};

// Gemini's API rejects combining the google_search tool with
// responseSchema/responseMimeType in one call (grounding and controlled
// generation are mutually exclusive server-side, as of this writing). Since
// grounding is the entire point of this endpoint and stays on by default,
// the schema below is only actually SENT when grounding is off; when
// grounding is on, the same shape is spelled out in the prompt instead
// (fragment groundedFormat) and the reply is parsed defensively
// (aiModels.parseModelJson, loose).
export const RESPONSE_SCHEMA = JSON.parse(frag(P, 'schema'));

const f = (name, vars) => frag(P, name, vars);

/**
 * @param {{
 *   stayLabel: string, focus: string | null, interests: string[], freeText: string, lang: string,
 *   candidates: unknown[], groundedFormat: boolean, nonce: string,
 * }} p
 * @returns {string}
 */
export function buildPrompt(p) {
  const langName = LANG_NAMES[p.lang] || 'English';
  const lines = [
    f('intro', { stayLabel: p.stayLabel }),
    '',
    f('candidatesHeader'),
    dataBlock('CANDIDATES', JSON.stringify(p.candidates), p.nonce),
    '',
    f('rulesHeader'),
    f('preferCatalogue'),
    f('beyondList'),
    f('count'),
    p.focus === 'nature' ? f('focus.nature') : '',
    p.focus === 'city' ? f('focus.city') : '',
    p.interests.length ? f('interests', { interests: p.interests.join(', ') }) : '',
    p.freeText ? f('wish', { wishBlock: dataBlock('WISH', p.freeText, p.nonce) }) : f('noWish'),
    f('language', { lang: langName }),
    f('noDashes'),
    p.groundedFormat ? f('groundedFormat') : '',
  ];
  return lines.filter(Boolean).join('\n');
}
