/**
 * tripDraftStore.js - device-local persistence for the Trip planner's
 * in-progress (unsaved) draft.
 *
 * The draft survives tab switches and reloads, so hopping to the Day planner
 * and back never wipes a trip mid-planning. Once a trip has been SAVED to the
 * account it lives under Saved trips; the stored draft then carries its planId
 * and is dropped (not restored) on the next visit, so the planner opens clean.
 *
 * Draft shape: { tripStart, tripEnd, stops:[{destinationId, nights, activities}],
 *   groupSize, transportPref, legModes, pace, anchorId, planId, planLabel, planned }
 */

const DRAFT_KEY = 'carta.tripDraft.v1';

/** The draft to RESTORE into the planner: null when absent, corrupt, or
 *  already saved to the account (those open clean). */
export function loadRestorableDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    if (!d || !Array.isArray(d.stops)) return null;
    if (d.planId) { window.localStorage.removeItem(DRAFT_KEY); return null; }
    return d;
  } catch {
    return null;
  }
}

/** The raw stored draft (saved-or-not), for consumers like the Day planner's
 *  "plan a day of this trip" handoff. Null when there's nothing usable. */
export function loadTripDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    return d && Array.isArray(d.stops) && d.stops.length ? d : null;
  } catch {
    return null;
  }
}

export function persistTripDraft(draft) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* private mode */ }
}

export function clearTripDraft() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ }
}
