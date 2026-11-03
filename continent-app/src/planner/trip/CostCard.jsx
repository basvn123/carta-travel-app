import React, { useId } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Money, Segmented } from '../../components/ui/index.js';
import NotYet from '../../components/NotYet.jsx';
import { BedIcon, CarIcon, ChevronRightIcon, DiningIcon, PencilIcon, RouteIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { costTiles } from '../../lib/price/tiles.js';
import { formatMoney } from '../../lib/money.js';
import { CostArc, CostRow } from '../../components/CostCardKit.jsx';

const LABEL = { travel: 'tp.tile.flights', around: 'tp.tile.around', stay: 'tp.tile.stay', food: 'tp.tile.food' };

/**
 * What the trip costs (T1003, owner 2026-11-02: "fully redesign it: too busy,
 * no white card, another visual than the two line bars, Carta colours,
 * modern; the breakdown's icons are generic; Stay and Food reach the
 * Lifestyle and show the figure change; Flights shows the airline and can
 * be changed"). Replaces T886's white card.
 *
 * One umber card, the Carta door's ground. The total stands inside a half
 * arc, and the arc is the breakdown: Flights, Getting around, Stay and Food
 * as four lengths in the card's own four colours, drawn in once and moving
 * to their new lengths whenever a figure changes, so a Lifestyle change is
 * seen as it happens. The budget line (BudgetCard compact) sits under the
 * total. Under the arc, the four groups as rows, always open, each a key to
 * its arc colour and a door to what sets it:
 *
 *   Flights         the airline's own mark; opens the flight sheet
 *   Getting around  opens its group in the Costs tab
 *   Stay, Food      the Lifestyle's bed and its way of travelling; open the
 *                   Lifestyle panel, whose changes reprice this card live
 *
 *   priced         quoteTrip() output
 *   people         head count the person figure divides by
 *   per, onPer     'group' | 'person'
 *   budget         the BudgetCard (compact), or null
 *   onOpen(k)      a group's rows in the Costs tab (k: travel | around | stay | food)
 *   onAll()        the Costs tab
 *   onAddPaid      put in what was paid; absent hides it
 *   aroundNote     what an empty Getting around says instead of Not needed (T887)
 *   lifestyle      { bed, vibe } from useLifestyleParts()
 *   onLifestyle    opens the Lifestyle panel
 *   onChangeFlight(dir)  opens the flight sheet
 */
export function CostCard({
  priced, people = 1, per = 'group', onPer, budget = null, onOpen = null, onAll = null, onAddPaid = null, aroundNote = '',
  lifestyle = null, onLifestyle = null, onChangeFlight = null,
}) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const headId = useId();
  const total = priced?.grandTotal;
  const shown = per === 'person' ? priced?.perPerson : total;
  const div = per === 'person' ? Math.max(1, people) : 1;
  const tiles = costTiles(priced);
  const parts = tiles.filter((x) => !x.missing && !x.empty);
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });

  const cf = priced?.cartaFlight || {};
  const carriers = [...new Set(['out', 'back'].map((d) => cf[d]?.airline).filter(Boolean))];

  const rowOf = (tile) => {
    const k = tile.key;
    const label = k === 'travel' && tile.driving ? t('tp.tile.driving') : t(LABEL[k]);
    let lead;
    let sub = '';
    let act = null;
    let actLabel = '';
    if (k === 'travel') {
      if (!tile.driving && carriers.length) {
        lead = (
          <span className="ccard-ico is-marks">
            {carriers.slice(0, 2).map((c) => <AirlineMark key={c} code={c} size="sm" />)}
          </span>
        );
        sub = carriers.map((c) => airlineName(airlines, c) || c).join(', ');
      } else {
        lead = <span className="ccard-ico">{tile.driving ? <CarIcon size={18} /> : <PlaneIcon size={18} />}</span>;
      }
      if (onChangeFlight && !tile.driving && carriers.length) { act = () => onChangeFlight('out'); actLabel = t('tp.fl.change'); }
    } else if (k === 'around') {
      lead = <span className="ccard-ico"><RouteIcon size={18} /></span>;
    } else {
      lead = <span className="ccard-ico">{k === 'stay' ? <BedIcon size={18} /> : <DiningIcon size={18} />}</span>;
      sub = lifestyle ? (k === 'stay' ? lifestyle.bed : lifestyle.vibe) : '';
      if (onLifestyle) { act = onLifestyle; actLabel = t('lifestyle.title'); }
    }
    if (!act && onOpen) { act = () => onOpen(k); actLabel = t('tp.breakdown'); }
    const fig = tile.missing ? <NotYet /> : tile.empty
      ? <span className="ccard-none">{k === 'around' && aroundNote ? aroundNote : t('tp.tile.notNeeded')}</span>
      : <Money value={tile.eur / div} est precision="whole" />;
    const figText = tile.missing ? t('data.notYet') : tile.empty ? '' : money(tile.eur / div);
    const edits = act && (k === 'stay' || k === 'food' || (k === 'travel' && onChangeFlight && carriers.length));
    return (
      <CostRow key={k} k={k} className={tile.empty ? ' is-empty' : ''} data-tile={k} data-eur={tile.eur}
        lead={lead} label={label} sub={sub} edits={!!edits} fig={fig} figText={figText} onAct={act} actLabel={actLabel} />
    );
  };

  return (
    <section className="ccard" aria-labelledby={headId} data-testid="ts-total">
      <div className="ccard-top">
        <h2 className="ccard-h" id={headId}>{t('tf.tp.price')}</h2>
        {people > 1 && (
          <Segmented size="sm" className="ccard-per" label={t('tp.showFor')} value={per} onChange={onPer}
            options={[{ value: 'group', label: t('tp.forGroup') }, { value: 'person', label: t('tp.forPerson') }]} />
        )}
      </div>

      <CostArc parts={parts}>
        <p className="ccard-sum">
          <span className="ccard-n" data-total={Number.isFinite(total) ? String(total) : ''}>
            {Number.isFinite(shown) ? <Money value={shown} est precision="cents" /> : <NotYet />}
          </span>
          <span className="ccard-unit">
            {per === 'person' ? t('tp.totalAPerson') : t('receipt.total', { people: people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: people }) })}
          </span>
        </p>
      </CostArc>

      {budget && <div className="ccard-budget">{budget}</div>}

      <ul className="ccard-rows">{tiles.map(rowOf)}</ul>

      {(onAll || onAddPaid) && (
        <div className="ccard-foot">
          {onAll && (
            <Button variant="quiet" size="sm" className="ccard-all" iconEnd={<ChevronRightIcon size={16} />} onClick={onAll}>
              {t('tp.tab.costs')}
            </Button>
          )}
          {onAddPaid && (
            <Button variant="quiet" size="sm" className="ccard-paid" iconStart={<PencilIcon size={16} />} onClick={onAddPaid}>
              {t('tp.addPaid')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
