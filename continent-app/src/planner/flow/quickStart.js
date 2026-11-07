/**
 * quickStart.js (T1103, ROADMAP G12): the one-shot mark a new trip carries
 * from the Plan opening's short setup into the trip planner, so the planner
 * opens straight on the priced trips instead of its own start page and the
 * help-me-choose questions. Those questions stay, as a way to refine the
 * trips (TripFlow's refine card).
 *
 * peek reads without clearing (React may run an initialiser twice in
 * development); clear runs once the planner has mounted. Session storage
 * keeps the mark across the lazy chunk load; a blocked storage falls back to
 * this module's memory.
 */
const KEY = 'carta.plan.quickStart';
let memory = false;

function store() {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

export function markQuickStart() {
  memory = true;
  try { store()?.setItem(KEY, '1'); } catch { /* memory holds it */ }
}

export function peekQuickStart() {
  if (memory) return true;
  try { return store()?.getItem(KEY) === '1'; } catch { return false; }
}

export function clearQuickStart() {
  memory = false;
  try { store()?.removeItem(KEY); } catch { /* nothing to clear */ }
}
