import React from 'react';

// The map is the ONE thing in this tab that pulls maplibre-gl (~930 KB raw),
// and the tab opens on the grid. Imported statically it was hoisted into the
// entry chunk, so every visitor paid for a library most never render - which
// also silently defeated the lazy() wrappers on TrailPage / CyclePage /
// DestMap / the planner tabs, since maplibre was already in the main bundle
// by the time they loaded. Loading it here on the first switch to map view
// takes it (and maplibre-gl.css) off the critical path.
export const loadExploreMap = () => import('../ExploreMap.jsx');

export const ExploreMap = React.lazy(
  () => loadExploreMap().then((m) => ({ default: m.ExploreMap })),
);

// The phone drawer's rows: the places on the map, best first, at most this
// many (the list view holds the rest).
export const DRAWER_MAX = 60;

// T441: fetch the map's code before it is asked for, when the browser is idle
// after the first paint and again the moment a pointer or focus reaches the
// Map switch, unless the reader saves data or sits on a slow line. The
// basemap's two hosts are warmed at the same moment (here, not in index.html,
// so a visit that never reaches Explore opens no connection to them).
const MAP_HOSTS = ['https://basemaps.cartocdn.com', 'https://tiles.basemaps.cartocdn.com'];

let mapPrefetched = false;

export function prefetchMap() {
  if (mapPrefetched) return;
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
  mapPrefetched = true;
  for (const href of MAP_HOSTS) {
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = href;
    l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }
  loadExploreMap().catch(() => { mapPrefetched = false; });
}

// 'viewport' catalogue mode (T059): the zoom from which the map fetches the
// countries on screen. Below it the map draws clusters, which the boot pins
// already count truly, so panning a continental view costs nothing.
export const DETAIL_FROM = 6;
