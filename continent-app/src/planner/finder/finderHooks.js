/**
 * The trip finder's engine run, as a hook (TF2, T797).
 *
 * useTripFinder(settings) runs lib/recommend for the Help me choose answers
 * and reports each stage as it really finishes, so the loader's checks tick
 * on work, never on a timer:
 *
 *   flights   the home airport's swept flight file and the five layer
 *             indexes have arrived (or are known to be missing)
 *   stays     the trips are built: every candidate priced by quoteTrip,
 *   food      its stay, food and getting around in their slots
 *   likes     the trips are ranked against the answers
 *
 * The engine is pure and memoised per answer set (trips.js), so coming back
 * to the screen with the same answers costs nothing. The trade-off levers
 * (T803) are not part of the answer set: moving one re-ranks the trips
 * already built (findTrips with `levers`), it never runs the loader again. Every input it reads
 * already exists in the app: the catalogue and the traveller's choices from
 * the first-run context, the country insights, the saved taste.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { useCountryInsights } from '../../hooks/useCountryInsights.js';
import { useTaste } from '../../browse/WhyItMatches.jsx';
import { loadFlightFile } from '../../lib/flights/flightData.js';
import { loadTrailsIndex } from '../../lib/trails.js';
import { loadBeachIndex } from '../../lib/beaches.js';
import { loadLakeIndex } from '../../lib/lakes.js';
import { loadMountainIndex } from '../../lib/mountains.js';
import { loadCyclingIndex } from '../../lib/cycling.js';
import { todayISO } from '../../lib/dates.js';
import { buildTrips } from '../../lib/recommend/trips.js';
import { flightRows, knowTrip } from '../../lib/recommend/doorTrips.js';
import { LEVERS, findTrips, rankTrips } from '../../lib/recommend/rank.js';
import { SLOT_ROWS } from '../../lib/recommend/slots.js';
import { PROFILES } from '../../lib/lifestyleProfiles.js';
import { flightRanking } from '../flow/tripSettings.js';
import { useTripSettings } from '../flow/flowHooks.js';
import { keptRecord } from '../../lib/recommend/kept.js';
import { keep, unkeep, useKept } from '../../lib/recommend/keptStore.js';
import { planOf } from './planOf.js';
import { firstPlace, tripName } from './finderText.js';

export const STAGES = ['flights', 'stays', 'food', 'likes'];

const NO_STAGES = Object.freeze({ flights: false, stays: false, food: false, likes: false });

/** The home airport the catalogue is priced from, as the engine's origin. */
export function originOf(data) {
  const code = data?.meta?.selected_origin || null;
  const rec = code ? data?.meta?.origins?.[code] : null;
  if (!code) return null;
  return { iata: code, lat: rec?.lat ?? null, lon: rec?.lon ?? null, name: rec?.city || code };
}

/** Layer indexes, each null when it fails: a missing layer is one less reason. */
function loadLayers() {
  const safe = (p) => Promise.resolve(p).catch(() => null);
  return Promise.all([loadTrailsIndex(), loadBeachIndex(), loadLakeIndex(), loadMountainIndex(), loadCyclingIndex()].map(safe))
    .then(([trails, beaches, lakes, mountains, cycling]) => ({ trails, beaches, lakes, mountains, cycling }));
}

/** The answers a run depends on: everything but the levers. */
export function answersOf(settings) {
  const guide = { ...settings.guide };
  delete guide.levers;
  return { ...settings, guide };
}

const sameLifestyle = (a, b) => !!a && !!b && Object.keys(b).every((k) => a[k] === b[k]);

/**
 * Where each lever starts (T803): the traveller's own answers and settings.
 *   flight  the setup's priority, through flightRanking (price, balanced,
 *           comfort) back to its lever value
 *   food    the Lifestyle, when it is one of the food slot's presets
 *   bases   the shape answer: only "one place" is one base, only moving
 *           shapes is several; both or none leaves the group unset
 */
export function startLevers(settings, lifestyle) {
  const rank = flightRanking(settings).sort;
  const flight = Object.keys(LEVERS.flight.values).find((k) => LEVERS.flight.values[k] === rank) || null;
  const foodRow = SLOT_ROWS.find((r) => r.id === 'food');
  const food = (foodRow?.options || []).find((o) => sameLifestyle(lifestyle, PROFILES[o.lifestyle]))?.id || null;
  const shapes = settings.guide.shapes || [];
  const bases = !shapes.length ? null
    : shapes.every((x) => LEVERS.bases.values.one.includes(x)) ? 'one'
      : shapes.every((x) => LEVERS.bases.values.several.includes(x)) ? 'several' : null;
  return { flight, food, bases };
}

/**
 * The levers as they stand: where they start, then each one the traveller
 * moved (settings.guide.levers, kept in the trip settings so a question
 * reopened and answered keeps them). setLever(group, value) stores one.
 */
export function useLevers(settings) {
  const firstRun = useFirstRun();
  const data = firstRun?.data || null;
  const lifestyle = firstRun?.choices?.lifestyle || data?.meta?.defaults?.lifestyle || null;
  const [, save] = useTripSettings();
  const moved = settings.guide.levers;
  const levers = useMemo(() => ({ ...startLevers(settings, lifestyle), ...(moved || {}) }), [settings, lifestyle, moved]);
  const setLever = useCallback((group, value) => {
    save({ ...settings, guide: { ...settings.guide, levers: { ...(moved || {}), [group]: value } } });
  }, [save, settings, moved]);
  return { levers, setLever };
}

/**
 * The record a heart keeps (T806): the card's name and photo as they read
 * now, the plan "Plan this trip" would hand over, and the flight looked up
 * in the same swept file the trip was priced with (kept.js).
 */
export function keepRecordOf(trip, { destinations, lang, origin = null, file = null }) {
  return keptRecord(trip, {
    name: tripName(trip, destinations, lang),
    image: firstPlace(trip, destinations)?.image?.url || null,
    origin,
    plan: planOf(trip),
    file,
  });
}

/**
 * The heart, for the card and the preview alike (T810, T811): whether a
 * trip is kept, and a toggle that keeps it (keepRecordOf) or lets it go.
 */
export function useKeepTrip({ destinations, lang, keepWith = null }) {
  const kept = useKept();
  const isKept = (id) => kept.some((r) => r.id === id);
  const toggle = (trip) => {
    if (isKept(trip.id)) unkeep(trip.id);
    else keep(keepRecordOf(trip, { destinations, lang, ...(keepWith || {}) }));
  };
  return { isKept, toggle };
}

/** Yield to the browser so a finished stage is painted before the next one runs. */
const nextFrame = () => new Promise((r) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(r, 0));
  else setTimeout(r, 0);
});

/**
 * The finder for one answer set.
 * Returns { stages, trips, error, input, data }: `trips` is null until
 * ranked, then the ranked list (possibly empty); `error` is set when the
 * engine threw.
 */
export function useTripFinder(settings) {
  const firstRun = useFirstRun();
  const data = firstRun?.data || null;
  const choices = firstRun?.choices || {};
  const countryInsights = useCountryInsights();
  const taste = useTaste();
  const [run, setRun] = useState({ key: null, stages: NO_STAGES, trips: null, error: null, input: null });
  const runId = useRef(0);

  const origin = useMemo(() => originOf(data), [data]);
  const lifestyle = choices.lifestyle || data?.meta?.defaults?.lifestyle || null;
  const stayTier = choices.stay_tier || null;
  // The answer set this run is for; a new one restarts the stages. The
  // levers are left out: they re-rank the built trips below.
  const answers = answersOf(settings);
  const key = useMemo(() => JSON.stringify([answers.guide, settings.when, settings.party, settings.priority, settings.places, origin?.iata, stayTier, lifestyle, taste]),
    [settings, origin, stayTier, lifestyle, taste]); // eslint-disable-line react-hooks/exhaustive-deps -- answers is settings without the levers
  const { levers } = useLevers(settings);
  const leverKey = JSON.stringify(levers);

  useEffect(() => {
    if (!data?.destinations || countryInsights == null) return undefined;
    const id = ++runId.current;
    const alive = () => runId.current === id;
    setRun({ key, stages: NO_STAGES, trips: null, error: null, input: null });
    (async () => {
      try {
        const [flights, layerIndexes] = await Promise.all([
          origin ? loadFlightFile(origin.iata).catch(() => null) : null,
          loadLayers(),
        ]);
        if (!alive()) return;
        const input = {
          data, countryInsights, layerIndexes, settings: answers, taste, origin, flights,
          lifestyle, stayTier, today: todayISO(),
        };
        setRun((r) => ({ ...r, input, stages: { ...r.stages, flights: true } }));
        await nextFrame();
        if (!alive()) return;
        const built = buildTrips(input);
        setRun((r) => ({ ...r, stages: { ...r.stages, stays: true, food: true } }));
        await nextFrame();
        if (!alive()) return;
        const trips = rankTrips(built, { settings: answers, taste, data });
        setRun((r) => ({ ...r, trips, stages: { ...r.stages, likes: true } }));
      } catch (error) {
        if (alive()) setRun((r) => ({ ...r, trips: [], error }));
      }
    })();
    return () => { runId.current += 1; };
  }, [key, data, countryInsights]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for the answers, origin, stay tier, Lifestyle and taste

  const fresh = run.key === key;
  // The levers re-rank the trips this run built (memoised, about a
  // millisecond for 24 trips): the list, every card, the receipt and the
  // compare table read these same trip objects.
  const levered = useMemo(
    () => (fresh && run.trips && run.trips.length && run.input ? findTrips(run.input, { levers }) : null),
    [fresh, run.trips, run.input, leverKey], // eslint-disable-line react-hooks/exhaustive-deps -- leverKey stands for the levers
  );
  return {
    stages: fresh ? run.stages : NO_STAGES,
    trips: fresh ? (levered || run.trips) : null,
    error: fresh ? run.error : null,
    input: fresh ? run.input : null,
    data,
    origin,
  };
}

/**
 * A door's own run (T864, T865): the same inputs the finder reads (the home
 * airport's swept file, the layer indexes, the catalogue, the choices),
 * then Find my flight first's rows (`kind` 'flight', lib/recommend
 * doorTrips flightRows) or I know where's one trip ('know', knowTrip).
 * Stages tick on real work: 'flights' when the files are in, 'priced' when
 * the trips are priced.
 *
 *   -> { stages: { flights, priced }, result (rows | trip | null), error, origin, data }
 */
export function useDoorRun(settings, kind) {
  const firstRun = useFirstRun();
  const data = firstRun?.data || null;
  const choices = firstRun?.choices || {};
  const countryInsights = useCountryInsights();
  const taste = useTaste();
  const origin = useMemo(() => originOf(data), [data]);
  const lifestyle = choices.lifestyle || data?.meta?.defaults?.lifestyle || null;
  const stayTier = choices.stay_tier || null;
  const [run, setRun] = useState({ key: null, stages: { flights: false, priced: false }, result: undefined, error: null });
  const key = JSON.stringify([kind, settings.guide, settings.when, settings.party, settings.priority, settings.places, origin?.iata,
    stayTier, lifestyle, (data?.meta?.home_airports || []).map((a) => a.iata), Object.keys(data?.flightsBy || {})]);
  useEffect(() => {
    if (!data?.destinations || countryInsights == null) return undefined;
    let alive = true;
    setRun({ key, stages: { flights: false, priced: false }, result: undefined, error: null });
    (async () => {
      try {
        const [flights, layerIndexes] = await Promise.all([
          origin ? loadFlightFile(origin.iata).catch(() => null) : null,
          loadLayers(),
        ]);
        if (!alive) return;
        setRun((r) => ({ ...r, stages: { ...r.stages, flights: true } }));
        await nextFrame();
        if (!alive) return;
        const input = { data, countryInsights, layerIndexes, settings: answersOf(settings), taste, origin, flights, lifestyle, stayTier, today: todayISO() };
        const result = kind === 'flight' ? flightRows(input) : knowTrip(input);
        setRun((r) => ({ ...r, result, stages: { flights: true, priced: true } }));
      } catch (error) {
        if (alive) setRun((r) => ({ ...r, result: null, error }));
      }
    })();
    return () => { alive = false; };
  }, [key, data, countryInsights]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for the answers, origin, choices and airports
  const fresh = run.key === key;
  return {
    stages: fresh ? run.stages : { flights: false, priced: false },
    result: fresh ? run.result : undefined,
    error: fresh ? run.error : null,
    origin,
    data,
  };
}

/**
 * The loader's clock: true once the trips exist and the loader has stood
 * at least `minMs` (so it can be read), or at once after a skip.
 */
export function useLoaderDone(ready, minMs = 1200) {
  const start = useRef(Date.now());
  const [skipped, setSkipped] = useState(false);
  const [aged, setAged] = useState(false);
  useEffect(() => {
    const left = minMs - (Date.now() - start.current);
    if (left <= 0) { setAged(true); return undefined; }
    const id = setTimeout(() => setAged(true), left);
    return () => clearTimeout(id);
  }, [minMs]);
  return { done: ready && (aged || skipped), skip: () => { if (ready) setSkipped(true); } };
}
