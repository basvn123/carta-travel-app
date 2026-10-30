import {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import {
  firstPaintPromise, catalogue, CATALOGUE_MODE, loadFullCatalogue,
} from '../lib/appData.js';
import { withOriginRoutes, defaultOrigin, originHome } from '../lib/origins.js';
import { loadFlightFile, loadAirlines } from '../lib/flights/flightData.js';
import { homeAirports } from '../lib/airportReach.js';
import { addDays, todayISO } from '../lib/dates.js';
import { calendarDefaultWindow } from '../lib/firstRun.js';

// 'viewport' mode: the radius around the origin airport whose countries the
// first paint waits for. 300 km is the origin's own country and, near a
// border, its neighbours: Charleroi gets BE, NL, FR, DE and LU.
const FIRST_PAINT_KM = 300;



/** Fetches app_data.json, applies its data-driven defaults (group size,
 *  baggage, lifestyle, home/car/accommodation models, departure origin) into
 *  `choices` the first time it loads, rebuilds every destination's air routes
 *  for the chosen origin, sets the date-picker bounds, and defaults
 *  depart/return dates. URL/localStorage values (`init`) always win over the data's
 *  own defaults.
 *
 *  `origin` is the currently selected departure airport (choices.origin); the
 *  returned `data` is always priced from it. Until choices.origin is set (first
 *  paint), we fall back to the data's own default origin so the app never renders
 *  without routes.
 *
 *  T861: `airports` are the home airports the traveller ticked
 *  (choices.origins) and `fromPt` the town they leave from: each ticked
 *  airport's flight file is loaded into `data.flightsBy`, and
 *  `data.meta.home_airports` lists them with their drive, so the trip price
 *  can fly from the cheapest door to door.
 */
export function useAppData(init, setChoices, departDate, setDepartDate, returnDate, setReturnDate, origin, airports = null, fromPt = null) {
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
            // v18 (T534): Airbnb's fee constants travel as meta.stays.fees.
            accommodation_model: j.meta.stays?.fees ?? j.meta.accommodation_model ?? prev.accommodation_model,
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

  // Every destination's air routes rebuilt for the chosen origin. Re-derives
  // (and so reprices the whole app) whenever the origin changes.
  const routed = useMemo(() => (raw && effectiveOrigin
    ? withOriginRoutes(raw, effectiveOrigin)
    : null), [raw, effectiveOrigin]);

  // The home airport's flight prices (T517): the sweep's file, both
  // directions, plus the airline names and logos. `data.flights` is null
  // until it arrives (or when the airport has none yet); every price that
  // reads it reprices when it lands, the same way an origin change does.
  const [flights, setFlights] = useState({ origin: null, file: null });
  const [airlines, setAirlines] = useState(null);
  // T861: every ticked home airport's file, by IATA (null when it has none).
  const airportKey = Array.isArray(airports) ? airports.join('.') : '';
  const [extraFiles, setExtraFiles] = useState({});
  useEffect(() => {
    let alive = true;
    for (const code of airportKey ? airportKey.split('.') : []) {
      loadFlightFile(code).then((file) => {
        if (alive) setExtraFiles((prev) => (prev[code] === file ? prev : { ...prev, [code]: file }));
      });
    }
    return () => { alive = false; };
  }, [airportKey]);
  const fromLat = fromPt?.lat ?? null;
  const fromLon = fromPt?.lon ?? null;
  useEffect(() => {
    if (!effectiveOrigin) return undefined;
    let alive = true;
    loadFlightFile(effectiveOrigin).then((file) => { if (alive) setFlights({ origin: effectiveOrigin, file }); });
    return () => { alive = false; };
  }, [effectiveOrigin]);
  useEffect(() => {
    let alive = true;
    loadAirlines().then((a) => { if (alive) setAirlines(a); });
    return () => { alive = false; };
  }, []);
  const data = useMemo(() => {
    if (!routed) return null;
    const file = flights.origin === effectiveOrigin ? flights.file : null;
    const out = { ...routed, flights: file, airlines: airlines || {} };
    if (!airportKey) return out;
    const codes = airportKey.split('.');
    const pt = fromLat != null && fromLon != null ? { lat: fromLat, lon: fromLon } : null;
    const flightsBy = {};
    for (const code of codes) {
      const f = code === effectiveOrigin ? file : extraFiles[code];
      if (f) flightsBy[code] = f;
    }
    return { ...out, flightsBy, meta: { ...routed.meta, home_airports: homeAirports(routed.meta, pt, codes) } };
  }, [routed, flights, airlines, effectiveOrigin, airportKey, extraFiles, fromLat, fromLon]);

  // The date-picker bounds: tomorrow to a year out. Until T511 they came from
  // the fare window of the chosen origin's fare file (`__window`); with the
  // fares gone a plain calendar rule stands in. Keyed on `data` so the repair
  // effect below still re-runs on a data or origin change.
  const dateBounds = useMemo(() => {
    if (!data) return null;
    const today = todayISO();
    return { min: addDays(today, 1), max: addDays(today, 365) };
  }, [data]);

  const defaultNights = data?.meta?.defaults?.trip_length_days ?? 7;

  // The dates Carta picks for a visitor who has picked none (T099, from the
  // design approved in T362): the first Saturday at least four weeks out, for
  // the default trip length. `defaultDates` is how the first-run receipt
  // tells Carta's dates from the visitor's.
  const defaultDates = useMemo(() => calendarDefaultWindow(todayISO(), defaultNights), [defaultNights]);

  // Default depart/return when data first loads. A restored URL/stored date
  // wins - unless it is now in the past (before dateBounds.min, which is
  // tomorrow), in which case it is bumped forward to a valid day.
  useEffect(() => {
    if (!dateBounds || !data) return;

    // Repair a missing / past depart date.
    let start = departDate;
    if (!start || start < dateBounds.min) start = defaultDates.start;

    // Repair a missing / inverted return date.
    let end = returnDate;
    if (!end || end <= start) {
      end = start === defaultDates.start ? defaultDates.end : addDays(start, defaultNights);
      if (end <= start) end = addDays(start, defaultNights);
      if (end > dateBounds.max) end = dateBounds.max;
    }

    if (start !== departDate) setDepartDate(start);
    if (end !== returnDate) setReturnDate(end);
  }, [dateBounds]); // eslint-disable-line react-hooks/exhaustive-deps -- repairs on a data or origin change only: re-running on the dates would undo a deliberate pick

  return { data, error, dateBounds, needRecords, defaultDates };
}
