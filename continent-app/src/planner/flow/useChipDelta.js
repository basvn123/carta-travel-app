import { useEffect, useRef, useState } from 'react';
import { receiptDiff } from '../../lib/price/receiptDiff.js';

/**
 * The delta on a chip change (G12 plan rethink, lane L9, decision §3.3):
 * after Who, From, When or the style changes, the next price that arrives
 * is compared with the one before (receiptDiff), and the bar says what the
 * change did, with Undo. Kept for the visit outside the component (like
 * the finder's ticks), because the found trip re-mounts while the finder
 * prices again.
 */
let PENDING = null;

/** The answers the bar's chips change: a change of any of them is a chip change. */
export const chipKey = (s) => JSON.stringify([s?.party ?? null, s?.from ?? null, s?.when ?? null, s?.style ?? '']);

/**
 *   settings   the trip settings the bar shows
 *   receipt    the price now (receiptOfTrip / receiptOfQuote) or null
 *   -> { diff, undo() , dismiss() }  diff null when there is nothing to say
 */
export function useChipDelta(settings, receipt, save) {
  const [shown, setShown] = useState(null);
  const last = useRef({ key: chipKey(settings), settings, receipt });
  const key = chipKey(settings);
  const receiptKey = JSON.stringify(receipt);
  useEffect(() => {
    const before = last.current;
    if (before.key !== key && !PENDING?.undoing) {
      // The chips changed: remember the price before, until a new one arrives.
      PENDING = { settings: before.settings, receipt: before.receipt, key };
    } else if (PENDING?.undoing && PENDING.key === key) {
      PENDING = null;
    }
    last.current = { key, settings, receipt };
    if (PENDING && PENDING.key === key && receipt && PENDING.receipt && JSON.stringify(PENDING.receipt) !== receiptKey) {
      const d = receiptDiff(PENDING.receipt, receipt);
      if (d && (!d.comparable || d.total !== 0)) setShown({ diff: d, settings: PENDING.settings, key });
      PENDING = null;
    }
  }, [key, receiptKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the keys stand for settings and receipt
  const live = shown && shown.key === key ? shown : null;
  return {
    diff: live?.diff || null,
    undo: () => {
      if (!live) return;
      PENDING = { undoing: true, key: chipKey(live.settings) };
      setShown(null);
      save(live.settings);
    },
    dismiss: () => setShown(null),
  };
}
