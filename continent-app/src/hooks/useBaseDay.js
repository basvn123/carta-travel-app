import { useEffect, useState } from 'react';
import { catalogue } from '../lib/appData.js';
import { priceDay, requestKey, DEFAULT_PRICE_REQUEST } from '../lib/price/index.js';
import { isNational } from '../components/CostSummary.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';

/**
 * What a day near an outdoor place costs one person (T430, brief rule N3):
 * a bed and a day's food in the base town, at the traveller's Lifestyle.
 * Null while the town loads or when its data is too thin to price.
 *
 * T664 (F2): the price comes from the engine with the app's one price
 * request (lib/price/), so the place page carries the traveller's dates,
 * party (children too) and the country repair, and reads the same cents as
 * the Explore card and the destination page. The app's map row is used
 * when the town is in it; otherwise the town's own record is priced with
 * the same request against the whole catalogue.
 *
 * Returns { dayEur, est, cost } where `est` is true when the figure stands
 * in for an unmeasured town (the estimate mark) and `cost` the engine row.
 */
export function useBaseDay(destId) {
  const ctx = useFirstRun() || {};
  const request = ctx.priceRequest || DEFAULT_PRICE_REQUEST;
  const mapped = destId ? ctx.indices?.get?.(destId) || null : null;
  const [row, setRow] = useState(null);
  const key = requestKey(request);
  useEffect(() => {
    let live = true;
    setRow(null);
    if (!destId || mapped) return undefined;
    catalogue.ensureIds([destId]).then(() => {
      if (!live) return;
      const all = catalogue.snapshot()?.destinations;
      const cost = priceDay(all?.[destId], request, all);
      if (cost && cost.dayEur != null) setRow(cost);
    }).catch(() => {});
    return () => { live = false; };
    // The request is read through its key, which carries every field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destId, key, !!mapped]);
  const cost = mapped || row;
  return cost && cost.dayEur != null ? { dayEur: cost.dayEur, est: isNational(cost), cost } : null;
}
