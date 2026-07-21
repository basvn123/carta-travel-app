import { useEffect } from 'react';
import { persistState } from '../lib/urlState.js';

/**
 * Debounced mirror of the shareable view state into the URL + localStorage, so
 * the view is shareable and survives a reload. Runs only once `ready` (the data
 * has loaded) so half-initialized state never clobbers a shared link. Debounced
 * because Safari rate-limits history.replaceState (100 calls / 30s), and rapid
 * slider drags / favorite toggles could otherwise hit that ceiling.
 *
 * `snapshot` is the plain object of values to persist; the effect re-runs (and
 * reschedules the write) whenever any of those values changes.
 */
export function useUrlSync(ready, snapshot) {
  useEffect(() => {
    if (!ready) return undefined;
    const timer = setTimeout(() => persistState(snapshot), 300);
    return () => clearTimeout(timer);
    // Listing the snapshot's values (stable key order) preserves the exact
    // per-value dependency behaviour the inline effect had, without a 17-line
    // dependency array. eslint can't statically verify a spread dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...Object.values(snapshot)]);
}
