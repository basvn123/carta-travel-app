/**
 * plan-day's prompt and response schema (T1140, ROADMAP E5). The text lives
 * in the prompt registry (prompts/plan-day/v<N>.md), bundled through
 * ../_shared/prompts.js; this file only decides which lines apply. Plain
 * JavaScript so the Node tests run the code that ships (as logic.mjs).
 * The day planner itself is index.ts; the system slot holds aiGuard's
 * systemRules.
 */
import { dataBlock } from '../_shared/aiGuard.mjs';
import { frag, planDay as P } from '../_shared/prompts.js';

/** @type {Record<string, string>} */
export const LANG_NAMES = {
  en: 'English', nl: 'Dutch', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
};

// Gemini structured output: the schema makes malformed JSON impossible and
// hallucinated keys unrepresentable. inCatalog=true stops carry an id from
// the candidate list; discoveries carry their own coordinates instead.
export const RESPONSE_SCHEMA = JSON.parse(frag(P, 'schema'));

const f = (name, vars) => frag(P, name, vars);
const paceStops = (pace) => (['relaxed', 'balanced', 'packed'].includes(pace) ? f(`pace.${pace}`) : f('pace.balanced'));
const pick = (group, value) => (P.f[`profile.${group}.${value}`] != null ? f(`profile.${group}.${value}`) : '');

/**
 * @param {{
 *   city: string, country: string, dateISO: string, month: number, groupSize: number,
 *   pace: string, vibe: string, avoidHills: boolean, freeText: string, lang: string,
 *   hasStay: boolean, candidates: { id: string, name: string, kind?: string, cat?: string, rating?: number|null, mustSee?: boolean, dwellMin?: number, lat: number, lon: number, desc?: string }[],
 *   wantEvents: boolean, refine: string, prevStops: string[],
 *   profile: Record<string, unknown> | null,
 *   mustInclude: { name: string, id: string | null, lat: number | null, lon: number | null, timeOfDay: string | null }[],
 *   days: number, nonce: string,
 * }} p
 * @returns {string}
 */
export function buildPrompt(p) {
  const langName = LANG_NAMES[p.lang] || 'English';
  const summer = p.month >= 6 && p.month <= 8;
  /** @type {Record<string, any>} */
  const pr = p.profile || {};
  const lines = [
    f('intro', { city: p.city, country: p.country, dateISO: p.dateISO }),
    '',
    f('candidatesHeader'),
    dataBlock('CANDIDATES', JSON.stringify(p.candidates.map((c) => ({
      id: c.id, name: c.name, kind: c.kind, cat: c.cat, rating: c.rating,
      mustSee: c.mustSee, dwellMin: c.dwellMin, lat: c.lat, lon: c.lon,
      ...(c.desc ? { desc: c.desc } : {}),
    }))), p.nonce),
    '',
    f('rulesHeader'),
    p.days > 1
      // T433: several days. The app cuts them by neighbourhood and orders and
      // times each one on routed footpaths, so the model only chooses.
      ? f('multiDay', { days: p.days, paceStops: paceStops(p.pace), totalStops: p.days * (p.pace === 'relaxed' ? 4 : p.pace === 'packed' ? 7 : 5) })
      : f('oneDay', { paceStops: paceStops(p.pace), startTime: pr.startTime || f('defaultStartTime') }),
    // The named stops are exempt, or two rules would contradict each other:
    // a traveller who named three places we do not hold would otherwise be
    // asking for a day the 80 percent rule forbids.
    // T433: catalogue places only. A place Carta has not checked has no
    // position it can route to safely, so the app never puts one on a walk.
    f('catalogueOnly'),
    f('sequence'),
    f('group', { groupSize: p.groupSize, largeGroup: p.groupSize >= 5 ? f('largeGroup') : '' }),
    summer ? f('summer') : '',
    p.avoidHills ? f('avoidHills') : '',
    p.hasStay ? f('hasStay') : '',
    // The chat planner's answer profile. Each line only appears when the
    // traveller actually answered it, so the prompt never argues with itself.
    ...(p.profile ? [
      // Walking is asked for in the traveller's own unit and in the one the
      // schedule enforces: they answered in steps, the router thinks in km.
      pr.steps
        ? f('profile.steps', { steps: pr.steps, km: pr.maxWalkKm || Math.round(Number(pr.steps) / 1350) })
        : (pr.maxWalkKm ? f('profile.maxWalkKm', { km: pr.maxWalkKm }) : ''),
      pr.avoidHills ? f('profile.avoidHills') : '',
      pr.transitOk ? f('profile.transitOk') : '',
      pick('companions', pr.companions),
      pick('known', pr.known),
      pick('window', pr.window),
      pick('food', pr.food),
      Array.isArray(pr.diet) && pr.diet.length ? f('profile.diet', { diet: pr.diet.join(', ') }) : '',
      pr.avoidCrowds ? f('profile.avoidCrowds') : '',
      pr.indoor ? f('profile.indoor') : '',
      pr.stepFree ? f('profile.stepFree') : '',
      pr.weather?.rain ? f('profile.rain') : '',
      pr.weather?.hot ? f('profile.hot') : '',
      Array.isArray(pr.moods) && pr.moods.length ? f('profile.moods', { moods: pr.moods.join(', ') }) : '',
    ] : []),
    // Places the traveller named by hand. This is the one instruction the
    // model may not trade away for a tidier route: dropping a stop somebody
    // asked for by name is the single failure that makes a plan worthless.
    p.mustInclude.length
      ? f('mustInclude', {
        stops: p.mustInclude.map((m) => {
          const when = m.timeOfDay ? f('mustInclude.when', { timeOfDay: m.timeOfDay }) : '';
          return m.id ? f('mustInclude.withId', { name: m.name, id: m.id, when }) : f('mustInclude.noId', { name: m.name, when });
        }).join('; '),
      })
      : '',
    p.freeText ? f('wish', { wishBlock: dataBlock('WISH', p.freeText, p.nonce) }) : '',
    // Events are the one thing the catalogue structurally cannot hold: it
    // stores permanent places, not what happens on a given Tuesday.
    p.wantEvents ? f('events', { city: p.city, when: p.dateISO || f('events.month', { month: p.month }) }) : '',
    // The refine loop: the traveller has seen a plan and asked for a change.
    p.refine
      ? f('refine', {
        previousBlock: dataBlock('PREVIOUS', p.prevStops.join(', ') || f('refine.none'), p.nonce),
        changeBlock: dataBlock('CHANGE', p.refine, p.nonce),
      })
      : '',
    f('language', { lang: langName }),
    f('noDashes'),
  ];
  return lines.filter(Boolean).join('\n');
}
