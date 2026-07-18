/**
 * dayPlanStore.js, device-local storage for standalone day plans.
 *
 * Day plans work for guests (no account, no Supabase round-trip), so they live
 * in localStorage. Split out of DayPlannerTab so the Saved-trips panel can show
 * the same list as an overview.
 *
 * Plan shape (v2, multi-city):
 *   { id, label, startDate, stops: [{ destinationId, days }] }
 * Legacy v1 entries ({ id, label, destinationId, startDate, days }) are
 * migrated on read.
 */

const STANDALONE_KEY = 'carta.dayplans.v1';

// The Day planner can plan days for the Trip planner's UNSAVED draft too; its
// picks live under this well-known plan id until the trip is saved, at which
// point useTripPlanner re-keys them to the real Supabase plan id.
export const TRIP_DRAFT_PLAN_ID = 'tripdraft';

// Per-plan sidecar keys: the day-by-day activity picks and the shape-your-day
// answers, both keyed by plan id.
export function assignmentsKey(planId) {
  return `carta.dayplan.${planId}`;
}
export function prefsKey(planId) {
  return `carta.dayprefs.${planId}`;
}

function migrate(sp) {
  if (sp && !Array.isArray(sp.stops)) {
    return {
      id: sp.id,
      label: sp.label || '',
      startDate: sp.startDate,
      stops: [{ destinationId: sp.destinationId, days: Math.max(1, sp.days || 1) }],
    };
  }
  return sp;
}

export function loadStandalonePlans() {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(STANDALONE_KEY) || '[]');
    return Array.isArray(list) ? list.map(migrate).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function persistStandalonePlans(list) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STANDALONE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export function deleteStandalonePlan(id) {
  const next = loadStandalonePlans().filter((sp) => sp.id !== id);
  persistStandalonePlans(next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(assignmentsKey(id));
      window.localStorage.removeItem(prefsKey(id));
    } catch { /* ignore */ }
  }
  return next;
}

export function loadAssignments(planId) {
  if (!planId || typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(assignmentsKey(planId)) || '{}');
  } catch {
    return {};
  }
}
export function persistAssignments(planId, assignments) {
  if (!planId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(assignmentsKey(planId), JSON.stringify(assignments));
  } catch { /* ignore */ }
}

export function loadPrefs(planId) {
  if (!planId || typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(prefsKey(planId)) || 'null');
  } catch {
    return null;
  }
}
export function persistPrefs(planId, prefs) {
  if (!planId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(prefsKey(planId), JSON.stringify(prefs));
  } catch { /* ignore */ }
}
