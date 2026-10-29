import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Money } from '../../components/ui/index.js';
import NotYet from '../../components/NotYet.jsx';
import { BedIcon, CarIcon, DiningIcon, RouteIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { costTiles } from '../../lib/price/tiles.js';
import { formatMoney } from '../../lib/money.js';

const LABEL = { travel: 'tp.tile.flights', around: 'tp.tile.around', stay: 'tp.tile.stay', food: 'tp.tile.food' };
const PART_LABEL = { transfers: 'plan.lineTransfers', drive: 'plan.lineDrive', between: 'plan.lineBetween', car: 'plan.lineCar' };

/**
 * The trip's cost in four tiles (T820, owner 2026-10-29): Flights (Driving on
 * a drive trip), Getting around, Stay and Food. Read from costTiles(), so
 * they add up to quoteTrip()'s total; `per` shows them for the group or for
 * one person. A tile is a button when onOpen is given: it opens that group
 * of the receipt (the Costs tab).
 *
 *   priced   quoteTrip() output
 *   per      'group' | 'person'
 *   people   head count the person figure divides by
 *   nights   the trip's nights (a night and a day figure)
 */
export function CostTiles({ priced, per = 'group', people = 1, nights = 0, onOpen = null, className = '' }) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const tiles = costTiles(priced);
  if (!tiles.length) return null;
  const div = per === 'person' ? Math.max(1, people) : 1;
  const money = (v, p = 'whole') => formatMoney(v, { precision: p, locale: lang });

  const sub = (tile) => {
    if (tile.missing) return null;
    if (tile.empty) return '';
    if (tile.key === 'travel') {
      if (tile.driving) return t('plan.lineDrive');
      const cf = priced.cartaFlight || {};
      const names = [...new Set(['out', 'back'].map((d) => cf[d]?.airline).filter(Boolean).map((c) => airlineName(airlines, c) || c))];
      if (names.length) return names.join(', ');
      return t('trip.sum.yourOwn');
    }
    if (tile.key === 'around') {
      return tile.parts.filter((k) => (priced.parts[k] || 0) > 0).map((k) => t(PART_LABEL[k])).join(', ');
    }
    if (tile.key === 'stay') {
      return nights > 0 ? t('tp.tile.nightsAt', { n: nights, price: money(tile.eur / nights / div) }) : '';
    }
    if (tile.key === 'food') {
      return nights > 0 ? t('tp.tile.aDay', { price: money(tile.eur / nights / div) }) : '';
    }
    return '';
  };

  const Icon = { travel: tiles[0].driving ? CarIcon : PlaneIcon, around: RouteIcon, stay: BedIcon, food: DiningIcon };

  return (
    <ul className={`ct ${className}`.trim()}>
      {tiles.map((tile) => {
        const I = Icon[tile.key];
        const label = tile.key === 'travel' && tile.driving ? t('tp.tile.driving') : t(LABEL[tile.key]);
        const body = (
          <>
            <span className="ct-label"><I size={16} aria-hidden="true" />{label}</span>
            <span className="ct-fig">
              {tile.missing ? <NotYet /> : tile.empty ? <span className="ct-none">{t('tp.tile.notNeeded')}</span> : <Money value={tile.eur / div} est precision="whole" />}
            </span>
            <span className="ct-sub">{sub(tile)}</span>
          </>
        );
        return (
          <li key={tile.key} className={`ct-tile is-${tile.key}${tile.empty ? ' is-empty' : ''}`} data-tile={tile.key} data-eur={tile.eur}>
            {onOpen ? (
              <button type="button" className="ct-hit" onClick={() => onOpen(tile.key)}
                aria-label={`${label}: ${tile.missing ? t('data.notYet') : money(tile.eur / div)}. ${t('tp.breakdown')}`}>
                {body}
              </button>
            ) : <div className="ct-hit">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}
