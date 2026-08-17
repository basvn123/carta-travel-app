import React from 'react';
import { CityIcon, VillageIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * The map's size switch, sitting beside the "travelling from" picker.
 *
 * The catalogue runs from capitals down to villages of a few hundred people,
 * and at continental zoom those read as the same dot. This pill collapses the
 * board to the places you would actually base a trip in (place.class metro or
 * city, see lib/placeSize.js) and back again.
 *
 * It states what you are looking at, not what the click will do: the glyph and
 * the label change together, and aria-pressed carries the state for anyone not
 * reading either.
 */
export function PlaceSizeToggle({ bigOnly, onChange }) {
  const { t } = useI18n();
  const Icon = bigOnly ? CityIcon : VillageIcon;
  return (
    <button
      className={`size-toggle ${bigOnly ? 'on' : ''}`}
      onClick={() => onChange(!bigOnly)}
      aria-pressed={bigOnly}
      title={t(bigOnly ? 'mapSize.titleOn' : 'mapSize.titleOff')}
    >
      <span className="size-toggle-icon" aria-hidden="true"><Icon size={15} /></span>
      <span className="size-toggle-label">
        <span className="size-toggle-cap">{t('mapSize.cap')}</span>
        {/* Two labels, one shown per width (same trick as the header's See
            pricing / Passes pair): on a phone this pill shares the row with a
            From picker that can read "Charleroi (CRL)", and the pair has to
            fit inside 390px. */}
        <b className="size-toggle-value">{t(bigOnly ? 'mapSize.big' : 'mapSize.all')}</b>
        <b className="size-toggle-value-short">{t(bigOnly ? 'mapSize.bigShort' : 'mapSize.allShort')}</b>
      </span>
    </button>
  );
}
