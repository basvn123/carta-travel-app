/**
 * parse-booking's prompt and response schema (T1140, ROADMAP E5). The text
 * lives in the prompt registry (prompts/parse-booking/v<N>.md), bundled
 * through ../_shared/prompts.js; this file only decides which lines apply.
 * The uploaded files follow the prompt as inline parts (index.ts); the
 * system slot holds aiGuard's systemRules.
 */
import { dataBlock } from '../_shared/aiGuard.mjs';
import { frag, parseBooking as P } from '../_shared/prompts.js';

/** @type {Record<string, string>} */
export const LANG_NAMES = {
  en: 'English', nl: 'Dutch', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
};

// Structured output: malformed JSON impossible, unknown keys unrepresentable.
export const RESPONSE_SCHEMA = JSON.parse(frag(P, 'schema'));

const f = (name, vars) => frag(P, name, vars);

/**
 * @param {{
 *   context: { groupSize: number, stops: { city: string, country?: string, arrive?: string, nights: number, firstDay: number, lastDay: number }[] },
 *   lang: string, hasFiles: boolean, text: string, nonce: string,
 * }} p
 * @returns {string}
 */
export function buildPrompt(p) {
  const langName = LANG_NAMES[p.lang] || 'English';
  const stops = p.context.stops.map((s, i) => f('stop', {
    n: i + 1, city: s.city,
    country: s.country ? f('stop.country', { country: s.country }) : '',
    arrive: s.arrive ? f('stop.arrive', { arrive: s.arrive }) : '',
    nights: s.nights, firstDay: s.firstDay, lastDay: s.lastDay,
  }));
  return [
    f('intro'),
    '',
    f('tripHeader'),
    f('party', { groupSize: p.context.groupSize }),
    dataBlock('TRIP', (stops.length ? stops : [f('noStops')]).join('\n'), p.nonce),
    '',
    f('rulesHeader'),
    f('onlyFacts'),
    f('bookings'),
    f('eur'),
    f('activities'),
    f('noPersonal'),
    f('language', { lang: langName }),
    f('noDashes'),
    f('untrusted'),
    f('documentsMarker'),
    p.text ? f('pasted', { pastedBlock: dataBlock('PASTED', p.text, p.nonce) }) : '',
    p.hasFiles ? f('files') : '',
  ].filter(Boolean).join('\n');
}
