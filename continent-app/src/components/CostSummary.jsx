import React from 'react';
import { BAND_KEY } from '../lib/costIndex.js';
import { Money } from './ui/Money.jsx';
import { CostRow, CostSum } from './ui/CostRow.jsx';
import { AirlineMark } from './flights/Flights.jsx';
import { formatEst, formatMoney } from '../lib/money.js';

/**
 * The day's cost on Explore: one shared predicate (isNational) and the
 * compact receipt in the hover preview (CostReceipt).
 *
 * T537: the receipt draws the kit's CostRow and CostSum, the one breakdown
 * line every price surface uses (icon, label, figure). The five-step gauge on
 * each row and the dead CostLine went with it: the band word stays, once,
 * under the day's figure, which is where a reader looks for "is this cheap".
 */

/**
 * True when the day figure leans on a stand-in: the bed or the food was not
 * measured in the town (a national figure, a nearby town's bed, or a country
 * median repairing a broken harvest). The figure then carries the estimate
 * mark, never only a colour.
 */
export function isNational(cost) {
  if (!cost || cost.dayEur == null) return false;
  return cost.stayLevel !== 'city' || cost.foodLevel !== 'city';
}

/**
 * The compact day receipt in Explore's hover preview: the cost bar, bed,
 * food and drink, then the day as the sum with its band word under it. The
 * same day figure as the card, the pin and the destination page (one cost
 * truth, T429). Under the day, when the card shows one, the cheapest return
 * flight a person in the travel month (T518), or the train, bus or car the
 * settings line asks for (`cost.way`, T582): it is not part of
 * the day, so it sits after the sum, never in it.
 */
export function CostReceipt({ cost, t }) {
  if (!cost || cost.dayEur == null) return null;

  // The cost bar (house rule "The cost bar", V4 T393): one segment per line
  // in receipt order, in the ink ramp, 8 px, no figures on the bar; the lines
  // below carry them. Drawn only when both lines are.
  const bar = cost.stayEur != null && cost.foodEur != null && cost.stayEur + cost.foodEur > 0;

  return (
    <div className="cost-receipt">
      {bar && (
        <span className="xcost-bar" aria-hidden="true">
          <span className="xcost-bar-seg" style={{ flexGrow: cost.stayEur }} />
          <span className="xcost-bar-seg" style={{ flexGrow: cost.foodEur }} />
        </span>
      )}
      <dl className="costrows">
        {cost.stayEur != null && (
          <CostRow kind="bed" label={t('cost.bed')}
            value={<Money value={cost.stayEur} est={cost.stayLevel !== 'city'} />} />
        )}
        {cost.foodEur != null && (
          <CostRow kind="food" label={t('cost.food')}
            value={<Money value={cost.foodEur} est={cost.foodLevel !== 'city'} />} />
        )}
        <CostSum label={t('cost.dayTotal')} live={false}
          value={<Money value={cost.dayEur} est={isNational(cost)} />}
          each={t(BAND_KEY[cost.dayBand])} />
        {cost.way?.mode === 'plane' && cost.way.perPerson > 0 && (
          <CostRow kind="flight" label={t('flight.flightLine')}
            mark={<AirlineMark code={cost.way.airline} size="sm" />}
            value={<span className="money">{t('flight.returnPerson', { price: formatMoney(cost.way.perPerson) })}</span>} />
        )}
        {/* T582: a train, bus or car journey, an estimate, return a person. */}
        {cost.way && cost.way.mode !== 'plane' && cost.way.perPerson > 0 && (
          <CostRow kind="flight" label={t(`way.${cost.way.mode}`)}
            value={<span className="money">{t('flight.returnPerson', { price: formatEst(cost.way.perPerson, t('money.est')) })}</span>} />
        )}
      </dl>
    </div>
  );
}
