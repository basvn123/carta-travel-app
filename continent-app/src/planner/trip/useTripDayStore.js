import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadAssignments, loadPrefs, loadTripExtras, persistPrefs, persistTripExtras, subscribeDayPlanStore,
} from '../dayPlanStore.js';
import { fetchDestPoiMap } from '../../lib/appData.js';
import { needsShard } from './dayNames.js';

/**
 * The trip's days as the day planner keeps them (T849): the places on each
 * day (assignments), the day settings (prefs: pace, the plan's own places,
 * T851's day paces) and the trip extras (T850's own ideas and day notes),
 * read from dayPlanStore under the trip's plan key and re-read whenever the
 * store changes (the day planner, the account sync). Towns whose full place
 * list is not on the wire are fetched once, so a day's places read back by
 * name (dayNames.js).
 *
 *   planKey   the trip's plan id, or the draft's
 *   dests     the stops' destinations
 */
export function useTripDayStore(planKey, dests = []) {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeDayPlanStore(({ planId }) => {
    if (planId === planKey) setVersion((v) => v + 1);
  }), [planKey]);
  const assignments = useMemo(() => loadAssignments(planKey), [planKey, version]); // eslint-disable-line react-hooks/exhaustive-deps -- re-read on a store change
  const prefs = useMemo(() => loadPrefs(planKey) || {}, [planKey, version]); // eslint-disable-line react-hooks/exhaustive-deps -- re-read on a store change
  const extras = useMemo(() => loadTripExtras(planKey), [planKey, version]); // eslint-disable-line react-hooks/exhaustive-deps -- re-read on a store change

  const [fetched, setFetched] = useState({});
  const want = [...new Set(dests.filter((d) => d && needsShard(d)).map((d) => d.id))].join(',');
  useEffect(() => {
    if (!want) return undefined;
    let alive = true;
    fetchDestPoiMap(want.split(',')).then((m) => { if (alive) setFetched((f) => ({ ...f, ...m })); }).catch(() => {});
    return () => { alive = false; };
  }, [want]);

  const savePrefs = useCallback((next) => persistPrefs(planKey, next), [planKey]);
  const saveExtras = useCallback((next) => persistTripExtras(planKey, next), [planKey]);
  return { assignments, prefs, extras, fetched, savePrefs, saveExtras };
}
