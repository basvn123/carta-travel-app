/*
 * The guided search data (T439, pipeline/guided_search_layer.py):
 * public/search/guided.json, about 70 KB gzipped. Per destination it holds
 * the named areas it sits in (a), the distance in km to the nearest rated
 * beach, notable lake and peak and trail end (nb), and vibe scores from 0 to
 * 100 (v). Facts the app computes itself (months, cost, car-free, crowding)
 * are not in it, so nothing here can disagree with a card.
 *
 * Loaded once, on idle or on first use, and cached for the session. Anything
 * that reads it must work without it: Explore's rails simply wait for it.
 */
import React from 'react';
import { dataUrl } from './dataHost.js';

let promise = null;

export function loadGuidedData() {
  if (!promise) {
    promise = fetch(dataUrl('/search/guided.json'))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return promise;
}

/** The data once it has arrived, else null. Starts the load when the
 *  browser is idle, so it never competes with the first paint. */
export function useGuidedData(enabled = true) {
  return useGuidedState(enabled).data;
}

/** The data and whether its load has ended (`done`, also when it failed and
 *  `data` stays null): Explore holds its footer until the rails are
 *  complete, and a missing file must not hold it for ever (G12, D10). */
export function useGuidedState(enabled = true) {
  const [state, setState] = React.useState({ data: null, done: false });
  React.useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const start = () => loadGuidedData().then((d) => { if (live) setState({ data: d, done: true }); });
    const idle = typeof window !== 'undefined' && window.requestIdleCallback;
    const handle = idle ? idle(start, { timeout: 2500 }) : setTimeout(start, 600);
    return () => {
      live = false;
      if (idle) window.cancelIdleCallback?.(handle); else clearTimeout(handle);
    };
  }, [enabled]);
  return state;
}

/** A destination's vibe score (0 when it has none or the data is absent). */
export function vibeOf(guided, id, vibe) {
  return guided?.d?.[id]?.v?.[vibe] || 0;
}
