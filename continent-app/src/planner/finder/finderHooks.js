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
 * to the screen with the same answers costs nothing. Every input it reads
 * already exists in the app: the catalogue and the traveller's choices from
 * the first-run context, the country insights, the saved taste.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { rankTrips } from '../../lib/recommend/rank.js';

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
  // The answer set this run is for; a new one restarts the stages.
  const key = useMemo(() => JSON.stringify([settings.guide, settings.when, settings.party, settings.priority, origin?.iata, stayTier, lifestyle, taste]),
    [settings, origin, stayTier, lifestyle, taste]);

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
          data, countryInsights, layerIndexes, settings, taste, origin, flights,
          lifestyle, stayTier, today: todayISO(),
        };
        setRun((r) => ({ ...r, input, stages: { ...r.stages, flights: true } }));
        await nextFrame();
        if (!alive()) return;
        const built = buildTrips(input);
        setRun((r) => ({ ...r, stages: { ...r.stages, stays: true, food: true } }));
        await nextFrame();
        if (!alive()) return;
        const trips = rankTrips(built, { settings, taste, data });
        setRun((r) => ({ ...r, trips, stages: { ...r.stages, likes: true } }));
      } catch (error) {
        if (alive()) setRun((r) => ({ ...r, trips: [], error }));
      }
    })();
    return () => { runId.current += 1; };
  }, [key, data, countryInsights]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for the answers, origin, stay tier, Lifestyle and taste

  const fresh = run.key === key;
  return {
    stages: fresh ? run.stages : NO_STAGES,
    trips: fresh ? run.trips : null,
    error: fresh ? run.error : null,
    input: fresh ? run.input : null,
    data,
    origin,
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
