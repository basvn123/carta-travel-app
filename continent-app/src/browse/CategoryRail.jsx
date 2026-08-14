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
 * The trip-kind categories as a horizontally scrollable chip rail directly
 * under the header, on the Map tab only. The same multi-select state the
 * filter tray/sheet edits (tripKinds), surfaced where a first-time visitor
 * can see it: wanting "a beach" or "mountains" is the most common way into
 * the catalogue, and it used to take two taps into a closed tray to say so.
 */
export function CategoryRail({ tripKinds, setTripKinds }) {
  const { t } = useI18n();
  const scrollRef = React.useRef(null);

  const toggle = (key) => setTripKinds(
    tripKinds.includes(key) ? tripKinds.filter((k) => k !== key) : [...tripKinds, key]);

  // Keep an active chip visible: if a restored URL pre-selects a kind that
  // sits off the right edge on a phone, scroll it into view once on mount.
  React.useEffect(() => {
    const el = scrollRef.current?.querySelector('.kind-rail-chip.on');
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="kind-rail">
      <div
        className="kind-rail-scroll"
        ref={scrollRef}
        role="group"
        aria-label={t('filter.tripType')}
      >
        {TRIP_KINDS.map((k) => {
          const Icon = KIND_ICONS[k.key];
          const on = tripKinds.includes(k.key);
          return (
            <button
              key={k.key}
              type="button"
              className={`kind-rail-chip ${on ? 'on' : ''}`}
              onClick={() => toggle(k.key)}
              aria-pressed={on}
            >
              {Icon && <Icon size={15} className="kind-rail-icon" />}
              <span>{t(`kind.${k.key}`)}</span>
            </button>
          );
        })}
        {tripKinds.length > 0 && (
          <button
            type="button"
            className="kind-rail-chip kind-rail-clear"
            onClick={() => setTripKinds([])}
          >
            {t('filter.reset')}
          </button>
        )}
      </div>
    </div>
  );
}
