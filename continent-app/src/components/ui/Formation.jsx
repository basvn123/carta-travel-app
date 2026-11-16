/*
 * Formation (G1, house style 2026-11, DESIGN.md "The formation"): the price
 * row of every list row and card. Getting there an outlined umber pill with
 * its mode icon, the bed a solid umber wagon, food and drink a beige wagon,
 * then the day figure, always the loudest thing in the row. A part with no
 * figure is a dashed "Not yet" wagon, outside the sum. A place without a
 * split shows the day figure alone (pass only `day`): a lone wagon would
 * repeat the day figure (DESIGN.md records this against decision 0012).
 * "Not yet" reads the shared price key (price.notMeasured), so a My trips
 * wording change can never change a price row.
 *
 *   <Formation go={{ mode: 'car', amount: 118 }} bed={68} food={65} day={133} />
 *
 * Figures arrive already computed by the price engine; this component only
 * formats them (formatMoney through Money). It never sums: `day` is the
 * engine's own day figure. In rows wagons are content-sized; `weighted` (rail
 * cards, the cost post) sizes them by their share (--ww).
 */
import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Money } from './Money.jsx';
import { HouseIcon } from '../HouseIcons.jsx';

const MODE_ICON = {
  car: HouseIcon.car, drive: HouseIcon.car, flight: HouseIcon.flight, plane: HouseIcon.flight, fly: HouseIcon.flight,
  train: HouseIcon.train, rail: HouseIcon.train, bus: HouseIcon.bus, ferry: HouseIcon.ferry, walk: HouseIcon.walk,
};

const finite = (n) => Number.isFinite(n);

function Wagon({ kind, value, icon: Glyph, label, weight, extraClass = '' }) {
  const { t } = useI18n();
  const has = finite(value);
  const style = has && weight ? { '--ww': Math.max(1, Math.round(weight)) } : undefined;
  return (
    <span className={`hs-wagon is-${has ? kind : 'none'}${extraClass ? ` ${extraClass}` : ''}`} style={style}>
      {Glyph && <Glyph size={13} />}
      <span className="sr-only">{label} </span>
      {has ? <Money value={value} /> : <span>{t('price.notMeasured')}</span>}
    </span>
  );
}

export function Formation({ go, bed, food, day, size = 'md', weighted = false, className = '', dayLabel }) {
  const { t } = useI18n();
  const cls = ['hs-formation', size === 'lg' && 'is-lg', weighted && 'is-weighted', className].filter(Boolean).join(' ');
  const Mode = go ? (MODE_ICON[go.mode] || HouseIcon.route) : null;
  const split = bed !== undefined || food !== undefined;
  return (
    <span className={cls}>
      {go && <Wagon kind="go" value={go.amount} icon={Mode} label={t('detail.gettingThere')} />}
      {split && (
        <span className="hs-formation-train">
          <Wagon kind="bed" value={bed} icon={HouseIcon.bed} label={t('cost.bed')} weight={bed} />
          <Wagon kind="food" value={food} icon={HouseIcon.food} label={t('cost.food')} weight={food} />
        </span>
      )}
      <span className="hs-formation-day">
        {dayLabel && <span className="sr-only">{dayLabel} </span>}
        {finite(day) ? <Money value={day} /> : <span className="hs-notyet">{t('price.notMeasured')}</span>}
      </span>
    </span>
  );
}
