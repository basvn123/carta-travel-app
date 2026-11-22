import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../ui/index.js';
import { HouseIcon } from '../HouseIcons.jsx';
import '../../styles/89-dock.css';

/**
 * The phone's Map corner (G12, Explore top round 2; decision.md "Map"): a
 * 48 px paper disc in the bottom-right slot, the mirror of the style disc in
 * the bottom left. Both slots are fixed above the bottom nav and never move
 * on their own, so the traveller finds them in the same place on every
 * scroll (89-dock.css). It replaces the floating List | Map pill that sat on
 * See all and on price rows. A desktop chooses the view in the tab row
 * instead, so this renders nothing from 769 px (CSS) and the caller skips it
 * there. In the map view the drawer's own List button brings the list back,
 * so the caller hides the corner while the map shows.
 *
 *   <MapCorner onOpen={() => setView('map')} onPrefetch={prefetchMap} />
 */
export const MapCorner = React.memo(function MapCorner({ onOpen, onPrefetch }) {
  const { t } = useI18n();
  const label = t('explore.viewMap');
  return (
    <div className="corner-slot corner-slot--right corner-map">
      <Button
        variant="quiet"
        className="corner-btn corner-btn--map"
        aria-label={label}
        title={label}
        onClick={onOpen}
        // Reaching for the corner starts loading the map, as the pill did.
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
      >
        <HouseIcon.map size={24} />
      </Button>
    </div>
  );
});
