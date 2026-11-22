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
  // Only the lists are kept here; their positions are read from them the
  // first time a re-price needs them (round 6: not in the tap that opens
  // Settings).
  if (frozen && !snap) {
    setSnap({ lists, order: null });
  } else if (!frozen && snap) {
    setSnap(null);
  }
  return useMemo(() => {
    // G12, D10 (round 6): while the lists are the ones the snapshot was
    // taken from, their order is the snapshot's: the same objects come back,
    // so opening Settings redraws no rail (it rebuilt every list, 0.1 s at
    // 4x CPU, and every rail with it).
    if (!frozen || !snap || snap.lists === lists) return lists;
    if (!snap.order) {
      snap.order = {};
      for (const [k, rows] of Object.entries(snap.lists)) snap.order[k] = new Map((rows || []).map((r, i) => [r.id, i]));
    }
    const out = {};
    for (const [k, rows] of Object.entries(lists)) out[k] = reorder(rows, snap.order[k]);
    return out;
  }, [frozen, snap, lists]);
}
