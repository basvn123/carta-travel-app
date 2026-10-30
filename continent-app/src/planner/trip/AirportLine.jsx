import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { formatMoney } from '../../lib/money.js';
import { swapTarget } from './airportLine.js';

/**
 * The trip's home airport on its flight line (T861, plan flow v3): which of
 * the airports in reach the trip flies from and what that saves (or costs)
 * door to door against the nearest one, the fare and the way to the airport
 * and back together; one quiet button swaps to the cheapest, or back to the
 * nearest. Shown only when the traveller ticked more than one airport.
 *
 *   cartaFlight  priced.cartaFlight (home, nearest, airports)
 *   origins      meta.origins, for the airports' towns
 *   onSwap(iata) pins the trip to that airport (the planner's anchorOrigin)
 */
export function AirportLine({ cartaFlight, origins = {}, onSwap = null }) {
  const { t, lang } = useI18n();
  const opts = cartaFlight?.airports;
  if (!Array.isArray(opts) || opts.length < 2) return null;
  const chosen = opts.find((o) => o.iata === cartaFlight.home);
  const nearest = opts.find((o) => o.iata === cartaFlight.nearest);
  if (!chosen || !nearest) return null;
  const name = (iata) => `${origins[iata]?.city || iata} (${iata})`;
  const money = (eur) => formatMoney(Math.abs(eur), { precision: 'cents', locale: lang });
  let text;
  if (chosen.iata === nearest.iata) text = t('tp.air.nearest', { airport: name(chosen.iata) });
  else if (chosen.priced && nearest.priced) {
    const diff = Math.round((nearest.total - chosen.total) * 100) / 100;
    text = diff >= 0
      ? t('tp.air.saves', { airport: name(chosen.iata), price: money(diff), nearest: name(nearest.iata) })
      : t('tp.air.costs', { airport: name(chosen.iata), price: money(diff), nearest: name(nearest.iata) });
  } else text = t('tp.air.from', { airport: name(chosen.iata) });
  const target = onSwap ? swapTarget(cartaFlight) : null;
  return (
    <p className="itin-air">
      <span className="itin-air-text">{text}</span>
      {target && (
        <Button variant="quiet" size="sm" className="itin-air-swap" onClick={() => onSwap(target)}>
          {t('tp.air.swap', { airport: name(target) })}
        </Button>
      )}
    </p>
  );
}
