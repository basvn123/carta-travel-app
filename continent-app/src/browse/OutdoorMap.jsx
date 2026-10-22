import React, { useLayoutEffect, useRef } from 'react';
import { LoadingBlock } from '../components/StateBlocks.jsx';

// The Explore map, reused (T498, owner answer T489-c): its own lazy chunk,
// so an outdoor list costs nothing until the traveller asks for the map.
const ExploreMap = React.lazy(
  () => import('./ExploreMap.jsx').then((m) => ({ default: m.ExploreMap })),
);

const noop = () => {};

/**
 * An outdoor layer on the map, List | Map like Places (roadmap 1.3b, owner
 * T489-c). The rows come in already shaped for the Explore map
 * (lib/exploreLayers.js mapRowOf): an ink dot per item by its Score, the
 * best in view labelled with the name and the nearest town's day figure,
 * the camera fitted to the list. A tap hands the id back. Trails and
 * cycling pass `lines` (T593): each route drawn as its simplified line with
 * a length pill at its start in place of the dot. The frame wears
 * the Explore map's own rules (`explore-shell`), so the two maps are one.
 * `pinFig="score"` labels the pins with their Score (beaches, lakes,
 * mountains: a bed and food figure on a beach pin read as the beach's price).
 */
export function OutdoorMap({ rows, onSelect, onBack, t, lines = null, pinFig = 'eur' }) {
  // T600: the map fills what is left of the scroller under the head, so the
  // map view is the map and not a box with the page footer under it. The
  // scroller is the tab's own (.places-tab); the figure is written as a
  // custom property the CSS reads, with a floor there for a short window.
  const wrapRef = useRef(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const scroller = wrap?.closest('.places-tab');
    if (!wrap || !scroller) return undefined;
    const fit = () => {
      const top = wrap.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const gap = parseFloat(getComputedStyle(wrap).marginBottom) || 0;
      const h = Math.round(scroller.clientHeight - top - gap);
      wrap.style.setProperty('--dmap-h', `${Math.max(0, h)}px`);
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(scroller);
    // The head above can change height (a chip wraps, a note comes and goes).
    if (ro && wrap.parentElement) ro.observe(wrap.parentElement);
    window.addEventListener('resize', fit);
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  return (
    <div ref={wrapRef} className={`explore-shell dtab-mapwrap${lines ? ' has-lines' : ''}`}>
      <React.Suspense fallback={(
        <div className="xmap xmap-skel">
          <LoadingBlock label={t('explore.mapLoading')} rows={1} shape="card" />
        </div>
      )}>
        <ExploreMap rows={rows} all={rows} pins={null} onSelect={onSelect}
          onViewport={noop} onNeedDetail={noop} t={t} onBack={onBack}
          visible framed={rows.length > 0} lines={lines} pinFig={pinFig} />
      </React.Suspense>
    </div>
  );
}
