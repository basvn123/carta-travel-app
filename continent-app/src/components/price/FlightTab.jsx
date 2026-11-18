/**
 * The price sheet's Flight tab (D10, explore polish; spec flight-tab.md,
 * strings copy.md 3). Loaded on first open (React.lazy in PriceSheet), so
 * the list never pays for it.
 *
 * It shows the two flights behind the row's flight figure as route lines,
 * the cheapest checked flight of each day as bars, the flights of the
 * picked day from the planner's own search, and the other ticked home
 * airports. Every number is a Google Flights fare with its date and check
 * time; a day nobody checked has no bar, a swept flight never gets a
 * duration (only a searched one carries its own), and nothing here says
 * "exact" or "live".
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { fmtDate } from '../../lib/dates.js';
import { checkedLabel, stopsText } from '../../lib/flights/flightText.js';
import { googleFlightsLink } from '../../lib/flights/flights.js';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { barHeight } from '../../lib/flights/fareDays.js';
import { AirlineMark, HoursFilter } from '../flights/Flights.jsx';
import { PlaneIcon } from '../TransportIcons.jsx';
import { ExternalIcon } from '../Icons.jsx';
import { Button, Skeleton } from '../ui/index.js';
import NotYet from '../NotYet.jsx';
import { radioGroupKeyDown, useRovingRadios } from '../ui/radioGroup.js';
import { useFlightTab } from './useFlightTab.js';

const FIRST_ROWS = 4;
const nextDay = (dep, arr) => Boolean(dep && arr && arr < dep);
const durationOf = (t, min) => (Number.isFinite(min) && min > 0 ? t('flight.duration', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') }) : null);
const monthLabel = (ym, lang) => {
  try {
    return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
  } catch { return ym; }
};

export default function FlightTab({ place, data, request, view, active, onChangeTrip }) {
  const { t, lang } = useI18n();
  const ft = useFlightTab({ place, data, request, view, active });
  const airlines = useAirlines();
  const nameOf = (code) => airlineName(airlines, code) || code || '';
  const [waited, setWaited] = useState(false);
  React.useEffect(() => { const id = setTimeout(() => setWaited(true), 3000); return () => clearTimeout(id); }, []);

  const changeBtn = (primary) => (
    <Button variant={primary ? 'primary' : 'quiet'} block className={primary ? 'psheet-primary' : 'pft-second'} onClick={onChangeTrip}>
      {t('price.changeFlight')}
    </Button>
  );

  // No sweep file for the origin: nothing to draw, the one way on is to
  // change where the traveller flies from. Until the file has had a moment
  // to land, the tab says it is loading rather than "no prices".
  if (!ft.file || !ft.airport) {
    const origin = ft.selected || data?.meta?.selected_origin || null;
    if (!waited && !data?.flights) {
      return <p className="psheet-basis" role="status">{t('price.flight.loading')}</p>;
    }
    return (
      <div className="pft">
        <p className="psheet-lead">{origin ? t('price.flight.noAirport', { airport: origin }) : t('price.flight.noneAny', { place: place?.name || '' })}</p>
        <div className="psheet-foot">{changeBtn(true)}</div>
      </div>
    );
  }

  const { shown, figure } = ft;
  const unit = view?.total ? t('price.flight.unitGroup', { n: ft.party.seats }) : t('price.flight.unit');
  const w = request?.when || {};
  const month = w.kind === 'month' && w.ym ? monthLabel(w.ym, lang) : '';
  const noneKey = !ft.rowLegs ? (w.kind === 'exact' ? 'price.flight.noneNear' : w.kind === 'month' ? 'price.flight.noneMonth' : 'price.flight.noneAny') : null;
  const basisKey = {
    picked: 'price.flight.basisPicked', near: 'price.flight.basisNear', days: 'price.flight.basisDays',
    month: 'price.flight.basisMonth', any: 'price.flight.basisAny',
  }[ft.basis];
  const checks = [shown.out?.checked, shown.back?.checked].filter(Boolean).map((c) => checkedLabel(t, c));
  const checkLines = [...new Set(checks)];
  const hasBag = figure && figure.bags > 0;
  const link = shown.out && shown.back
    ? googleFlightsLink(ft.home, ft.airport, shown.out.date, { back: shown.back.date, lang })
    : null;

  return (
    <div className="pft">
      <h3 className="sr-only">{t('price.flight.title')}</h3>
      <div className="pft-head">
        <span className="pft-route" aria-label={t('price.flight.routeAria', { from: ft.home, to: ft.airport })}>
          <span aria-hidden="true">{ft.home} <span className="pft-route-arrow">&gt;</span> {ft.airport}</span>
        </span>
        {figure ? (
          <span className="pft-figrow">
            <span key={Math.round(figure.shown)} className="psheet-big money pft-fig">{formatMoney(figure.shown)}</span>
            <span className="psheet-unit">{unit}</span>
            {ft.picked && ft.rowFigure && ft.delta !== 0 && (
              <span className={`pft-delta ${ft.delta > 0 ? 'is-up' : 'is-down'}`} role="img"
                aria-label={t(ft.delta > 0 ? 'price.flight.deltaUp' : 'price.flight.deltaDown', { amount: formatMoney(Math.abs(ft.delta)) })}>
                {`${ft.delta > 0 ? '+' : '-'}${formatMoney(Math.abs(ft.delta))}`}
              </span>
            )}
          </span>
        ) : (
          <span className="pft-figrow"><NotYet className="psheet-big" /></span>
        )}
        {figure && ft.picked && ft.rowLegs && (
          <Button variant="quiet" type="button" className="psheet-raw pft-textbtn" onClick={ft.backToList}>{t('price.flight.backToList')}</Button>
        )}
        {figure && !ft.rowLegs && <p className="psheet-basis">{t('price.flight.notListPrice')}</p>}
        {!figure && noneKey && <p className="psheet-lead">{t(noneKey, { month, place: place?.name || '' })}</p>}
      </div>

      {(shown.out || shown.back) && (
        <LegCards ft={ft} t={t} nameOf={nameOf} wanted={w.kind === 'exact' ? { out: w.start, back: w.end } : null} />
      )}

      <FareStrip ft={ft} t={t} lang={lang} nameOf={nameOf} />
      {!figure && <p className="psheet-basis">{t('price.flight.tapDay')}</p>}

      {ft.leg && <DayFlights ft={ft} t={t} nameOf={nameOf} />}

      {ft.homes.length >= 2 && <HomeChips ft={ft} t={t} />}

      {figure && (
        <div className="pft-basis">
          <p className="psheet-basis">{t(basisKey, { month })}</p>
          {hasBag && <p className="psheet-basis">{t('price.flight.bagNote')}</p>}
          {figure && !figure.bagsKnown && <p className="psheet-basis">{t('flight.bagsExtra')}</p>}
          {ft.party.babies > 0 && <p className="psheet-basis">{t('price.flight.babies')}</p>}
          {checkLines.map((c) => <p className="psheet-basis" key={c}>{c}</p>)}
          <p className="psheet-basis">{t('flight.bookNote')}</p>
        </div>
      )}

      <div className="psheet-foot">
        {link ? (
          <>
            <Button variant="primary" block href={link} external className="psheet-primary pft-book" iconEnd={<ExternalIcon size={16} />}>
              {t('flight.book')}
            </Button>
            {changeBtn(false)}
          </>
        ) : changeBtn(true)}
      </div>
    </div>
  );
}

/** The two flights as radio cards: the picked one is the leg the strip and the day list look at. */
function LegCards({ ft, t, nameOf, wanted }) {
  const ref = useRef(null);
  useRovingRadios(ref);
  return (
    <div className="pft-legs" role="radiogroup" aria-label={t('price.flight.legsAria')} ref={ref} onKeyDown={radioGroupKeyDown}>
      {['out', 'back'].map((dir, i) => {
        const leg = ft.shown[dir];
        if (!leg) return null;
        const from = dir === 'out' ? ft.home : ft.airport;
        const to = dir === 'out' ? ft.airport : ft.home;
        const moved = wanted && leg.date !== wanted[dir];
        const stops = stopsText(t, leg.stops);
        const dur = leg.source === 'live' ? durationOf(t, leg.min) : null;
        const on = ft.dir === dir;
        const late = nextDay(leg.dep, leg.arr);
        const name = t('price.flight.legAria', {
          dir: t(`flight.${dir}`), date: fmtDate(leg.date, true), airline: nameOf(leg.airline),
          dep: leg.dep || '', arr: leg.arr || '', stops, price: formatMoney(leg.price),
        }) + (late ? `, ${t('price.flight.nextDayAria')}` : '');
        return (
          <Button variant="quiet" key={dir} type="button" role="radio" aria-checked={on} aria-label={name}
            className={`psheet-raw pft-leg${on ? ' is-on' : ''}`} style={{ '--i': i }} onClick={() => ft.setDir(dir)}>
            <span className="pft-leg-top" aria-hidden="true">
              <span className="pft-leg-dir">{t(`flight.${dir}`)}</span>
              <span className={`pft-leg-date${moved ? ' is-moved' : ''}`}>
                {fmtDate(leg.date, true)}{moved ? `, ${t('price.flight.nearest')}` : ''}
              </span>
              <span className="pft-leg-air"><AirlineMark code={leg.airline} size="sm" /><span className="pft-leg-name">{nameOf(leg.airline)}</span></span>
              <span className="pft-leg-fare money">{formatMoney(leg.price)}</span>
            </span>
            <span className="pft-leg-route" aria-hidden="true" key={`${leg.date}${leg.dep}`}>
              <span className="pft-end"><span className="pft-code">{from}</span><span className="pft-time">{leg.dep}</span></span>
              <span className="pft-line">
                <span className="pft-line-label">{dur ? `${stops}, ${dur}` : stops}</span>
                <span className="pft-line-bar" />
                {Array.from({ length: Math.min(3, Number(leg.stops) || 0) }, (_, k) => (
                  <span key={k} className="pft-stop" style={{ left: `${((k + 1) * 100) / ((Number(leg.stops) || 0) + 1)}%` }} />
                ))}
                <PlaneIcon size={16} className="pft-plane" />
              </span>
              <span className="pft-end is-to">
                <span className="pft-code">{to}</span>
                <span className="pft-time">{leg.arr}{late && <sup className="pft-plus1">{t('price.flight.nextDay')}</sup>}</span>
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}

/** The cheapest checked flight of each day, as bars from a zero baseline. */
function FareStrip({ ft, t, lang, nameOf }) {
  const ref = useRef(null);
  const scroller = useRef(null);
  useRovingRadios(ref);
  const days = ft.strip;
  const fares = days.filter((d) => d.state === 'fare');
  const max = fares.reduce((m, d) => Math.max(m, d.leg.price), 0);
  const cheapest = fares.reduce((b, d) => (!b || d.leg.price < b.leg.price ? d : b), null);
  const shownDate = ft.leg?.date || null;
  // The shown day sits in the middle on open, so the traveller sees the
  // days either side of it without a hunt.
  useLayoutEffect(() => {
    const el = scroller.current?.querySelector('.pft-day.is-on, .pft-day.is-wanted');
    if (el && scroller.current) scroller.current.scrollLeft = el.offsetLeft - scroller.current.clientWidth / 2 + el.offsetWidth / 2;
  }, [ft.dir]); // centre once per way, not on every pick
  if (!days.length) return null;
  const wkd = new Intl.DateTimeFormat(lang, { weekday: 'narrow', timeZone: 'UTC' });
  const mon = new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' });
  const far = ft.win.from && (Date.parse(`${ft.win.from}T00:00:00Z`) - Date.now()) / 86400000 > 14;
  let lastMonth = null;
  return (
    <section className="pft-strip">
      <div className="pft-label-row">
        <span className="pft-label">{t('price.flight.daysTitle')}</span>
        <span className="pft-label-unit">{t('price.flight.daysUnit')}</span>
      </div>
      <div className="pft-days" ref={scroller}>
        <div className="pft-days-row" role="radiogroup" ref={ref} onKeyDown={radioGroupKeyDown}
          aria-label={t(ft.dir === 'back' ? 'price.flight.daysBackAria' : 'price.flight.daysOutAria')}>
          {days.map((d, i) => {
            const at = new Date(`${d.date}T00:00:00Z`);
            const m = d.date.slice(0, 7);
            const newMonth = m !== lastMonth;
            lastMonth = m;
            const on = d.date === shownDate && d.state === 'fare';
            const isCheap = cheapest && d === cheapest;
            const date = fmtDate(d.date, true);
            const wanted = d.date === ft.win.wanted;
            let name;
            if (d.state === 'fare') {
              name = t('price.flight.barAria', { date, price: formatMoney(d.leg.price), airline: nameOf(d.leg.airline) })
                + (isCheap ? `, ${t('price.flight.barCheapest')}` : '');
            } else if (d.state === 'none') name = t('price.flight.barNone', { date });
            else if (d.state === 'before') name = t('price.flight.barBefore', { date });
            else name = t('price.flight.barUnchecked', { date });
            const dead = d.state !== 'fare';
            return (
              <Button variant="quiet" key={d.date} type="button" role="radio" aria-checked={on} aria-label={name}
                aria-disabled={dead || undefined}
                className={`psheet-raw pft-day is-${d.state}${on ? ' is-on' : ''}${isCheap ? ' is-cheap' : ''}${wanted ? ' is-wanted' : ''}`}
                style={{ '--i': i }}
                onClick={() => ft.pickDay(d)}>
                <span className="pft-bar-zone" aria-hidden="true">
                  {d.state === 'fare' && (on || isCheap) && <span className="pft-bar-price money">{formatMoney(d.leg.price)}</span>}
                  {d.state === 'fare' || (d.state === 'before' && d.leg)
                    ? <span className="pft-bar" style={{ height: barHeight(d.leg.price, max) }} />
                    : <span className="pft-ring" />}
                </span>
                <span className="pft-day-label" aria-hidden="true">
                  <span>{wkd.format(at)}</span>
                  <span className="pft-day-num">{at.getUTCDate()}</span>
                  <span className="pft-day-mon">{newMonth ? mon.format(at) : ' '}</span>
                </span>
                {wanted && <span className="pft-wanted" aria-hidden="true" />}
              </Button>
            );
          })}
        </div>
      </div>
      {far && <p className="psheet-basis">{t('price.flight.weekly')}</p>}
    </section>
  );
}

/** The flights of the picked day from the planner's search, cheapest first. */
function DayFlights({ ft, t, nameOf }) {
  const ref = useRef(null);
  const [all, setAll] = useState(false);
  useRovingRadios(ref);
  const date = fmtDate(ft.leg.date, true);
  const rows = ft.day.known ? ft.day.rows : [];
  const max = rows.reduce((m, r) => Math.max(m, r.leg.price || 0), 0);
  const list = all ? rows : rows.slice(0, FIRST_ROWS);
  const shown = ft.leg;
  return (
    <section className="pft-dayflights" aria-busy={ft.dayState === 'loading' || undefined}>
      <div className="pft-label-row">
        <span className="pft-label">{t('price.flight.dayTitle', { date })}</span>
        <HoursFilter value={ft.hours} onChange={ft.setHours} />
      </div>
      {ft.dayState === 'loading' && (
        <>
          <p className="psheet-basis" role="status">{t('price.flight.dayLoading')}</p>
          <div className="pft-skel" aria-hidden="true"><Skeleton h={40} /><Skeleton h={40} /><Skeleton h={40} /></div>
        </>
      )}
      {ft.dayState === 'failed' && <p className="psheet-basis" role="status">{t('price.flight.dayFailed')}</p>}
      {ft.dayState === 'ready' && ft.answer?.flights?.length === 0 && <p className="psheet-basis">{t('price.flight.dayEmpty')}</p>}
      {ft.dayState === 'ready' && ft.answer?.flights?.length > 0 && !rows.length && <p className="psheet-basis">{t('price.flight.dayNoneInHours')}</p>}
      {ft.dayState === 'ready' && rows.length > 0 && (
        <div className="pft-rows" role="radiogroup" aria-label={t('price.flight.dayTitle', { date })} ref={ref} onKeyDown={radioGroupKeyDown}>
          {list.map((r, i) => {
            const f = r.leg;
            const on = Boolean(shown && f.airline === shown.airline && f.dep === shown.dep && f.arr === shown.arr);
            const stops = stopsText(t, f.stops);
            const dur = durationOf(t, f.min) || '';
            return (
              <Button variant="quiet" key={`${f.airline}${f.dep}${f.arr}${i}`} type="button" role="radio" aria-checked={on}
                aria-label={t('price.flight.rowAria', { airline: nameOf(f.airline), dep: f.dep || '', arr: f.arr || '', stops, duration: dur, price: formatMoney(f.price) })}
                className={`psheet-raw pft-row${on ? ' is-on' : ''}`} style={{ '--i': i }} onClick={() => ft.pickLive(f)}>
                <AirlineMark code={f.airline} size="sm" />
                <span className="pft-row-main" aria-hidden="true">
                  <span className="pft-row-times">{t('price.flight.routeAria', { from: f.dep || '', to: f.arr || '' })}</span>
                  <span className="pft-row-meta">{[nameOf(f.airline), stops, dur].filter(Boolean).join(', ')}</span>
                  {r.current && <span className="pft-row-inlist">{t('price.flight.inList')}</span>}
                </span>
                <span className="pft-row-fare" aria-hidden="true">
                  <span className="money">{formatMoney(f.price)}</span>
                  <span className="pft-row-bar" style={{ width: `${max > 0 ? Math.max(8, Math.round((f.price / max) * 100)) : 0}%` }} />
                </span>
              </Button>
            );
          })}
        </div>
      )}
      {ft.dayState === 'ready' && rows.length > FIRST_ROWS && !all && (
        <Button variant="quiet" type="button" className="psheet-raw pft-textbtn" onClick={() => setAll(true)}>{t('price.flight.showAll', { n: rows.length })}</Button>
      )}
      {ft.dayState === 'ready' && ft.answer?.checked && (
        <p className="psheet-basis">{checkedLabel(t, Date.parse(ft.answer.checked))}</p>
      )}
    </section>
  );
}

/** The pair from each ticked home airport; a preview, the trip stays as set. */
function HomeChips({ ft, t }) {
  const ref = useRef(null);
  useRovingRadios(ref);
  const priced = ft.homes.filter((h) => h.perPerson != null);
  const cheapest = priced.reduce((b, h) => (!b || h.perPerson < b.perPerson ? h : b), null);
  return (
    <section className="pft-homes">
      <div className="pft-chips" role="radiogroup" aria-label={t('price.flight.homesAria')} ref={ref} onKeyDown={radioGroupKeyDown}>
        {ft.homes.map((h) => {
          const on = h.iata === ft.home;
          const none = h.perPerson == null;
          return (
            <Button variant="quiet" key={h.iata} type="button" role="radio" aria-checked={on} aria-disabled={none || undefined}
              aria-label={none ? t('price.flight.homeNoneAria', { airport: h.iata }) : t('price.flight.homeChipAria', { airport: h.iata, price: formatMoney(h.perPerson) })}
              className={`psheet-raw pft-chip${on ? ' is-on' : ''}${h === cheapest ? ' is-cheap' : ''}`}
              onClick={() => { if (!none) ft.pickHome(h.iata); }}>
              <span aria-hidden="true">{h.iata} {none ? t('price.flight.homeNone') : formatMoney(h.perPerson)}</span>
            </Button>
          );
        })}
      </div>
      <p className="psheet-basis">{t('price.flight.homesNote')}</p>
    </section>
  );
}
