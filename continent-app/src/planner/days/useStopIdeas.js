/**
 * useStopIdeas.js (T672): the raw material of one stop's ideas, loaded once
 * per stop and kept while the overview is open: the published trails,
 * beaches, lakes, peaks and cycle routes of the stop's country within reach
 * of the town, and the town's dossier (things to do, festivals). Every list
 * is a rail row from dayExploreRails.js; a failed layer is an empty list, so
 * one missing file never blanks the overview.
 */
import { useEffect, useState } from 'react';
import { loadBeaches } from '../../lib/beaches.js';
import { loadLakes } from '../../lib/lakes.js';
import { loadTrails } from '../../lib/trails.js';
import { loadMountains } from '../../lib/mountains.js';
import { loadCycling } from '../../lib/cycling.js';
import { loadDossier } from '../../lib/dossier.js';
import { tripCentre } from '../../lib/trailCards.js';
import { waterRow, trailRow, peakRow, cycleRow } from '../dayExploreRails.js';

/** How far each kind of idea may be from the town, in km. */
export const REACH_KM = { trail: 30, water: 40, peak: 50, cycle: 40 };

const cache = new Map();

function loadFor(destId, cc, stay) {
  const key = `${destId}|${cc}`;
  if (cache.has(key)) return cache.get(key);
  const near = (km) => (r) => r && r.km != null && r.km <= km;
  const p = Promise.all([
    loadTrails(cc).catch(() => null),
    loadBeaches(cc).catch(() => null),
    loadLakes(cc).catch(() => null),
    loadMountains(cc).catch(() => null),
    loadCycling(cc).catch(() => null),
    loadDossier(destId).catch(() => null),
  ]).then(([trs, bs, ls, ms, cy, doss]) => ({
    trails: (trs || []).map((tr) => trailRow(tr, tripCentre(tr), stay)).filter(near(REACH_KM.trail)),
    water: [
      ...(bs || []).map((b) => waterRow(b, 'beach', stay)),
      ...(ls || []).map((l) => waterRow(l, 'lake', stay)),
    ].filter(near(REACH_KM.water)),
    peaks: (ms || []).map((m) => peakRow(m, stay)).filter(near(REACH_KM.peak)),
    cycling: (cy?.routes || []).map((r) => cycleRow(r, tripCentre(r), stay)).filter(near(REACH_KM.cycle)),
    dossier: doss || null,
  }));
  cache.set(key, p);
  // A failure is not cached: the next visit tries again.
  p.catch(() => cache.delete(key));
  return p;
}

/** { loading, trails, water, peaks, cycling, dossier } for one stop. */
export function useStopIdeas(destId, cc, stay) {
  const [state, setState] = useState({ loading: true });
  const lat = stay?.lat;
  const lon = stay?.lon;
  useEffect(() => {
    if (!destId || !cc || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setState({ loading: false, trails: [], water: [], peaks: [], cycling: [], dossier: null });
      return undefined;
    }
    let live = true;
    setState({ loading: true });
    loadFor(destId, cc, { lat, lon }).then(
      (r) => { if (live) setState({ loading: false, ...r }); },
      () => { if (live) setState({ loading: false, trails: [], water: [], peaks: [], cycling: [], dossier: null }); },
    );
    return () => { live = false; };
  }, [destId, cc, lat, lon]);
  return state;
}
