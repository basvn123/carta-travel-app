import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Tile, TileGroup } from '../components/ui/index.js';
import {
  CompassIcon, BootIcon, BeachIcon, LakeIcon, MountainIcon, BikeIcon,
} from '../components/Icons.jsx';

/**
 * What Explore holds, as six kit tiles (T498, roadmap 1.3b A; replaces the
 * T496 row of link pills). Places is the catalogue Explore opens on (owner
 * T489-h); the five after it are the outdoor layers that used to be the
 * Destinations tab. Six is the most carta-design allows on a phone, so the
 * trip library is a row on Places, not a seventh tile (owner T484-e).
 *
 * Tab semantics (the six swap the view below in place, arrow keys move
 * between them); the one on screen in the selected tint with its tick.
 * Three across on a phone (the 2 x 3 grid), two across in the desktop side
 * panel.
 */
export const EXPLORE_TILES = [
  { key: 'places', labelKey: 'places.catPlaces', Icon: CompassIcon },
  { key: 'trails', labelKey: 'places.catTrails', Icon: BootIcon },
  { key: 'beaches', labelKey: 'places.catBeaches', Icon: BeachIcon },
  { key: 'lakes', labelKey: 'places.catLakes', Icon: LakeIcon },
  { key: 'mountains', labelKey: 'places.catMountains', Icon: MountainIcon },
  { key: 'cycling', labelKey: 'places.catCycling', Icon: BikeIcon },
];

export function ExploreCategories({ current, onPick, columns = 3, panelId, className = '' }) {
  const { t } = useI18n();
  return (
    <TileGroup kind="tabs" columns={columns} label={t('places.sideBrowse')}
      className={`xcats xrail-tiles ${className}`.trim()}>
      {EXPLORE_TILES.map(({ key, labelKey, Icon }) => (
        <Tile key={key} kind="tab" icon={<Icon size={20} />} selected={key === current}
          aria-controls={panelId} data-cat={key}
          onClick={() => { if (key !== current) onPick(key); }}>
          {t(labelKey)}
        </Tile>
      ))}
    </TileGroup>
  );
}
