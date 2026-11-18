/**
 * The Style Studio wizard as data (G12, decision.md "View 2"): the ten steps
 * in their two parts, and the draft rules the screens share. Plain JS, so
 * the node tests hold the rules without a DOM.
 */

import { STUDIO_STEPS } from '../../lib/travelStyles.js';

/** The ten steps in order (the store's own list, so a door's step and the
 *  wizard agree): four for how you stay, six for how you explore. */
export const STEPS = STUDIO_STEPS;
export const STAY_STEPS = STEPS.slice(0, 4);
export const EXPLORE_STEPS = STEPS.slice(4);

/** Which part a step belongs to, and where it stands in that part (1 based). */
export function stepPlace(step) {
  const stay = STAY_STEPS.indexOf(step);
  if (stay >= 0) return { part: 'stay', n: stay + 1, of: STAY_STEPS.length };
  return { part: 'explore', n: EXPLORE_STEPS.indexOf(step) + 1, of: EXPLORE_STEPS.length };
}

/** The draft fields each step writes, so a template fills only the steps the
 *  traveller has not answered yet. */
const FIELDS = {
  spend: (d, tp) => ({ ...d, stay: tp.stay, lifestyle: { ...tp.lifestyle } }),
  way: (d, tp) => ({ ...d, way: tp.way, ways: [...(tp.ways || [])] }),
  priority: (d, tp) => ({ ...d, priority: tp.priority, tradeoffs: { ...(tp.tradeoffs || {}) } }),
  shapes: (d, tp) => ({ ...d, explore: { ...d.explore, shapes: [...tp.explore.shapes] } }),
  likes: (d, tp) => ({ ...d, explore: { ...d.explore, likes: [...tp.explore.likes] } }),
  avoid: (d, tp) => ({ ...d, explore: { ...d.explore, avoid: [...tp.explore.avoid] } }),
  place: (d, tp) => ({ ...d, explore: { ...d.explore, size: tp.explore.size, quiet: tp.explore.quiet } }),
  around: (d, tp) => ({ ...d, explore: { ...d.explore, around: tp.explore.around } }),
  days: (d, tp) => ({ ...d, days: { ...tp.days } }),
};

/**
 * Who's coming, picked in step 1: the template of that kind sets who comes
 * and the name it falls back to, and fills every later step the traveller
 * has not touched (`touched`, a Set of step ids). A touched answer is never
 * overwritten. The likes are the traveller's own: a template with none
 * keeps what the draft has.
 */
export function applyTemplate(draft, tpl, touched) {
  if (!tpl) return draft;
  let d = { ...draft, who: { ...tpl.who }, nameKey: tpl.nameKey || draft.nameKey, template: tpl.template || draft.template, tone: tpl.tone || draft.tone };
  for (const [step, fill] of Object.entries(FIELDS)) {
    if (touched.has(step)) continue;
    if (step === 'likes' && !tpl.explore.likes.length) continue;
    d = fill(d, tpl);
  }
  return d;
}

/** The ways there, multi: the first picked is the main one (`way`, what
 *  Explore prices); removing the main one hands it to the next pick, and
 *  none picked is 'any' (Explore picks the best way for each place). */
export function toggleWay(draft, mode) {
  const ways = draft.ways || [];
  const next = ways.includes(mode) ? ways.filter((w) => w !== mode) : [...ways, mode];
  const way = next.includes(draft.way) ? draft.way : (next[0] || 'any');
  return { ...draft, ways: next, way };
}

/** A multi pick with an optional cap: off when on, on while there is room. */
export function togglePick(list, value, max = Infinity) {
  if (list.includes(value)) return list.filter((v) => v !== value);
  return list.length >= max ? list : [...list, value];
}

/** The draft as it is saved: an empty name falls back to the name of its
 *  who's template ("The two of us"), never a nameless "My style". */
export function draftToSave(draft) {
  if (draft.name?.trim() || draft.nameKey) return draft;
  return { ...draft, nameKey: `styles.t.${draft.who?.kind || 'couple'}` };
}

/** Whether the draft differs from where it started (the close asks first). */
export function draftChanged(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** The stay tiers that already are a hostel, where "sleep in a hostel" has
 *  nothing left to ask. */
export const HOSTEL_TIERS = ['dorm', 'private'];
