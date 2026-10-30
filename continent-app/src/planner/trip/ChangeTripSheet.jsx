import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import {
  BedIcon, CalendarIcon, ChevronRightIcon, HomeIcon, PersonIcon, RedoIcon, SettingsIcon, SwapIcon, UndoIcon,
} from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { formatMoney } from '../../lib/money.js';
import { nightsBetween } from '../../lib/tripDates.js';
import { shiftDays } from './changeTrip.js';

/**
 * Change your trip (T888, trip page v5 board, 2026-10-30): one door to every
 * input of the price. Dates opens here: the start days around the trip's own
 * with what each does to the total (Google Flights' date grid, for the whole
 * trip), the cheapest marked best value, and the old total, the new one and
 * the difference before Apply. Who, From, Flights, Stay and Lifestyle,
 * Places and All trip settings open their own editors (T836 to T841), and
 * Your changes holds Undo and Redo (T835). Every change lands as one step
 * of the page's history, so the Undo toast follows it.
 *
 *   total            the group total now
 *   tripStart, tripEnd
 *   quoteDelta(patch) the trip priced with a patch against itself (useTripPlanner)
 *   flightsBooked     a booked flight: Dates says the booking does not move
 *   onDates(start, end)
 *   open             { people, from, flights, stay, places, settings }: each an opener or null
 *   history          { canUndo, canRedo, undo, redo } or null
 */
export function ChangeTripSheet({ total, tripStart, tripEnd, quoteDelta, flightsBooked = false, onDates, open = {}, history = null, onClose }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState('menu');
  const days = useMemo(() => (view === 'dates' ? shiftDays(tripStart, tripEnd, quoteDelta) : []), [view, tripStart, tripEnd, quoteDelta]);
  const [pick, setPick] = useState(0);
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });
  const deltaText = (d) => (d == null ? '' : Math.round(d) === 0 ? t('tp.cx.same') : t(d < 0 ? 'tp.cx.less' : 'tp.cx.more', { eur: money(Math.abs(d)) }));
  const known = days.filter((d) => d.delta != null && d.k !== 0);
  const cheapest = known.length ? known.reduce((a, d) => (d.delta < a.delta ? d : a)) : null;
  const chosen = days.find((d) => d.k === pick) || null;
  const short = (iso) => new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`));
  const long = (iso) => new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));
  const go = (fn) => () => { onClose(); fn(); };

  const rows = [
    { key: 'dates', Icon: CalendarIcon, label: t('tp.cx.dates'), sub: t('tp.cx.datesSub'), onClick: tripStart && tripEnd ? () => { setPick(0); setView('dates'); } : null },
    { key: 'people', Icon: PersonIcon, label: t('tp.bar.who'), sub: t('tp.cx.whoSub'), onClick: open.people ? go(open.people) : null },
    { key: 'from', Icon: HomeIcon, label: t('tp.bar.from'), sub: t('tp.cx.fromSub'), onClick: open.from ? go(open.from) : null },
    { key: 'flights', Icon: PlaneIcon, label: t('tp.cx.flights'), sub: t('tp.cx.flightsSub'), onClick: open.flights ? go(open.flights) : null },
    { key: 'stay', Icon: BedIcon, label: t('tp.cx.stay'), sub: t('tp.cx.staySub'), onClick: open.stay ? go(open.stay) : null },
    { key: 'places', Icon: SwapIcon, label: t('tp.cx.place'), sub: t('tp.cx.placeSub'), onClick: open.places ? go(open.places) : null },
    { key: 'settings', Icon: SettingsIcon, label: t('tp.cx.all'), sub: '', onClick: open.settings ? go(open.settings) : null },
  ].filter((r) => r.onClick);

  return (
    <SheetShell title={view === 'dates' ? t('tp.cx.dates') : t('tp.change')} onClose={onClose} width={520} className="tpx-sheet" labelId="tpx-title">
      {view === 'menu' ? (
        <div className="tpx">
          <ul className="tpx-opts">
            {rows.map(({ key, Icon, label, sub, onClick }) => (
              <li key={key}>
                <Button variant="quiet" className="tpx-opt" onClick={onClick} data-opt={key} iconEnd={<ChevronRightIcon size={16} />}>
                  <span className="tpx-ic" aria-hidden="true"><Icon size={18} /></span>
                  <span className="tpx-txt"><b>{label}</b>{sub && <small>{sub}</small>}</span>
                </Button>
              </li>
            ))}
          </ul>
          {history && (history.canUndo || history.canRedo) && (
            <div className="tpx-hist">
              <span className="tpx-hist-h">{t('tp.cx.history')}</span>
              <span className="tpx-hist-acts">
                <Button variant="secondary" size="sm" iconStart={<UndoIcon size={16} />} disabled={!history.canUndo} onClick={history.undo}>{t('saved.undo')}</Button>
                <Button variant="secondary" size="sm" iconStart={<RedoIcon size={16} />} disabled={!history.canRedo} onClick={history.redo}>{t('tp.undo.redo')}</Button>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="tpx">
          <p className="tpx-note">{t('tp.cx.shift', { n: days[0]?.nights ?? nightsBetween(tripStart, tripEnd) })}</p>
          <div className="tpx-days" role="radiogroup" aria-label={t('tp.cx.dates')}>
            {days.map((d) => (
              <Button key={d.k} variant="secondary" size="sm" role="radio" aria-checked={d.k === pick}
                className={`tpx-day${d.k === pick ? ' is-on' : ''}${cheapest && d.k === cheapest.k && cheapest.delta < 0 ? ' is-best' : ''}`}
                aria-label={t('tp.cx.dayAria', { day: long(d.start), delta: d.k === 0 ? t('tp.cx.now') : deltaText(d.delta) || t('data.notYet') })}
                onClick={() => setPick(d.k)}>
                <span className="tpx-day-d">{short(d.start)}</span>
                <span className="tpx-day-x">{d.k === 0 ? t('tp.cx.now') : d.delta == null ? '' : `${d.delta < 0 ? '-' : '+'}${money(Math.abs(d.delta))}`}</span>
              </Button>
            ))}
          </div>
          {chosen && Number.isFinite(total) && (
            <dl className="tpx-impact">
              <div><dt>{t('tp.cx.now')}</dt><dd>{money(total)}</dd></div>
              <div className="is-new"><dt>{long(chosen.start)}</dt><dd>{chosen.delta == null ? t('data.notYet') : money(total + chosen.delta)}</dd></div>
              <div><dt>{t('tp.cx.diff')}</dt><dd className={chosen.delta < 0 ? 'is-less' : chosen.delta > 0 ? 'is-more' : ''}>{chosen.k === 0 ? t('tp.cx.same') : deltaText(chosen.delta) || t('data.notYet')}</dd></div>
            </dl>
          )}
          {flightsBooked && <p className="tpx-warn">{t('tp.cx.booked')}</p>}
          <div className="tpx-foot">
            <Button variant="secondary" onClick={() => setView('menu')}>{t('tp.cx.back')}</Button>
            <Button variant="primary" disabled={!chosen || chosen.k === 0} onClick={() => { onDates(chosen.start, chosen.end); onClose(); }}>{t('tp.cx.apply')}</Button>
          </div>
        </div>
      )}
    </SheetShell>
  );
}
