import { useEffect, useState } from 'react';
import { fetchCountryInsights } from '../lib/appData.js';

/** Lazily loads /country_insights.json (cached module-wide) and returns
 *  { [countryName]: insightRecord } - or null while loading / {} on failure. */
export function useCountryInsights() {
  const [insights, setInsights] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchCountryInsights().then((j) => {
      if (alive) setInsights(j?.countries || j || {});
    });
    return () => { alive = false; };
  }, []);
  return insights;
}
