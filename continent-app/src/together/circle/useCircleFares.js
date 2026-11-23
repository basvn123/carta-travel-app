import { useEffect, useMemo, useState } from 'react';
import { loadFlightFile, loadSweptOrigins } from '../../lib/flights/flightData.js';
import { bestRoundTrip } from '../../browse/cartaFlight.js';
import { IS_FRIENDS_MOCK } from '../friendsMock.js';
import { airportsOf } from '../vrienden.js';

/**
 * Each member's return fare to the top proposals (G16, decision 0017), at
 * the kring's best window. Every member flies from their own home airport,
 * so their airport's swept flight file is loaded (the loader behind
 * data.flightsBy), lazily: only when `enabled` (the Vluchten and Gekozen
 * steps). The price is bestRoundTrip over the place's own airports. No
 * swept fare is null, drawn as "No price yet"; nothing is estimated.
 *
 * Under ?friendsmock the kring's fixture fares stand in, by airport.
 *
 * Returns { loading, rows: [{ id, fares: { [userId]: number | null } }] }.
 */
export function useCircleFares(circle, win, proposals, destinations, enabled) {
  const airports = useMemo(() => [...new Set((circle?.members || []).map((m) => m.homeAirport).filter(Boolean))].sort(), [circle]);
  const key = airports.join('.');
  const [files, setFiles] = useState({});
  useEffect(() => {
    if (!enabled || IS_FRIENDS_MOCK || !key) return undefined;
    let live = true;
    for (const code of key.split('.')) {
      loadFlightFile(code).then((f) => { if (live) setFiles((prev) => (prev[code] === f ? prev : { ...prev, [code]: f || null })); });
    }
    return () => { live = false; };
  }, [enabled, key]);
  return useMemo(() => {
    if (!enabled || !circle || !win) return { loading: false, rows: [] };
    const joined = circle.members.filter((m) => m.status === 'joined');
    const loading = !IS_FRIENDS_MOCK && airports.some((a) => !(a in files));
    const rows = (proposals || []).map((p) => {
      const fares = {};
      for (const m of joined) {
        if (!m.homeAirport) { fares[m.userId] = null; continue; }
        if (IS_FRIENDS_MOCK) {
          const v = circle.mockFares?.[p.id]?.[m.homeAirport];
          fares[m.userId] = v == null ? null : v;
          continue;
        }
        const codes = airportsOf(destinations?.[p.destId], p.destId);
        const rt = bestRoundTrip(files[m.homeAirport], codes, win.start, win.end, { paying: 1 });
        fares[m.userId] = rt && Number.isFinite(rt.total) ? Math.round(rt.total) : null;
      }
      return { id: p.id, fares };
    });
    return { loading, rows };
  }, [enabled, circle, win, proposals, destinations, files, airports]);
}

/** The swept home airports for the airport choice; a short list in the seam. */
export function useSweptAirports(enabled) {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!enabled || list) return undefined;
    if (IS_FRIENDS_MOCK) { setList(['AMS', 'BRU', 'CRL', 'EIN', 'LGG']); return undefined; }
    let live = true;
    loadSweptOrigins().then((o) => { if (live) setList(o ? Object.keys(o).sort() : []); });
    return () => { live = false; };
  }, [enabled, list]);
  return list || [];
}
