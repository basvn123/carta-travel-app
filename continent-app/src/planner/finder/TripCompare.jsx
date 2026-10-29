import React, { useId, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { formatMoney } from '../../lib/money.js';
import { CROWD_KEYS, compareRows } from '../../lib/recommend/compare.js';
import { firstPlace, tripName } from './finderText.js';

const LABEL = {
  total: 'tf.cmp.total',
  flight: 'tf.card.flight',
  stay: 'tf.card.stay',
  days: 'tf.card.days',
  match: 'tf.cmp.match',
  door: 'tf.cmp.door',
  weather: 'tf.cmp.weather',
  crowds: 'cmp.crowds',
  budget: 'tf.cmp.budget',
};

/** One cell's words: every figure comes from compare.js, nothing is added up here. */
function CellText({ row, c, t, lang, ui }) {
  const { NotYet } = ui;
  if (c.value == null) return <NotYet />;
  const money = (v) => formatMoney(v, { locale: lang });
  switch (row) {
    case 'total':
      return (
        <>
          <span className="cmp-fig money">{money(c.value)}</span>
          {c.partial && <span className="cmp-sub">{t('tf.cmp.partial')}</span>}
        </>
      );
    case 'match':
      return <span className="cmp-fig">{t('tf.why.pct', { pct: c.value })}</span>;
    case 'door':
      return <span className="cmp-fig">{t('tf.pick.duration', { h: Math.floor(c.value / 60), m: String(c.value % 60).padStart(2, '0') })}</span>;
    case 'weather':
      return <span className="cmp-fig">{t(c.value.lo === c.value.hi ? 'tf.cmp.high' : 'tf.cmp.highs', c.value)}</span>;
    case 'crowds':
      return <span className="cmp-fig is-text">{t(CROWD_KEYS[c.value])}</span>;
    case 'budget':
      return (
        <span className={`cmp-fig${c.value > 0 ? ' tff-cmp-over' : ''}`}>
          {t(c.value > 0 ? 'tf.cmp.over' : 'tf.cmp.under', { eur: money(Math.abs(c.value)) })}
        </span>
      );
    default:
      return <span className="cmp-fig money">{money(c.value)}</span>;
  }
}

/**
 * Compare trips (T802): two to four ticked trips side by side, on the
 * planner's sheet (SheetShell). The trips are the columns, each headed by
 * its name and a small photo; one row per figure (lib/recommend/compare.js),
 * the row labels sticky; two columns fit a phone, three or four scroll
 * sideways inside the sheet. The best value of each decidable row carries
 * the best-value mark in sun yellow, once a row.
 *
 * Each column's foot opens the trip's preview or plans it. Only the column
 * in focus shows "Plan this trip" as the primary; the others are quiet.
 *
 *   trips              the ticked trips, as the cards show them
 *   onRemove(id)       untick one (offered while more than two are left)
 *   onOpen(trip, el)   its preview (T811), over this sheet; closing it comes back here
 *   onPlan(trip)       "Plan this trip" (T801)
 */
export function TripCompare({ trips, settings, destinations, ui, onClose, onRemove, onOpen, onPlan }) {
  const { t, lang } = useI18n();
  const titleId = useId();
  const [active, setActive] = useState(0);
  const rows = useMemo(() => compareRows(trips, { settings, destinations }), [trips, settings, destinations]);
  const at = Math.min(active, trips.length - 1);
  const focusCol = (i) => () => setActive(i);

  return (
    <SheetShell title={t('tf.cmp.title')} onClose={onClose} className="tff-cmp-sheet" labelId={titleId} width={880} closeLabel={t('tf.cmp.close')}>
      <div className="cmp-scroll tff-cmp-scroll" role="region" aria-labelledby={titleId} tabIndex={0}>
        <table className={`cmp-table tff-cmp-table is-${trips.length}`}>
          <thead>
            <tr>
              <th scope="col" className="cmp-rowhead"><span className="sr-only">{t('cmp.figure')}</span></th>
              {trips.map((trip, i) => {
                const place = firstPlace(trip, destinations);
                return (
                  <th scope="col" key={trip.id} className={i === at ? 'is-active' : undefined} onPointerEnter={focusCol(i)}>
                    <HeroImage
                      url={place?.image?.url}
                      city={place?.city || trip.country}
                      iso2={place?.iso2 || trip.iso2}
                      className="tff-cmp-img"
                      maxWidth={320}
                      sizes="160px"
                      ratio={[3, 2]}
                    />
                    <span className="tff-cmp-name">{tripName(trip, destinations, lang)}</span>
                    {trips.length > 2 && (
                      <Button variant="quiet" size="sm" className="cmp-remove" onFocus={focusCol(i)}
                        aria-label={t('tf.cmp.removeOne', { name: tripName(trip, destinations, lang) })}
                        onClick={() => onRemove(trip.id)}>
                        {t('cmp.remove')}
                      </Button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="cmp-rowhead">{t(LABEL[r.key])}</th>
                {r.cells.map((c, i) => (
                  <td key={trips[i].id} className={c.best ? 'is-best' : undefined} onPointerEnter={focusCol(i)}>
                    <CellText row={r.key} c={c} t={t} lang={lang} ui={ui} />
                    {c.best && <Chip kind="status" tone="best" className="cmp-best">{t('cmp.bestValue')}</Chip>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="cmp-rowhead"><span className="sr-only">{t('tf.cmp.actions')}</span></th>
              {trips.map((trip, i) => {
                const name = tripName(trip, destinations, lang);
                return (
                  <td key={trip.id} className="tff-cmp-foot" onPointerEnter={focusCol(i)} onFocus={focusCol(i)}>
                    <Button variant="quiet" size="sm" aria-label={t('tf.cmp.openOne', { name })} onClick={(e) => onOpen(trip, e.currentTarget)}>
                      {t('tf.cmp.openCol')}
                    </Button>
                    <Button variant={i === at ? 'primary' : 'quiet'} size="sm" aria-label={t('tf.cmp.planOne', { name })} onClick={() => onPlan(trip)}>
                      {t('tf.rc.plan')}
                    </Button>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </SheetShell>
  );
}
