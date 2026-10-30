import React, { useId, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Money, Segmented } from '../../components/ui/index.js';
import NotYet from '../../components/NotYet.jsx';
import { ChevronDownIcon, ChevronRightIcon, PencilIcon } from '../../components/Icons.jsx';
import { costTiles } from '../../lib/price/tiles.js';
import { CostTiles } from './CostTiles.jsx';

/**
 * What the trip costs, once (T886, the owner's "Wat het kost" review and the
 * trip page v5 board, 2026-10-30): the total for the group or a person (the
 * Group / Per person switch), the cost bar in the four cost colours, the
 * budget line (BudgetCard compact) and one Breakdown button at the top that
 * folds the four groups open as rows (CostTiles), each opening its group in
 * the Costs tab. Under them: the whole receipt and Add what you paid.
 * The page shows the total here and nowhere else: the side column from
 * 1024 px (every tab), the Overview on a phone.
 *
 *   priced     quoteTrip() output
 *   people     head count the person figure divides by
 *   per, onPer 'group' | 'person'
 *   budget     the BudgetCard (compact) under the bar, or null
 *   onOpen(k)  a group's rows in the Costs tab (k: travel | around | stay | food)
 *   onAll()    the Costs tab
 *   onAddPaid  put in what was paid; absent hides it
 *   aroundNote what an empty Getting around says instead of Not needed (T887)
 */
export function CostCard({ priced, people = 1, per = 'group', onPer, budget = null, onOpen = null, onAll = null, onAddPaid = null, aroundNote = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const headId = useId();
  const total = priced?.grandTotal;
  const shown = per === 'person' ? priced?.perPerson : total;
  const parts = costTiles(priced).filter((x) => !x.missing && !x.empty && x.eur > 0);
  const sum = parts.reduce((n, x) => n + x.eur, 0);
  return (
    <section className="tpc" aria-labelledby={headId} data-testid="ts-total">
      <div className="tpc-top">
        <h2 className="tpc-h" id={headId}>{t('tf.tp.price')}</h2>
        {people > 1 && (
          <Segmented size="sm" label={t('tp.showFor')} value={per} onChange={onPer}
            options={[{ value: 'group', label: t('tp.forGroup') }, { value: 'person', label: t('tp.forPerson') }]} />
        )}
      </div>
      <p className="tpc-sum">
        <span className="tpc-n" data-total={Number.isFinite(total) ? String(total) : ''}>
          {Number.isFinite(shown) ? <Money value={shown} est precision="cents" /> : <NotYet />}
        </span>
        <span className="tpc-unit">
          {per === 'person' ? t('tp.totalAPerson') : t('receipt.total', { people: people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: people }) })}
        </span>
      </p>
      {parts.length > 1 && sum > 0 && (
        <span className="tpc-bar" aria-hidden="true">
          {parts.map((x) => <span key={x.key} className={`is-${x.key}`} style={{ flexGrow: x.eur / sum }} />)}
        </span>
      )}
      {budget}
      <div className="tpc-acts">
        <Button variant="secondary" size="sm" className="tpc-tog" aria-expanded={open} aria-controls={bodyId}
          iconEnd={<ChevronDownIcon size={16} />} onClick={() => setOpen((v) => !v)}>
          {t(open ? 'tf.cost.close' : 'tf.cost.open')}
        </Button>
        {onAddPaid && (
          <Button variant="quiet" size="sm" className="tpc-paid" iconStart={<PencilIcon size={16} />} onClick={onAddPaid}>
            {t('tp.addPaid')}
          </Button>
        )}
      </div>
      <div className={`tpc-body${open ? ' is-open' : ''}`} id={bodyId} inert={open ? undefined : ''}>
        <div className="tpc-in">
          <CostTiles priced={priced} per={per} people={people} onOpen={onOpen} className="is-rows" aroundNote={aroundNote} />
          {onAll && (
            <Button variant="quiet" size="sm" className="tpc-all" iconEnd={<ChevronRightIcon size={16} />} onClick={onAll}>
              {t('tp.tab.costs')}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
