import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyHistory, record, undoStep, redoStep, sameState } from './editHistory.js';

/**
 * The trip page's Undo and Redo (T835). Watches the trip's editable state and
 * keeps a step for every change the traveller makes, from whichever control
 * made it (a chip, a stepper, a price typed in), so no control needs to know
 * about Undo.
 *
 *   state      the editable state, a plain object (compared by value)
 *   restore    puts a state back (the planner's fields and the trip settings)
 *   enabled    false while the trip is loading or being built in the wizard;
 *              changes then are not the traveller's edits and leave no step
 *   resetKey   which trip this is; a new key starts an empty history
 *
 * Returns { canUndo, canRedo, undo, redo, last } where `last` is the newest
 * step's change ({ kind, id?, seq, at }) for the Undo message, null after an
 * Undo or Redo.
 */
export function useEditHistory({ state, restore, enabled, resetKey }) {
  const [history, setHistory] = useState(emptyHistory);
  const prevRef = useRef(state);
  const keyRef = useRef(resetKey);
  const enabledRef = useRef(enabled);
  // The state an Undo or Redo is putting back: when it arrives it is not a
  // new change.
  const restoringRef = useRef(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  const stateKey = JSON.stringify(state ?? null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (keyRef.current !== resetKey || (enabled && !enabledRef.current)) {
      keyRef.current = resetKey;
      enabledRef.current = enabled;
      restoringRef.current = null;
      setHistory(emptyHistory());
      return;
    }
    enabledRef.current = enabled;
    if (!enabled) return;
    if (restoringRef.current) {
      if (sameState(restoringRef.current, state)) restoringRef.current = null;
      return;
    }
    setHistory((h) => record(h, prev, state));
  }, [stateKey, enabled, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the state is compared by value through stateKey

  const step = useCallback((fn) => {
    const r = fn(historyRef.current, prevRef.current);
    if (!r) return;
    restoringRef.current = r.state;
    setHistory(r.history);
    restore(r.state);
  }, [restore]);
  const undo = useCallback(() => step(undoStep), [step]);
  const redo = useCallback(() => step(redoStep), [step]);

  return {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
    last: history.last,
  };
}
