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
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const start = () => loadGuidedData().then((d) => { if (live) setData(d); });
    const idle = typeof window !== 'undefined' && window.requestIdleCallback;
    const handle = idle ? idle(start, { timeout: 2500 }) : setTimeout(start, 600);
    return () => {
      live = false;
      if (idle) window.cancelIdleCallback?.(handle); else clearTimeout(handle);
    };
  }, [enabled]);
  return data;
}

/** A destination's vibe score (0 when it has none or the data is absent). */
export function vibeOf(guided, id, vibe) {
  return guided?.d?.[id]?.v?.[vibe] || 0;
}
