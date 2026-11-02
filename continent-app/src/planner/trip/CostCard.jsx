import React, { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Money, Segmented } from '../../components/ui/index.js';
import NotYet from '../../components/NotYet.jsx';
import { BedIcon, CarIcon, ChevronRightIcon, DiningIcon, PencilIcon, RouteIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { costTiles } from '../../lib/price/tiles.js';
import { formatMoney } from '../../lib/money.js';

const LABEL = { travel: 'tp.tile.flights', around: 'tp.tile.around', stay: 'tp.tile.stay', food: 'tp.tile.food' };

// The arc: half a circle, drawn as one path the four groups share by length
// (pathLength 100), a hair of ground between them.
const ARC = 'M 14 104 A 90 90 0 0 1 194 104';
const GAP = 1.4;

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
  const parts = tiles.filter((x) => !x.missing && !x.empty && x.eur > 0);
  const sum = parts.reduce((n, x) => n + x.eur, 0);
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });

  // Drawn in once on arrival; after that each length moves to its new value.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  let at = 0;
  const gap = parts.length > 1 ? GAP : 0;
  const arcs = parts.map((x) => {
    const len = sum > 0 ? Math.max(0.6, (x.eur / sum) * 100 - gap) : 0;
    const seg = { key: x.key, len: drawn ? len : 0, from: at };
    at += (sum > 0 ? (x.eur / sum) * 100 : 0);
    return seg;
  });

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
          <span className="tpc-ico is-marks">
            {carriers.slice(0, 2).map((c) => <AirlineMark key={c} code={c} size="sm" />)}
          </span>
        );
        sub = carriers.map((c) => airlineName(airlines, c) || c).join(', ');
      } else {
        lead = <span className="tpc-ico">{tile.driving ? <CarIcon size={18} /> : <PlaneIcon size={18} />}</span>;
      }
      if (onChangeFlight && !tile.driving && carriers.length) { act = () => onChangeFlight('out'); actLabel = t('tp.fl.change'); }
    } else if (k === 'around') {
      lead = <span className="tpc-ico"><RouteIcon size={18} /></span>;
    } else {
      lead = <span className="tpc-ico">{k === 'stay' ? <BedIcon size={18} /> : <DiningIcon size={18} />}</span>;
      sub = lifestyle ? (k === 'stay' ? lifestyle.bed : lifestyle.vibe) : '';
      if (onLifestyle) { act = onLifestyle; actLabel = t('lifestyle.title'); }
    }
    if (!act && onOpen) { act = () => onOpen(k); actLabel = t('tp.breakdown'); }
    const fig = tile.missing ? <NotYet /> : tile.empty
      ? <span className="tpc-none">{k === 'around' && aroundNote ? aroundNote : t('tp.tile.notNeeded')}</span>
      : <Money value={tile.eur / div} est precision="whole" />;
    const figText = tile.missing ? t('data.notYet') : tile.empty ? '' : money(tile.eur / div);
    const edits = act && (k === 'stay' || k === 'food' || (k === 'travel' && onChangeFlight && carriers.length));
    const body = (
      <>
        {lead}
        <span className="tpc-what">
          <span className="tpc-label">{label}</span>
          {sub && (
            <span className="tpc-sub">
              {sub}
              {edits && <PencilIcon size={12} aria-hidden="true" />}
            </span>
          )}
        </span>
        <span className="tpc-fig">{fig}</span>
        {/* Every row keeps the chevron's column, so the figures line up. */}
        {act && !edits ? <ChevronRightIcon size={16} className="tpc-go" aria-hidden="true" /> : <span className="tpc-go" aria-hidden="true" />}
      </>
    );
    return (
      <li key={k} className={`tpc-row tpc-k-${k}${tile.empty ? ' is-empty' : ''}`} data-tile={k} data-eur={tile.eur}>
        {act ? (
          <button type="button" className="tpc-hit" onClick={act}
            aria-label={[label, sub, figText, actLabel].filter(Boolean).join('. ')}>
            {body}
          </button>
        ) : <div className="tpc-hit">{body}</div>}
      </li>
    );
  };

  return (
    <section className="tpc" aria-labelledby={headId} data-testid="ts-total">
      <div className="tpc-top">
        <h2 className="tpc-h" id={headId}>{t('tf.tp.price')}</h2>
        {people > 1 && (
          <Segmented size="sm" className="tpc-per" label={t('tp.showFor')} value={per} onChange={onPer}
            options={[{ value: 'group', label: t('tp.forGroup') }, { value: 'person', label: t('tp.forPerson') }]} />
        )}
      </div>

      <div className="tpc-gauge">
        <svg className="tpc-arc" viewBox="0 0 208 112" aria-hidden="true" focusable="false">
          <path d={ARC} pathLength="100" className="tpc-arc-ground" />
          {arcs.map((a) => (
            <path key={a.key} d={ARC} pathLength="100" className={`tpc-arc-seg tpc-k-${a.key}`}
              style={{ strokeDasharray: `${a.len} 200`, strokeDashoffset: -a.from }} />
          ))}
        </svg>
        <p className="tpc-sum">
          <span className="tpc-n" data-total={Number.isFinite(total) ? String(total) : ''}>
            {Number.isFinite(shown) ? <Money value={shown} est precision="cents" /> : <NotYet />}
          </span>
          <span className="tpc-unit">
            {per === 'person' ? t('tp.totalAPerson') : t('receipt.total', { people: people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: people }) })}
          </span>
        </p>
      </div>

      {budget && <div className="tpc-budget">{budget}</div>}

      <ul className="tpc-rows">{tiles.map(rowOf)}</ul>

      {(onAll || onAddPaid) && (
        <div className="tpc-foot">
          {onAll && (
            <Button variant="quiet" size="sm" className="tpc-all" iconEnd={<ChevronRightIcon size={16} />} onClick={onAll}>
              {t('tp.tab.costs')}
            </Button>
          )}
          {onAddPaid && (
            <Button variant="quiet" size="sm" className="tpc-paid" iconStart={<PencilIcon size={16} />} onClick={onAddPaid}>
              {t('tp.addPaid')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
