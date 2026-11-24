/**
 * daysPrefill.js, what the Plan your days screen opens with (G12 plan
 * rethink, lane L7, decision §12 "the question rule"). Mornings and pace
 * live in the travel style (`days`), so they are not asked again: they show
 * as chips, filled from the style and changeable for this trip. Detail, the
 * goal and food are not in the style, so they stay questions; the goal and
 * food open prefilled (the goal from the trip's likes, food from the style's
 * table), detail opens on the planner's default. Pure, so node tests hold it.
 */
import { RHYTHM } from './tripSettings.js';

// The trip's likes as the days' goals, so the screen opens filled in.
export const LIKE_GOAL = { beach: 'beach', islands: 'beach', hiking: 'nature', lakes: 'nature', cycling: 'nature', culture: 'sights', city: 'sights', food: 'food', nightlife: 'nightlife' };

/**
 * The food answer a style's table points to. The table says how often you
 * eat out, not what (decision §12: "partly"), so this is only a first pick:
 * mostly self-catering reads as cook, mostly quick bites as street food,
 * anything else as local places. Fine dining is never guessed.
 */
export function foodOfLifestyle(lifestyle) {
  if (!lifestyle || typeof lifestyle !== 'object') return '';
  const n = (k) => (Number.isFinite(Number(lifestyle[k])) ? Number(lifestyle[k]) : 0);
  if (n('self_catered_days_per_week') >= 4) return 'cook';
  if (n('fastfood_per_week') >= 3 && n('fastfood_per_week') >= n('dinners_per_week')) return 'street';
  return 'local';
}

/**
 * The screen's first values and where each came from.
 *   settings  normalized trip settings
 *   style     the trip's travel style (normalized) or null
 *   -> { goals, food, detail, pace, mornings, from: { pace, mornings, food, goals } }
 *      from[x]: 'style' (the style gave it), 'trip' (answered for this trip),
 *      'likes' (goals read from the likes) or '' (a default)
 */
export function daysPrefill(settings, style = null) {
  const r = settings?.rhythm || {};
  const src = settings?.sources || {};
  const answered = (id) => (settings?.answered || []).includes(id);
  const fromOf = (id) => (!answered(id) ? '' : src[id] === 'style' ? 'style' : 'trip');
  let goals = Array.isArray(r.goals) ? r.goals.filter((g) => RHYTHM.goals.includes(g)) : [];
  let goalsFrom = goals.length ? 'trip' : '';
  if (!goals.length) {
    const likes = settings?.guide?.likes || [];
    goals = [...new Set(likes.map((k) => LIKE_GOAL[k]).filter(Boolean))].slice(0, 3);
    goalsFrom = goals.length ? 'likes' : '';
    if (!goals.length) goals = ['sights', 'food'];
  }
  const styleFood = foodOfLifestyle(style?.lifestyle);
  const food = r.food && answered('r:food') ? r.food : (styleFood || r.food || 'local');
  return {
    goals,
    food,
    detail: r.detail || 'parts',
    pace: r.pace || 'balanced',
    mornings: r.mornings || 'onthego',
    from: {
      pace: r.pace ? fromOf('r:pace') : '',
      mornings: r.mornings ? fromOf('r:mornings') : '',
      food: r.food && answered('r:food') ? 'trip' : styleFood ? 'style' : '',
      goals: goalsFrom,
    },
  };
}
