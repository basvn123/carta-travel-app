import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Money } from '../../components/ui/index.js';
import NotYet from '../../components/NotYet.jsx';
import { BedIcon, CarIcon, DiningIcon, RouteIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { costTiles } from '../../lib/price/tiles.js';
import { formatMoney } from '../../lib/money.js';

const LABEL = { travel: 'tp.tile.flights', around: 'tp.tile.around', stay: 'tp.tile.stay', food: 'tp.tile.food' };

/**
 * The trip's cost in four tiles (T820, owner 2026-10-29): Flights (Driving on
 * a drive trip), Getting around, Stay and Food. Read from costTiles(), so
 * they add up to quoteTrip()'s total; `per` shows them for the group or for
 * one person. A tile is a button when onOpen is given: it opens that group
 * of the receipt (the Costs tab).
 *
 * T839 (owner board panel 3, 2026-10-29: small and simple, icons, no
 * sub-lines): a tile is its icon, its word and its figure; the flights tile
 * adds the airlines' own marks, named for screen readers.
 *
 *   priced   quoteTrip() output
 *   per      'group' | 'person'
 *   people   head count the person figure divides by
 *   nights   the trip's nights (a night and a day figure)
 */
export function CostTiles({ priced, per = 'group', people = 1, onOpen = null, className = '', aroundNote = '' }) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const tiles = costTiles(priced);
  if (!tiles.length) return null;
  const div = per === 'person' ? Math.max(1, people) : 1;
  const money = (v, p = 'whole') => formatMoney(v, { precision: p, locale: lang });

  // The airlines on the trip's flights, each once (T839).
  const cf = priced?.cartaFlight || {};
  const carriers = [...new Set(['out', 'back'].map((d) => cf[d]?.airline).filter(Boolean))];

  const Icon = { travel: tiles[0].driving ? CarIcon : PlaneIcon, around: RouteIcon, stay: BedIcon, food: DiningIcon };

  return (
    <ul className={`ct ${className}`.trim()}>
      {tiles.map((tile) => {
        const I = Icon[tile.key];
        const label = tile.key === 'travel' && tile.driving ? t('tp.tile.driving') : t(LABEL[tile.key]);
        const body = (
          <>
            <span className="ct-label"><span className="ct-dot" aria-hidden="true" /><I size={16} aria-hidden="true" />{label}</span>
            <span className="ct-fig">
              {tile.missing ? <NotYet /> : tile.empty ? <span className="ct-none">{tile.key === 'around' && aroundNote ? aroundNote : t('tp.tile.notNeeded')}</span> : <Money value={tile.eur / div} est precision="whole" />}
            </span>
            {tile.key === 'travel' && !tile.driving && !tile.missing && carriers.length > 0 && (
              <span className="ct-marks">
                {carriers.map((c) => <AirlineMark key={c} code={c} size="sm" />)}
                <span className="sr-only">{carriers.map((c) => airlineName(airlines, c) || c).join(', ')}</span>
              </span>
            )}
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
