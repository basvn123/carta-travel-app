import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  firstPaintPromise, catalogue, CATALOGUE_MODE, fetchFares, loadFullCatalogue,
} from '../lib/appData.js';
import { hydrateForOrigin, defaultOrigin, originHome } from '../lib/origins.js';
import { bestFareWindow, countBookableRoundTrips } from '../lib/runtime_pricing.js';
import { addDays, todayISO } from '../lib/dates.js';
import { calendarDefaultWindow, windowFits } from '../lib/firstRun.js';

// 'viewport' mode: the radius around the origin airport whose countries the
// first paint waits for. 300 km is the origin's own country and, near a
// border, its neighbours: Charleroi gets BE, NL, FR, DE and LU.
const FIRST_PAINT_KM = 300;



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
    // 'all' mode: the download itself starts at module-eval time (see
    // lib/appData.js); here we only consume the shared promise. Since T271
    // that promise is the rank tier's lite catalogue (`partial: true`) when
    // there is one: the default screens paint from it, the shards are then
    // fetched once the page is idle, and `raw` is swapped for the full
    // catalogue exactly once, when the last shard is in. A screen that needs
    // one place's detail sooner asks for it through needRecords below.
    // 'viewport' mode (T059): the first paint waits for the countries around
    // the origin (and a place opened from a link) only; every later arrival,
    // from the Explore map's viewport or a screen asking for the rest,
    // replaces `raw` with the larger snapshot.
    let unsubscribe = null;
    let idleHandle = null;
    const firstPaint = CATALOGUE_MODE === 'all' ? firstPaintPromise.then((j) => {
      if (!j?.partial) return j;
      unsubscribe = catalogue.subscribe(() => {
        if (catalogue.isComplete()) setRaw((prev) => (!prev || prev.partial ? catalogue.snapshot() : prev));
      });
      // After the first paint, not before: the shards would otherwise
      // compete with the card photographs, which are the LCP element.
      const start = () => { loadFullCatalogue({ background: true }).catch(() => {}); };
      idleHandle = typeof requestIdleCallback === 'function'
        ? { idle: requestIdleCallback(start, { timeout: 2000 }) }
        : { timer: setTimeout(start, 200) };
      return j;
    }) : catalogue.boot().then((boot) => {
      const code = init.origin ?? defaultOrigin(boot);
      const home = originHome(boot, code);
      const first = [catalogue.ensureIds(init.selectedId ? [init.selectedId] : [])];
      first.push(home ? catalogue.ensureNear(home.lat, home.lon, FIRST_PAINT_KM) : catalogue.ensureAll());
      return Promise.all(first).then(() => {
        unsubscribe = catalogue.subscribe(() => setRaw(catalogue.snapshot()));
        return catalogue.snapshot();
      });
    });
    firstPaint
      .then((j) => {
        // Never step back from a full catalogue to the lite one it replaced.
        setRaw((prev) => (prev && !prev.partial ? prev : j));
        const def = j.meta?.defaults;
        const originDefault = init.origin ?? defaultOrigin(j);
        setChoices((prev) => {
          // URL/stored values (held in `init`) win over the data defaults.
          const baggageKey = init.baggage_key ?? def?.baggage ?? prev.baggage_key;
          const chosenOrigin = prev.origin ?? originDefault;
          return {
            ...prev,
            origin: chosenOrigin,
            // Two people unless the URL says otherwise (T100). The generated
            // meta.defaults.group_size is 7 and is deliberately not read here.
            group_size: init.group_size ?? prev.group_size,
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
    return () => {
      unsubscribe?.();
      if (idleHandle?.idle != null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle.idle);
      if (idleHandle?.timer != null) clearTimeout(idleHandle.timer);
    };
    // Once per mount: App passes its useState snapshot `init` and the
    // setChoices setter, both stable for the app's life.
  }, [init, setChoices]);

  // One or more places' full records, now (T271): the detail panel and any
  // screen that opens a place while the catalogue is still partial. The
  // snapshot then carries those records in full and the rest still lite.
  const needRecords = useCallback((ids) => catalogue.ensureIds(ids).then(() => {
    setRaw((prev) => (prev?.partial ? catalogue.snapshot() : prev));
  }), []);

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
    // sync-data.mjs precomputes this per origin (`__window` on the fare
    // slice), because deriving it here meant walking every destination x
    // every route x every fare date key - ~300K string comparisons on the
    // main thread, the moment the data parsed and before first paint. The
    // walk below remains for legacy datasets whose slices predate the field.
    const pre = faresSlices[effectiveOrigin]?.__window;
    let minOut = pre?.min_out ?? null;
    let maxRet = pre?.max_ret ?? null;
    if (!pre) {
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
    }
    if (!(minOut && maxRet)) return null;
    // Never expose a past date as bookable: floor the window at today. (Its
    // only consumers are the date-picker bounds and the default depart date,
    // so flooring here fixes both.) Guard against an all-past dataset that
    // would otherwise invert the bounds.
    const today = todayISO();
    const min = minOut > today ? minOut : (today <= maxRet ? today : maxRet);
    return { min, max: maxRet };
  }, [data, faresSlices, effectiveOrigin]);

  const defaultNights = data?.meta?.defaults?.trip_length_days ?? 7;

  // The date pair to open on. Ryanair flies specific weekdays, so fares are sparse
  // per date and the earliest date in the window, the old default, was bookable
  // for only a couple of destinations, leaving the map looking broken. Pick the
  // depart date that actually resolves the most round trips instead.
  // Only consider today-or-later depart dates, so the default never lands in
  // the past even when the fare data still holds earlier days.
  const defaultWindow = useMemo(() => {
    if (!data) return null;
    // Precomputed per origin at build time for the default trip length (see
    // sync-data.mjs). The client walk below stays for any other length and
    // for legacy slices without the field.
    const pre = faresSlices[effectiveOrigin]?.__window?.best_start_by_nights?.[defaultNights];
    if (pre) {
      const [start, count] = pre;
      // The stored best start can predate today on an ageing dataset; the
      // walk's `minStart` guard is what kept that off the screen.
      if (!dateBounds?.min || start >= dateBounds.min) {
        return { start, end: addDays(start, defaultNights), count };
      }
    }
    return bestFareWindow(data.destinations, defaultNights, dateBounds?.min);
  }, [data, defaultNights, dateBounds, faresSlices, effectiveOrigin]);

  // The dates Carta picks for a visitor who has picked none (T099, from the
  // design approved in T362): the first Saturday at least four weeks out, for
  // the default trip length, read off the calendar rather than the frozen
  // fare window. Carta prices no flights (T272), so the fare table has no
  // claim on the default any more. The fare window still bounds it: while the
  // stored fares end before that Saturday's week does, the old fare-derived
  // window stands in, and so it does when the calendar week books no round
  // trip at all (the snap below would undo it anyway), so the Destinations
  // tab's price chips never open on a week with nothing priced.
  // `defaultDates` is whichever pair was applied, which is how the first-run
  // receipt tells Carta's dates from the visitor's.
  const calendarWindow = useMemo(() => calendarDefaultWindow(todayISO(), defaultNights), [defaultNights]);
  const calendarFits = useMemo(() => {
    if (!windowFits(calendarWindow, dateBounds)) return false;
    if (!data || !(defaultWindow?.count > 0)) return true;
    return countBookableRoundTrips(data.destinations, calendarWindow.start, calendarWindow.end) > 0;
  }, [calendarWindow, dateBounds, data, defaultWindow]);
  const defaultDates = useMemo(() => (calendarFits || !defaultWindow
    ? calendarWindow
    : { start: defaultWindow.start, end: defaultWindow.end }), [calendarFits, calendarWindow, defaultWindow]);

  // Default depart/return when data first loads. A restored URL/stored date
  // wins - unless it is now in the past (before dateBounds.min, which is
  // floored at today), in which case it is bumped forward to a valid day.
  useEffect(() => {
    if (!dateBounds || !data) return;

    // Repair a missing / past depart date.
    let start = departDate;
    if (!start || start < dateBounds.min) {
      start = calendarFits
        ? calendarWindow.start
        : (defaultWindow?.start && defaultWindow.start >= dateBounds.min)
          ? defaultWindow.start
          : dateBounds.min;
    }

    // Repair a missing / inverted return date.
    let end = returnDate;
    if (!end || end <= start) {
      end = calendarFits && start === calendarWindow.start
        ? calendarWindow.end
        : (defaultWindow && start === defaultWindow.start)
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
  }, [dateBounds, defaultWindow]); // eslint-disable-line react-hooks/exhaustive-deps -- repairs on a data or origin change only: re-running on the dates would undo a deliberate off-calendar pick

  return { data, error, dateBounds, needRecords, defaultDates };
}
