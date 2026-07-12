import { useEffect, useMemo, useState } from 'react';

/** Fetches app_data.json, applies its data-driven defaults (group size,
 *  baggage, lifestyle, home/car/accommodation models) into `choices` the
 *  first time it loads, computes the fare-date bounds across every
 *  destination's routes, and defaults depart/return dates from them.
 *  URL/localStorage values (`init`) always win over the data's own defaults.
 */
export function useAppData(init, setChoices, departDate, setDepartDate, returnDate, setReturnDate) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/app_data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        setData(j);
        const def = j.meta?.defaults;
        if (def) {
          setChoices((prev) => {
            // URL/stored values (held in `init`) win over the data defaults.
            const baggageKey = init.baggage_key ?? def.baggage ?? prev.baggage_key;
            return {
              ...prev,
              group_size: init.group_size ?? def.group_size ?? prev.group_size,
              trip_days: def.trip_length_days ?? prev.trip_days,
              baggage_key: baggageKey,
              baggage_per_direction_eur:
                j.meta.baggage_options?.[baggageKey]?.per_direction_eur ?? prev.baggage_per_direction_eur,
              transport_mode: init.transport_mode ?? prev.transport_mode,
              lifestyle: { ...prev.lifestyle, ...(def.lifestyle || {}), ...(init.lifestyle || {}) },
              accommodation_model: j.meta.accommodation_model ?? prev.accommodation_model,
              car_model: j.meta.car_model ?? prev.car_model,
              home: j.meta.home ?? prev.home,
            };
          });
        }
      })
      .catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Earliest outbound + latest return date found in any destination's routes.
  const dateBounds = useMemo(() => {
    if (!data) return null;
    let minOut = null;
    let maxRet = null;
    for (const d of Object.values(data.destinations)) {
      const routes = d.routes || {};
      for (const r of Object.values(routes)) {
        for (const x of Object.keys(r.outbound_fare || {})) {
          if (minOut == null || x < minOut) minOut = x;
        }
        for (const x of Object.keys(r.return_fare || {})) {
          if (maxRet == null || x > maxRet) maxRet = x;
        }
      }
    }
    return minOut && maxRet ? { min: minOut, max: maxRet } : null;
  }, [data]);

  // Default depart/return when data first loads
  useEffect(() => {
    if (!dateBounds) return;
    if (!departDate) setDepartDate(dateBounds.min);
    if (!returnDate && dateBounds.min) {
      const d = new Date(dateBounds.min + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 7);
      const candidate = d.toISOString().slice(0, 10);
      setReturnDate(candidate <= dateBounds.max ? candidate : dateBounds.max);
    }
  }, [dateBounds]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, dateBounds };
}
