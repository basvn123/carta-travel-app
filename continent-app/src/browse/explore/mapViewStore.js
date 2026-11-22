/*
 * Whether Explore's map view is on screen (G12, map view: decision.md
 * "Phone map view"). The band in the top bar (browse/band/ExploreBand.jsx)
 * lives outside the tab, and on a phone it turns into the floating search
 * and chip row while the map shows; this store is the line between them,
 * the way searchDockStore is for the search. It also puts `is-map-view` on
 * the root, so the corners and the shell can step aside in CSS
 * (86-map-view.css).
 */
import { useSyncExternalStore } from 'react';

let on = false;
const subs = new Set();

export function setMapViewOn(next) {
  const v = !!next;
  if (v === on) return;
  on = v;
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('is-map-view', v);
  subs.forEach((f) => f());
}

export function useMapViewOn() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => on,
    () => false,
  );
}
