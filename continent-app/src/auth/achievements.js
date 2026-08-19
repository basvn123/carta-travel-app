/**
 * achievements.js, the milestones the database has awarded this account.
 *
 * Nothing here decides whether a badge is earned. Every grant happens in SQL
 * at the moment the qualifying row is written (supabase/migrations/
 * 013_achievements.sql, which carries the reasoning and a self-check), so this
 * module only reads the ledger and describes the badges. A client that could
 * write its own badges would make them worthless, so it cannot: the table
 * takes no client writes at all.
 *
 * The registry below is ordered the way the badges are drawn, roughly the
 * order a new account meets them: first hello, first friend circle, first
 * shown plan, first opened link, first arrival you caused.
 */
import { supabase } from '../lib/supabaseClient.js';

/** Ids match the CHECK constraint in migration 013. `target` marks the one
 *  counted badge; its progress is drawn from the friend list the spoke has
 *  already fetched, never from an extra query. */
export const BADGES = [
  { id: 'icebreaker', nameKey: 'friends.badgeIcebreaker', howKey: 'friends.badgeIcebreakerHow' },
  { id: 'well_connected', nameKey: 'friends.badgeWellConnected', howKey: 'friends.badgeWellConnectedHow', target: 3 },
  { id: 'copilot', nameKey: 'friends.badgeCopilot', howKey: 'friends.badgeCopilotHow' },
  { id: 'local_guide', nameKey: 'friends.badgeLocalGuide', howKey: 'friends.badgeLocalGuideHow' },
  { id: 'catalyst', nameKey: 'friends.badgeCatalyst', howKey: 'friends.badgeCatalystHow' },
];

// ?badgemock verify seam, same precedent as ?savedmock and ?sharemock: a
// fixture stands in for the ledger so the badge row can be checked headlessly.
// 'none' is all locked, 'all' is everything earned, anything else is a
// realistic middle. Display only, never on unless typed.
const BADGE_MOCK = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('badgemock');

const MOCK_EARNED = {
  none: [],
  all: BADGES.map((b) => b.id),
  some: ['icebreaker', 'catalyst'],
};

/**
 * The earned badges as a Map of id to earned_at, or null when the ledger
 * cannot be read (signed out, or a project without migration 013). Null hides
 * the section entirely: a milestone row that cannot know what was earned
 * would show everything locked, which reads as losing your badges.
 */
export async function fetchAchievements(userId) {
  if (BADGE_MOCK) {
    const ids = MOCK_EARNED[BADGE_MOCK] || MOCK_EARNED.some;
    return new Map(ids.map((id) => [id, '2026-08-01T00:00:00Z']));
  }
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('user_achievements')
    .select('badge, earned_at')
    .eq('user_id', userId);
  if (error) {
    console.warn('[badges] could not read the ledger:', error.message || error);
    return null;
  }
  return new Map((data || []).map((r) => [r.badge, r.earned_at]));
}
