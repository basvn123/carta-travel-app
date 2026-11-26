/**
 * styleForAi.js, the active travel style as Ask Viantra and the plan-day Edge
 * Function receive it (G12, decision.md "AI"). Enum values and head counts
 * only: no name, no free text, nothing the traveller typed, so the request
 * carries no personal words and the server can check every value against
 * the same lists (STYLE_AI_ENUMS) and drop the rest.
 *
 * An unanswered field ('' or an empty list) is left out rather than sent
 * empty, so the prompt only ever says what the traveller actually chose.
 *
 * Plain JS with no React and no browser globals, so node tests can hold it.
 */
import {
  AROUND, AVOID, LIKES, MORNINGS, PACE, PRIORITIES, QUIET, SHAPES, SIZES, STAY_TIERS, WAYS, WAY_MODES, normalizeStyle,
} from './travelStyles.js';

/** The allowed values of each field, for the servers' own checks. */
export const STYLE_AI_ENUMS = Object.freeze({
  stay: STAY_TIERS,
  priority: PRIORITIES,
  ways: WAY_MODES,
  way: WAYS,
  likes: LIKES,
  avoid: AVOID,
  shapes: SHAPES,
  size: SIZES,
  quiet: QUIET,
  around: AROUND,
  mornings: MORNINGS,
  pace: PACE,
});

/** The style as `{ party, stay, priority, ways, way, likes, avoid, shapes,
 *  size, quiet, around, mornings, pace }`, or null with no style. */
export function styleForAi(style) {
  const s = normalizeStyle(style);
  if (!s) return null;
  const out = {
    party: { adults: s.who.adults, kids: s.who.kids, babies: s.who.babies },
    stay: s.stay,
    priority: s.priority,
  };
  const put = (k, v) => {
    if (Array.isArray(v) ? v.length : v) out[k] = Array.isArray(v) ? [...v] : v;
  };
  put('ways', s.ways);
  // 'any' says nothing a missing way does not.
  if (s.way !== 'any') out.way = s.way;
  put('likes', s.explore.likes);
  put('avoid', s.explore.avoid);
  put('shapes', s.explore.shapes);
  put('size', s.explore.size);
  put('quiet', s.explore.quiet);
  put('around', s.explore.around);
  put('mornings', s.days.mornings);
  put('pace', s.days.pace);
  return out;
}
