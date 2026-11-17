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
import { formatMoney } from '../../lib/money.js';
import { HouseIcon } from '../HouseIcons.jsx';

const MODE_ICON = {
  car: HouseIcon.car, drive: HouseIcon.car, flight: HouseIcon.flight, plane: HouseIcon.flight, fly: HouseIcon.flight,
  train: HouseIcon.train, rail: HouseIcon.train, bus: HouseIcon.bus, ferry: HouseIcon.ferry, walk: HouseIcon.walk,
};

const finite = (n) => Number.isFinite(n);

/* `est` is one flag for every part or an object per part ({ go, bed, food,
   around, day }). An estimate draws nothing (price plan rule 2, as Money); a
   screen reader hears it as the estimate (money.estSpoken), as Explore's
   RowFormation says it. */
const estOf = (est, part) => (est && typeof est === 'object' ? !!est[part] : !!est);

function Wagon({ kind, value, icon: Glyph, label, weight, est = false, extraClass = '' }) {
  const { t } = useI18n();
  const has = finite(value);
  const style = has && weight ? { '--ww': Math.max(1, Math.round(weight)) } : undefined;
  return (
    <span className={`hs-wagon is-${has ? kind : 'none'}${extraClass ? ` ${extraClass}` : ''}`} style={style}>
      {Glyph && <Glyph size={13} />}
      {has && est ? (
        <>
          <span className="sr-only">{label} {t('money.estSpoken', { price: formatMoney(value) })}</span>
          <span aria-hidden="true"><Money value={value} est /></span>
        </>
      ) : (
        <>
          <span className="sr-only">{label} </span>
          {has ? <Money value={value} /> : <span>{t('price.notMeasured')}</span>}
        </>
      )}
    </span>
  );
}

/*
 * More props (K2, integration 2026-11):
 *   est      true, or per part: { go, bed, food, around, day }
 *   dayWrap  (node) => node: wraps the day figure, e.g. in PriceItems
 *   figure   false: no day slot (a trip total, or a post that prints its day
 *            figure elsewhere). `day` is always a day figure, never a total
 *   around   euros for getting around: an umber 200 wagon in the train
 *   extras   more wagons in the train, before the bed:
 *            [{ id, kind: 'fly' | 'around' | 'extra', value, icon, label, est }]
 *
 *   <Formation weighted size="lg" figure={false} around={60} bed={540} food={300}
 *     extras={[{ id: 'travel', kind: 'fly', value: 420, icon: HouseIcon.flight, label: 'Flights' }]} />
 */
export function Formation({
  go, bed, food, day, around, extras, est, dayWrap, figure = true,
  size = 'md', weighted = false, className = '', dayLabel,
}) {
  const { t } = useI18n();
  const cls = ['hs-formation', size === 'lg' && 'is-lg', weighted && 'is-weighted', className].filter(Boolean).join(' ');
  const Mode = go ? (MODE_ICON[go.mode] || HouseIcon.route) : null;
  const more = (extras || []).filter(Boolean);
  const stay = bed !== undefined || food !== undefined;
  const split = stay || around !== undefined || more.length > 0;
  const dayFig = finite(day)
    ? <Money value={day} est={estOf(est, 'day')} />
    : <span className="hs-notyet">{t('price.notMeasured')}</span>;
  return (
    <span className={cls}>
      {go && <Wagon kind="go" value={go.amount} icon={Mode} label={t('detail.gettingThere')} est={go.est ?? estOf(est, 'go')} />}
      {split && (
        <span className="hs-formation-train">
          {more.map((w, i) => (
            <Wagon key={w.id || i} kind={w.kind || 'extra'} value={w.value} icon={w.icon} label={w.label}
              weight={w.value} est={w.est ?? estOf(est, w.id)} />
          ))}
          {around !== undefined && (
            <Wagon kind="around" value={around} icon={HouseIcon.route} label={t('destx.split.around')}
              weight={around} est={estOf(est, 'around')} />
          )}
          {stay && (
            <>
              <Wagon kind="bed" value={bed} icon={HouseIcon.bed} label={t('cost.bed')} weight={bed} est={estOf(est, 'bed')} />
              <Wagon kind="food" value={food} icon={HouseIcon.food} label={t('cost.food')} weight={food} est={estOf(est, 'food')} />
            </>
          )}
        </span>
      )}
      {figure !== false && (
        <span className="hs-formation-day">
          {dayLabel && <span className="sr-only">{dayLabel} </span>}
          {dayWrap ? dayWrap(dayFig) : dayFig}
        </span>
      )}
    </span>
  );
}
