import { useEffect, useMemo, useState } from 'react';
import { appDataPromise } from '../lib/appData.js';
import { hydrateForOrigin, defaultOrigin, originHome } from '../lib/origins.js';

/** Fetches app_data.json, applies its data-driven defaults (group size,
 *  baggage, lifestyle, home/car/accommodation models, departure origin) into
 *  `choices` the first time it loads, rehydrates every destination's fares for
 *  the chosen origin, computes the fare-date bounds, and defaults depart/return
 *  dates from them. URL/localStorage values (`init`) always win over the data's
 *  own defaults.
 *
 *  `origin` is the currently selected departure airport (choices.origin); the
 *  returned `data` is always priced from it. Until choices.origin is set (first
 *  paint), we fall back to the data's own default origin so the app never renders
 *  with empty fares.
 */
export function useAppData(init, setChoices, departDate, setDepartDate, returnDate, setReturnDate, origin) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // The download itself starts at module-eval time (see lib/appData.js);
    // here we only consume the shared promise.
    appDataPromise
      .then((j) => {
        setRaw(j);
        const def = j.meta?.defaults;
        const originDefault = init.origin ?? defaultOrigin(j);
        setChoices((prev) => {
          // URL/stored values (held in `init`) win over the data defaults.
          const baggageKey = init.baggage_key ?? def?.baggage ?? prev.baggage_key;
          const chosenOrigin = prev.origin ?? originDefault;
          return {
            ...prev,
            origin: chosenOrigin,
            group_size: init.group_size ?? def?.group_size ?? prev.group_size,
            // Restored dates already drove trip_days (the sync effect in App
            // runs before this fetch resolves); overriding it with the data's
            // default here left "Nights" stuck on the configured default until
            // a date was touched.
            trip_days: (init.departDate && init.returnDate)
              ? prev.trip_days
              : (def?.trip_length_days ?? prev.trip_days),
            baggage_key: baggageKey,
            baggage_per_direction_eur:
              j.meta.baggage_options?.[baggageKey]?.per_direction_eur ?? prev.baggage_per_direction_eur,
            transport_mode: init.transport_mode ?? prev.transport_mode,
            lifestyle: { ...prev.lifestyle, ...(def?.lifestyle || {}), ...(init.lifestyle || {}) },
            accommodation_model: j.meta.accommodation_model ?? prev.accommodation_model,
            car_model: j.meta.car_model ?? prev.car_model,
            // Drive-comparison departs from the chosen origin airport (falls back
            // to the data's configured home when the origin has no coordinates).
            home: originHome(j, chosenOrigin) ?? j.meta.home ?? prev.home,
          };
        });
      })
      .catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The effective origin: the user's choice once known, else the data's default.
  const effectiveOrigin = origin || (raw ? defaultOrigin(raw) : null);

  // Every destination's fares rebuilt for the chosen origin. Re-derives (and so
  // reprices the whole app) whenever the origin changes.
  const data = useMemo(
    () => (raw && effectiveOrigin ? hydrateForOrigin(raw, effectiveOrigin) : null),
    [raw, effectiveOrigin],
  );

  // Earliest outbound + latest return date found in any destination's (hydrated)
  // routes - i.e. the fare window reachable from the chosen origin.
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
