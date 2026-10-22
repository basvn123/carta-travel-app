import React from 'react';
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
 */
export function OutdoorMap({ rows, onSelect, onBack, t, lines = null }) {
  return (
    <div className={`explore-shell dtab-mapwrap${lines ? ' has-lines' : ''}`}>
      <React.Suspense fallback={(
        <div className="xmap xmap-skel">
          <LoadingBlock label={t('explore.mapLoading')} rows={1} shape="card" />
        </div>
      )}>
        <ExploreMap rows={rows} all={rows} pins={null} onSelect={onSelect}
          onViewport={noop} onNeedDetail={noop} t={t} onBack={onBack}
          visible framed={rows.length > 0} lines={lines} />
      </React.Suspense>
    </div>
  );
}
