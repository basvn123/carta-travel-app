/**
 * The trip page's edit history (T835, owner decision D1 2026-10-29: every
 * change can be undone, with a six-second Undo message and lasting Undo and
 * Redo controls). Pure: the page hands in the trip's editable state before
 * and after a change, and this keeps the steps.
 *
 * A state is a plain object (the planner's editable fields plus the trip's
 * own settings), compared by value. A burst of the same change (a stepper
 * pressed five times, a name typed letter by letter) is one step, so one
 * Undo takes the whole burst back.
 */

export const HISTORY_CAP = 50;
export const COALESCE_MS = 900;
// One action that lands over two or three renders (a chip saves the planner
// and the trip settings) is one step whatever each render changed.
export const SAME_ACTION_MS = 150;

export function emptyHistory() {
  return { past: [], future: [], last: null };
}

export function sameState(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

const ids = (s) => (Array.isArray(s?.stops) ? s.stops.map((x) => x.destinationId) : []);

/**
 * What changed between two states, as { kind, key, id? }: the kind names the
 * message, the key decides which changes fold into one step (the nights of
 * one stop fold together; the nights of two stops are two steps).
 */
export function describeChange(prev, next) {
  const a = ids(prev);
  const b = ids(next);
  if (b.length < a.length) {
    const gone = a.find((id, i) => b[i] !== id) ?? a[a.length - 1];
    return { kind: 'stopRemoved', key: `stopRemoved:${gone}`, id: gone };
  }
  if (b.length > a.length) {
    const added = b.find((id, i) => a[i] !== id) ?? b[b.length - 1];
    return { kind: 'stopAdded', key: `stopAdded:${added}`, id: added };
  }
  if (a.length && a.join('|') !== b.join('|')) {
    return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
      ? { kind: 'stopsMoved', key: 'stopsMoved' }
      : { kind: 'stopSwapped', key: 'stopSwapped', id: b.find((id) => !a.includes(id)) };
  }
  const nightsAt = (prev?.stops || []).findIndex((s, i) => (next?.stops?.[i]?.nights ?? s.nights) !== s.nights);
  const nightsChanged = nightsAt >= 0;
  const datesChanged = prev?.tripStart !== next?.tripStart || prev?.tripEnd !== next?.tripEnd;
  if (nightsChanged && datesChanged) return { kind: 'balanced', key: 'balanced' };
  if (nightsChanged) {
    const id = prev.stops[nightsAt].destinationId;
    return { kind: 'nights', key: `nights:${id}`, id };
  }
  // The trip settings follow the planner a render later (a chip saves both),
  // so their own change carries the same key and folds into that step.
  if (datesChanged || !sameState(prev?.set?.when, next?.set?.when)) return { kind: 'dates', key: 'dates' };
  const p = (s) => [s?.groupSize, s?.children, s?.babies].join('|');
  if (p(prev) !== p(next) || !sameState(prev?.set?.party, next?.set?.party)) return { kind: 'people', key: 'people' };
  if (!sameState(prev?.set?.from, next?.set?.from)) return { kind: 'from', key: 'from' };
  if ((prev?.set?.name || '') !== (next?.set?.name || '')) return { kind: 'name', key: 'name' };
  return { kind: 'other', key: 'other' };
}

/**
 * The history after one change from `prev` to `next`. A change of the same
 * key within `coalesceMs` of the last one joins it: the step keeps the state
 * from before the burst, so Undo returns to where the burst began.
 */
export function record(h, prev, next, { now = Date.now(), coalesceMs = COALESCE_MS } = {}) {
  if (sameState(prev, next)) return h;
  const change = describeChange(prev, next);
  const since = h.last ? now - h.last.at : Infinity;
  const sameAction = h.past.length > 0 && since < SAME_ACTION_MS;
  const joins = sameAction || (h.past.length > 0 && h.last?.key === change.key && since < coalesceMs);
  if (joins) {
    // The step keeps the more telling name of the two ("Changed where you
    // leave from" over "Changed your trip").
    const named = sameAction && change.kind === 'other' ? h.last : change;
    return { ...h, future: [], last: { ...named, at: now, seq: h.last.seq } };
  }
  return {
    past: [...h.past, prev].slice(-HISTORY_CAP),
    future: [],
    last: { ...change, at: now, seq: (h.last?.seq || 0) + 1 },
  };
}

/** One step back: { history, state } with the state to restore, or null. */
export function undoStep(h, current) {
  if (!h.past.length) return null;
  return {
    history: { past: h.past.slice(0, -1), future: [current, ...h.future].slice(0, HISTORY_CAP), last: null },
    state: h.past[h.past.length - 1],
  };
}

/** One step forward again: { history, state }, or null. */
export function redoStep(h, current) {
  if (!h.future.length) return null;
  return {
    history: { past: [...h.past, current].slice(-HISTORY_CAP), future: h.future.slice(1), last: null },
    state: h.future[0],
  };
}
