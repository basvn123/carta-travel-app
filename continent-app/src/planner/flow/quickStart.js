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
let memory = '';

function store() {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

/**
 * G12 plan rethink (decision §12): the mark says where the planner opens.
 * 'ask' (the default now) opens on the first help-me-choose question the
 * style does not answer; 'trips' (the traveller pressed "Show the trips
 * now", or an older mark '1') opens on the priced trips.
 */
export const QUICK_MODES = Object.freeze(['ask', 'trips']);

export function markQuickStart(mode = 'trips') {
  memory = QUICK_MODES.includes(mode) ? mode : 'trips';
  try { store()?.setItem(KEY, memory); } catch { /* memory holds it */ }
}

/** The mark's mode, or '' with none ('1' from before G12 B3 reads as 'trips'). */
export function peekQuickMode() {
  if (memory) return memory;
  try {
    const v = store()?.getItem(KEY) || '';
    return v === '1' ? 'trips' : (QUICK_MODES.includes(v) ? v : '');
  } catch { return ''; }
}

export function peekQuickStart() {
  return Boolean(peekQuickMode());
}

export function clearQuickStart() {
  memory = '';
  try { store()?.removeItem(KEY); } catch { /* nothing to clear */ }
}
