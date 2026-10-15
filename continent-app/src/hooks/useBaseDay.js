import { useEffect, useState } from 'react';
import { catalogue } from '../lib/appData.js';
import { computeCosts } from '../lib/costIndex.js';
import { isNational } from '../components/CostSummary.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';

/**
 * What a day near an outdoor place costs one person (T430, brief rule N3):
 * a bed and a day's food in the base town, at the traveller's Lifestyle, from
 * the same computeCosts row the Explore card, the pin and the destination
 * page print, so the four can never disagree. Null while the town loads or
 * when its data is too thin to price.
 *
 * Returns { dayEur, est } where `est` is true when the figure stands in for
 * an unmeasured town (the estimate mark).
 */
export function useBaseDay(destId) {
  const { choices } = useFirstRun() || {};
  const [row, setRow] = useState(null);
  const lifestyleKey = JSON.stringify([choices?.lifestyle, choices?.stay_tier, choices?.group_size]);
  useEffect(() => {
    let live = true;
    setRow(null);
    if (!destId) return undefined;
    catalogue.ensureIds([destId]).then(() => {
      if (!live) return;
      const dest = catalogue.snapshot()?.destinations?.[destId];
      if (!dest) return;
      const cost = computeCosts({ [destId]: dest }, choices).get(destId);
      if (cost && cost.dayEur != null) setRow({ dayEur: cost.dayEur, est: isNational(cost) });
    }).catch(() => {});
    return () => { live = false; };
    // choices is read through its three fields, which lifestyleKey carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destId, lifestyleKey]);
  return row;
}
