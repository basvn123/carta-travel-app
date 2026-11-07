import React from 'react';
import { prefetchMap, DETAIL_FROM } from './exploreMapLazy.js';
import { CATALOGUE_MODE, catalogue, loadFullCatalogue } from '../../lib/appData.js';
import { decodeBootIndex } from '../../lib/bootIndex.js';

export function useExploreMapView({ isActive }) {
  // C7: grid or map. The bbox narrows the count only WHILE the map is the
  // view - an invisible filter surviving the switch back would make the
  // grid quietly lie about what it holds.
  // The view rides the URL too (xw=map), so a map link opens on the map;
  // in the 'viewport' catalogue mode that is also what lets a map session
  // start without the grid's full download.
  const [view, setView] = React.useState(() => (
    typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('xw') === 'map' ? 'map' : 'grid'));
  const [bbox, setBbox] = React.useState(null);
  // T504 (roadmap 1.5): the place the traveller picked, on the map or by
  // opening it from the list. One id for both views, so List | Map keeps it
  // (rule 7): the pin is the one brown item on the map, the row the one row
  // with the brown edge. It rides the URL as xi=.
  const [pickedId, setPickedId] = React.useState(() => (
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('xi') || null : null));
  // The phone's map drawer (T500's MapDrawer): strip, half or full.
  const [drawer, setDrawer] = React.useState('strip');
  // The map mounts on its first open and stays (T441).
  const [mapOpened, setMapOpened] = React.useState(view === 'map');
  React.useEffect(() => { if (view === 'map') setMapOpened(true); }, [view]);
  React.useEffect(() => {
    if (!isActive) return undefined;
    const idle = window.requestIdleCallback;
    const h = idle ? idle(prefetchMap, { timeout: 4000 }) : setTimeout(prefetchMap, 2500);
    return () => { if (idle) window.cancelIdleCallback?.(h); else clearTimeout(h); };
  }, [isActive]);
  // 'viewport' catalogue mode (T059, lib/catalogue.js). The grid ranks the
  // whole of Europe, so it asks for every country. The map draws every pin
  // from the boot index and fetches the countries it has on screen once the
  // reader zooms in past the clusters; the list beside it counts what the
  // viewport holds, which is exactly what has been fetched.
  const viewportMode = CATALOGUE_MODE === 'viewport';
  const [pins, setPins] = React.useState(null);
  React.useEffect(() => {
    if (!viewportMode || !isActive) return;
    if (view === 'map') {
      if (!pins) catalogue.boot().then((b) => setPins(decodeBootIndex(b))).catch(() => {});
    } else {
      loadFullCatalogue().catch(() => {});
    }
  }, [viewportMode, isActive, view, pins]);
  const onMapViewport = React.useCallback((b, zoom) => {
    setBbox(b);
    if (viewportMode && zoom >= DETAIL_FROM) catalogue.ensureViewport(b).catch(() => {});
  }, [viewportMode]);
  const onMapNeedDetail = React.useCallback((id) => {
    catalogue.ensureIds([id]).catch(() => {});
  }, []);
  return { view, setView, bbox, pickedId, setPickedId, drawer, setDrawer, mapOpened, viewportMode, pins, onMapViewport, onMapNeedDetail };
}
