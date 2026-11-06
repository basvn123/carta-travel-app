import React, { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Money, Segmented } from '../../components/ui/index.js';
import NotYet from '../../components/NotYet.jsx';
import { PriceNotes } from '../../components/PriceNotes.jsx';
import { BedIcon, CarIcon, ChevronRightIcon, DiningIcon, PencilIcon, RouteIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { costTiles } from '../../lib/price/tiles.js';
import { formatMoney } from '../../lib/money.js';
import { CostArc, CostRow } from '../../components/CostCardKit.jsx';
import { barSegments, costCardVariant, SHARE_MIN } from './costCardVariant.js';

const LABEL = { travel: 'tp.tile.flights', around: 'tp.tile.around', stay: 'tp.tile.stay', food: 'tp.tile.food' };

// T1122: the umber variant's flag, behind ?cc=umber until the owner approves (costCardVariant.js).
function readVariant() {
  if (typeof window === 'undefined') return costCardVariant('', null);
  let store = null;
  try { store = window.sessionStorage; } catch { store = null; }
  return costCardVariant(window.location.search, store);
}

/**
 * The cost bar of the umber card (T1122): one bar on a cream track, a
 * segment per priced group in order, sized by its share of the sum, its
 * share printed inside when wide enough. A group with no figure yet is drawn
 * as a dashed track at the end, so the missing part is seen, not hidden; its
 * width is a mark, not a figure. Segments grow from the left once, about
 * 140 ms apart; after that they move to their new widths. Decorative: every
 * figure is in the rows under it (aria-hidden).
 */
export function CostBar({ tiles, lang = 'en' }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const id = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  const segs = barSegments(tiles);
  const pct = (n) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(n / 100);
  return (
    <div className={`ccu-bar${drawn ? ' is-drawn' : ''}`} aria-hidden="true" data-cc-bar="">
      {segs.map((x, i) => (x.missing ? (
        <i key={x.key} className="ccu-seg is-missing" style={{ '--i': i }} data-seg={x.key} />
      ) : (
        <i key={x.key} className={`ccu-seg ccu-k-${x.key}`} style={{ flexGrow: x.share, '--i': i }} data-seg={x.key}>
          {x.share >= SHARE_MIN && <span>{pct(x.share)}</span>}
        </i>
      )))}
    </div>
  );
}

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
  const [variant] = useState(readVariant);
  const umber = variant === 'umber';
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

  const unit = per === 'person' ? t('tp.totalAPerson') : t('receipt.total', { people: people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: people }) });

  if (umber) {
    // The direction's bands: the total and its per person line, the bar,
    // the rows on a lighter umber band, the foot strip with one action.
    const perLine = per === 'group' && people > 1 && Number.isFinite(priced?.perPerson)
      ? t('plan.aPerson', { price: formatMoney(priced.perPerson, { precision: 'whole', locale: lang }) }) : '';
    return (
      <section className="ccard is-umber" aria-labelledby={headId} data-testid="ts-total" data-cc="umber">
        <div className="ccu-head">
          <div className="ccard-top">
            <h2 className="ccard-h" id={headId}>{t('tf.tp.price')}</h2>
            {people > 1 && (
              <Segmented size="sm" className="ccard-per" label={t('tp.showFor')} value={per} onChange={onPer}
                options={[{ value: 'group', label: t('tp.forGroup') }, { value: 'person', label: t('tp.forPerson') }]} />
            )}
          </div>
          <p className="ccu-sum">
            {/* Keyed on the figure, so a change settles in place (no count-up in Operate). */}
            <span key={Number.isFinite(shown) ? String(shown) : 'none'} className="ccu-n"
              data-total={Number.isFinite(total) ? String(total) : ''}>
              {Number.isFinite(shown) ? <Money value={shown} est precision="cents" /> : <NotYet />}
            </span>
            <span className="ccard-unit">{unit}</span>
            {perLine && <span className="ccu-per">{perLine}</span>}
          </p>
          {budget && <div className="ccard-budget">{budget}</div>}
          {tiles.length > 0 && <CostBar tiles={tiles} lang={lang} />}
        </div>

        <div className="ccu-band">
          <ul className="ccard-rows">{tiles.map(rowOf)}</ul>
          <PriceNotes row={(priced?.stayCosts || []).map((s) => s?.day)} className="ccard-notes" />
        </div>

        {(onAll || onAddPaid) && (
          <div className="ccard-foot ccu-foot">
            {onAddPaid && (
              <Button variant="quiet" size="sm" className="ccard-paid" iconStart={<PencilIcon size={16} />} onClick={onAddPaid}>
                {t('tp.addPaid')}
              </Button>
            )}
            {onAll && (
              <Button variant="primary" className="ccu-go" iconEnd={<ChevronRightIcon size={16} />} onClick={onAll}>
                {t('tp.tab.costs')}
              </Button>
            )}
          </div>
        )}
      </section>
    );
  }

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
          <span className="ccard-unit">{unit}</span>
        </p>
      </CostArc>

      {budget && <div className="ccard-budget">{budget}</div>}

      <ul className="ccard-rows">{tiles.map(rowOf)}</ul>
      <PriceNotes row={(priced?.stayCosts || []).map((s) => s?.day)} className="ccard-notes" />

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
