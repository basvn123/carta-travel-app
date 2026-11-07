import { useMemo } from 'react';
import { rankTrips } from '../../lib/trips.js';
import { norm, NEAR_MAX_ROWS } from './destTabConsts.js';
import { haversineKm } from '../../lib/trailCards.js';

export function useItineraryLayer({
  isItinCat, itinCountry, itinCountryRows, itinDays, itinPace, itinScale, itinTop, nearPlace, q,
}) {
  const itinRows = useMemo(() => {
    if (!isItinCat) return null;
    const source = itinCountry ? itinCountryRows : itinTop;
    if (!source) return null;
    let rows = rankTrips(source, {
      days: itinDays, pace: itinPace, scale: itinScale,
    });
    if (q) {
      rows = rows.filter((tr) => norm(tr.cities.map((c) => c.city).join(' ')).includes(q)
        || tr.cities.some((c) => norm(c.city).includes(q)));
    }
    if (nearPlace) {
      return rows
        .map((tr) => ({ tr, km: haversineKm(nearPlace.lat, nearPlace.lon, tr.lat, tr.lon) }))
        .filter((r) => Number.isFinite(r.km))
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    return rows.map((tr) => ({ tr, km: null }));
  }, [isItinCat, itinCountry, itinCountryRows, itinTop, itinDays, itinPace,
    itinScale, q, nearPlace]);

  // Which day counts can actually be answered here, so a length nobody
  // composed is greyed out rather than offered and returning nothing.
  const itinFacets = useMemo(() => {
    const pace = new Map();
    const scale = new Map();
    const source = itinCountry ? itinCountryRows : itinTop;
    for (const tr of source || []) {
      if (itinDays && !rankTrips([tr], { days: itinDays }).length) continue;
      pace.set(tr.pace, (pace.get(tr.pace) || 0) + 1);
      scale.set(tr.scale, (scale.get(tr.scale) || 0) + 1);
    }
    return { pace, scale };
  }, [itinCountry, itinCountryRows, itinTop, itinDays]);
  return { itinRows, itinFacets };
}
