import { useEffect, useMemo, useRef, useState } from 'react';
import { appDataPromise, fetchFares } from '../lib/appData.js';
import { hydrateForOrigin, defaultOrigin, originHome } from '../lib/origins.js';
import { bestFareWindow, countBookableRoundTrips } from '../lib/runtime_pricing.js';

// ISO date string, `days` later.
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Today's local date as ISO 'YYYY-MM-DD'.
function todayISO() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

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

  // Since the wire split (scripts/sync-data.mjs) the fares table isn't in
  // app_data.json any more: each origin's slice lives at /fares/{IATA}.json
  // (~tens of KB) and is fetched when that origin is first used. Legacy
  // datasets that still ship an inline data.fares table skip the fetch.
  const [faresSlices, setFaresSlices] = useState({}); // origin -> { anchor: rec }
  useEffect(() => {
    if (!raw || raw.fares || !effectiveOrigin || faresSlices[effectiveOrigin]) return undefined;
    let cancelled = false;
    fetchFares(effectiveOrigin).then((slice) => {
      if (cancelled) return;
      // A missing/failed slice degrades to "no fares from this origin" ({}),
      // the same shape an unserved origin has always had.
      setFaresSlices((prev) => (prev[effectiveOrigin] ? prev : { ...prev, [effectiveOrigin]: slice || {} }));
    });
    return () => { cancelled = true; };
  }, [raw, effectiveOrigin, faresSlices]);

  // Every destination's fares rebuilt for the chosen origin. Re-derives (and so
  // reprices the whole app) whenever the origin changes.
  const hydrated = useMemo(() => {
    if (!raw || !effectiveOrigin) return null;
    if (raw.fares) return hydrateForOrigin(raw, effectiveOrigin);
    const slice = faresSlices[effectiveOrigin];
    return slice ? hydrateForOrigin(raw, effectiveOrigin, slice) : null;
  }, [raw, effectiveOrigin, faresSlices]);

  // While a newly-picked origin's slice downloads, keep showing the previous
  // origin's data instead of dropping the whole app back to the loading screen.
  const lastDataRef = useRef(null);
  if (hydrated) lastDataRef.current = hydrated;
  const data = hydrated || lastDataRef.current;

  // Earliest outbound + latest return date found in any destination's (hydrated)
  // routes, i.e. the fare window reachable from the chosen origin.
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
    if (!(minOut && maxRet)) return null;
    // Never expose a past date as bookable: floor the window at today. (Its
    // only consumers are the date-picker bounds and the default depart date,
    // so flooring here fixes both.) Guard against an all-past dataset that
    // would otherwise invert the bounds.
    const today = todayISO();
    const min = minOut > today ? minOut : (today <= maxRet ? today : maxRet);
    return { min, max: maxRet };
  }, [data]);

  const defaultNights = data?.meta?.defaults?.trip_length_days ?? 7;

  // The date pair to open on. Ryanair flies specific weekdays, so fares are sparse
  // per date and the earliest date in the window, the old default, was bookable
  // for only a couple of destinations, leaving the map looking broken. Pick the
  // depart date that actually resolves the most round trips instead.
  // Only consider today-or-later depart dates, so the default never lands in
  // the past even when the fare data still holds earlier days.
  const defaultWindow = useMemo(
    () => (data ? bestFareWindow(data.destinations, defaultNights, dateBounds?.min) : null),
    [data, defaultNights, dateBounds],
  );

  // Default depart/return when data first loads. A restored URL/stored date
  // wins - unless it is now in the past (before dateBounds.min, which is
  // floored at today), in which case it is bumped forward to a valid day.
  useEffect(() => {
    if (!dateBounds || !data) return;

    // Repair a missing / past depart date.
    let start = departDate;
    if (!start || start < dateBounds.min) {
      start = (defaultWindow?.start && defaultWindow.start >= dateBounds.min)
        ? defaultWindow.start
        : dateBounds.min;
    }

    // Repair a missing / inverted return date.
    let end = returnDate;
    if (!end || end <= start) {
      end = (defaultWindow && start === defaultWindow.start)
        ? defaultWindow.end
        : addDays(start, defaultNights);
      if (end <= start) end = addDays(start, defaultNights);
      if (end > dateBounds.max) end = dateBounds.max;
    }

    // The pair now looks valid (future, well-ordered), but Ryanair flies
    // specific weekdays and a fares refresh can leave a restored pair landing
    // entirely off the fare calendar. Then nothing prices as a flight, every
    // destination silently falls back to a drive, and the map shows only dots
    // with no prices. When the chosen pair books zero round trips but a
    // populated window exists, snap to it so the map is never mysteriously
    // priceless. (This effect only re-runs on data / origin change, never on a
    // manual date pick, so a deliberate off-calendar choice is left alone.)
    if (defaultWindow?.count > 0
        && countBookableRoundTrips(data.destinations, start, end) === 0) {
      start = defaultWindow.start;
      end = defaultWindow.end;
    }

    if (start !== departDate) setDepartDate(start);
    if (end !== returnDate) setReturnDate(end);
  }, [dateBounds, defaultWindow]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, dateBounds };
}
