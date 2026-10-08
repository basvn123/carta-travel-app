import React from 'react';
import { TRIP_KINDS } from '../lib/trip_kinds.js';
import { useI18n } from '../i18n/index.jsx';
import {
  SkylineIcon, BeachIcon, TreeIcon, MountainIcon, MuseumIcon,
  PalmIcon, MoonIcon, DiningIcon, HeartIcon,
} from '../components/Icons.jsx';

// One glyph per trip kind, same vocabulary as the filter sheet's Style chips.
const KIND_ICONS = {
  city: SkylineIcon,
  beach: BeachIcon,
  nature: TreeIcon,
  mountains: MountainIcon,
  cultural: MuseumIcon,
  island: PalmIcon,
  party: MoonIcon,
  food: DiningIcon,
  romantic: HeartIcon,
};

/**
 * The trip styles (city, beach, nature and six more), multi-select, writing
 * the same `tripKinds` state the catalogue hook filters on.
 *
 * V3 (T383): they used to be a strip of tiles of their own, above the filter
 * rail on desktop and at the top of the phone toolbar, outside the filter
 * state: no chip, no count on the Filters button, and "Clear all" left them
 * set. They are now the first group of the filter rail, drawn as the rail's
 * own toggles, so they reach the phone through the Filters sheet, make chips
 * like every other filter and reset with the rest. The selected state is the
 * rail toggle's (--ink-fill), never an accent.
 */
export function CategoryRail({ tripKinds, setTripKinds }) {
  const { t } = useI18n();
  const toggle = (key) => setTripKinds(
    tripKinds.includes(key) ? tripKinds.filter((k) => k !== key) : [...tripKinds, key]);
  return (
    <div className="xrail-toggles xrail-styles" role="group" aria-label={t('filter.tripType')}>
      {TRIP_KINDS.map((k) => {
        const Icon = KIND_ICONS[k.key];
        const on = tripKinds.includes(k.key);
        return (
          <button
            key={k.key}
            type="button"
            className={`xrail-toggle ${on ? 'on' : ''}`}
            onClick={() => toggle(k.key)}
            aria-pressed={on}
          >
            {Icon && <Icon size={14} className="xrail-style-icon" />}
            <span>{t(`kind.${k.key}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
