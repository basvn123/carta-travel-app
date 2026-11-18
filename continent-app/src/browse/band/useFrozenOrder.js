import { useMemo, useState } from 'react';
import { reorder } from './frozenOrder.js';

/**
 * Holds the order of named lists while `frozen` is on (G12, decision.md
 * "Layout stability": the list order recomputes only when Settings closes,
 * so nothing jumps under the finger while prices change in place). On close
 * the lists come back in their own new order, once.
 *
 *   lists   { [name]: rows[] }  every row has an `id`
 */
export function useFrozenOrder(frozen, lists) {
  const [snap, setSnap] = useState(null);
  // Derived state, set during render: the snapshot is the order on screen
  // in the very render Settings opened, before any change reprices it.
  if (frozen && !snap) {
    const next = {};
    for (const [k, rows] of Object.entries(lists)) {
      next[k] = new Map((rows || []).map((r, i) => [r.id, i]));
    }
    setSnap(next);
  } else if (!frozen && snap) {
    setSnap(null);
  }
  return useMemo(() => {
    if (!frozen || !snap) return lists;
    const out = {};
    for (const [k, rows] of Object.entries(lists)) out[k] = reorder(rows, snap[k]);
    return out;
  }, [frozen, snap, lists]);
}
