/**
 * The flights screen (D10, G12; decision 2026-11-19 section 3). The receipt's
 * plane row opens it inside the price sheet, under the shell's own title
 * "Flights to {place}" (requests-A.md), so this draws no title. Loaded on
 * first open (React.lazy in PriceSheet), so the list never pays for it.
 *
 * Top to bottom: the return a person (the cards' own figure until another
 * flight is picked), the two legs as a switch, the cheapest checked fare of
 * each day as bars, every flight of the shown day live from Google Flights,
 * the other ticked home airports, and the link to Google Flights with an
 * info button holding the source, the check date and "it may change".
 *
 * Honesty: every figure is a person's (owner: flights always per person); a
 * day is a bar only with a fresh fare, and a long run of unchecked days is a
 * visible break; "no flight" is said only from the live search, which looks
 * for every kind of flight (a swept empty day may come from a direct-only
 * search); a typical fare says so behind the info button; a missing figure
 * is Not yet.
 */
import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { fmtDate } from '../../lib/dates.js';
import { stopsText } from '../../lib/flights/flightText.js';
import { googleFlightsLink } from '../../lib/flights/flights.js';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { barHeight } from '../../lib/flights/fareDays.js';
import { AirlineMark, HoursFilter } from '../flights/Flights.jsx';
import { ExternalIcon } from '../Icons.jsx';
import { Button, Skeleton } from '../ui/index.js';
import { Pressable } from '../ui/Pressable.jsx';
import NotYet from '../NotYet.jsx';
import { radioGroupKeyDown, useRovingRadios } from '../ui/radioGroup.js';
import { useFlightTab } from './useFlightTab.js';
import '../../styles/87-flights-screen.css';

// Ten rows fill a phone screen; the rest wait behind "Show all n".
export const FIRST_ROWS = 10;
const nextDay = (dep, arr) => Boolean(dep && arr && arr < dep);
const durationOf = (t, min) => (Number.isFinite(min) && min > 0 ? t('flight.duration', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') }) : null);
const monthLabel = (ym, lang) => {
  try {
    return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
  } catch { return ym; }
};

/* House line glyphs (HouseIcons' 1.75 stroke, square caps), local to this screen. */
function ArrowGlyph() {
  return (
    <svg className="fls-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
      <path d="M4 12h15" /><path d="M14 6.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}
function InfoGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" /><path d="M12 10.5v6" /><path d="M11.1 7h1.8" strokeWidth="2.4" />
    </svg>
  );
}

function Times({ dep, arr, t }) {
  return (
    <span className="fls-times">
      <span>{dep}</span><ArrowGlyph /><span>{arr}</span>
      {nextDay(dep, arr) && <sup className="fls-plus1">{t('price.flight.nextDay')}</sup>}
    </span>
  );
}

export default function FlightTab({ place, data, request, active, onChangeTrip, way = null }) {
  const { t, lang } = useI18n();
  const ft = useFlightTab({ place, data, request, way, active });
  const airlines = useAirlines();
  const nameOf = (code, fallback = '') => airlineName(airlines, code) || fallback || code || '';
  const [waited, setWaited] = useState(false);
  React.useEffect(() => { const id = setTimeout(() => setWaited(true), 3000); return () => clearTimeout(id); }, []);

  const changeBtn = (primary) => (
    <Button variant={primary ? 'primary' : 'quiet'} block className="fls-change" onClick={onChangeTrip}>
      {t('price.changeFlight')}
    </Button>
  );

  // No sweep file for the origin: nothing to draw, the one way on is to
  // change where the traveller flies from. Until the file has had a moment
  // to land, the screen says it is loading rather than "no prices".
  if (!ft.file || !ft.airport) {
    const origin = ft.selected || data?.meta?.selected_origin || null;
    if (!waited && !data?.flights) {
      return <p className="fls-sub" role="status">{t('price.flight.loading')}</p>;
    }
    return (
      <div className="fls">
        <p className="fls-lead">{origin ? t('price.flight.noAirport', { airport: origin }) : t('price.flight.noneAny', { place: place?.name || place?.city || '' })}</p>
        <div className="fls-foot">{changeBtn(true)}</div>
      </div>
    );
  }

  const { shown, figure, headline } = ft;
  const w = request?.when || {};
  const month = w.kind === 'month' && w.ym ? monthLabel(w.ym, lang) : '';
  const noneKey = !ft.rowLegs ? (w.kind === 'exact' ? 'price.flight.noneNear' : w.kind === 'month' ? 'price.flight.noneMonth' : 'price.flight.noneAny') : null;
  // The fares and bags line only where its parts make the headline.
  const split = headline && !headline.typical && figure?.split && Math.abs(figure.perPerson - headline.eur) < 0.01 ? figure.split : null;
  const link = shown.out && shown.back
    ? googleFlightsLink(ft.home, ft.airport, shown.out.date, { back: shown.back.date, lang })
    : null;

  return (
    <div className="fls">
      <div className="fls-head">
        <p className="fls-fig">
          {headline ? (
            <>
              <span key={Math.round(headline.eur)} className="fls-eur money">{formatMoney(headline.eur)}</span>
              <span className="fls-unit">{t('price.flight.unit')}</span>
              {ft.delta != null && ft.delta !== 0 && (
                <span className={`fls-delta ${ft.delta > 0 ? 'is-up' : 'is-down'}`} role="img"
                  aria-label={t(ft.delta > 0 ? 'price.flight.deltaUp' : 'price.flight.deltaDown', { amount: formatMoney(Math.abs(ft.delta)) })}>
                  {`${ft.delta > 0 ? '+' : '-'}${formatMoney(Math.abs(ft.delta))}`}
                </span>
              )}
            </>
          ) : <NotYet className="fls-eur" />}
        </p>
        {split && <p className="fls-sub">{t('price.flight.split', { fares: formatMoney(split.fares), bags: formatMoney(split.bags) })}</p>}
        {headline && !headline.typical && !ft.rowLegs && <p className="fls-sub">{t('price.flight.notListPrice')}</p>}
        {ft.picked && ft.rowLegs && (
          <Pressable className="fls-textbtn" onClick={ft.backToList}>{t('price.flight.backToList')}</Pressable>
        )}
        {!headline && <p className="fls-lead">{t('settingsSum.noFlight')}</p>}
        {!headline && noneKey && <p className="fls-sub">{t(noneKey, { month, place: place?.name || place?.city || '' })}</p>}
      </div>

      {(shown.out || shown.back) && (
        <LegSwitch ft={ft} t={t} nameOf={nameOf} wanted={w.kind === 'exact' ? { out: w.start, back: w.end } : null} />
      )}

      <DayBars ft={ft} t={t} lang={lang} nameOf={nameOf} />
      {!headline && ft.strip.length > 0 && <p className="fls-sub">{t('price.flight.tapDay')}</p>}

      {ft.leg && <DayList ft={ft} t={t} nameOf={nameOf} />}

      {ft.homes.length >= 2 && <HomeChips ft={ft} t={t} />}

      {figure && (figure.bags > 0 || !figure.bagsKnown || ft.party.babies > 0) && (
        <div className="fls-notes">
          {figure.bags > 0 && !split && <p className="fls-sub">{t('price.flight.bagNote')}</p>}
          {!figure.bagsKnown && <p className="fls-sub">{t('flight.bagsExtra')}</p>}
          {ft.party.babies > 0 && <p className="fls-sub">{t('price.flight.babies')}</p>}
        </div>
      )}

      <div className="fls-foot">
        {link || headline?.typical ? (
          <>
            <BookLink href={link} checked={ft.checked} typical={Boolean(headline?.typical)} t={t}
              instead={link ? null : changeBtn(true)} />
            {link && changeBtn(false)}
          </>
        ) : changeBtn(true)}
      </div>
    </div>
  );
}

/**
 * "Book on Google Flights" and its info button. The source, the check date
 * and "it may change" live behind the button (owner 2026-11-19), so the
 * warning every booking link carries is one tap away, never a line of text.
 */
// A typical fare says so here too, not under the figure (owner 2026-11-20);
// without a pair to link to, `instead` (the change button) takes the link's place.
function BookLink({ href, checked, typical = false, instead = null, t }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const date = Number.isFinite(checked) ? fmtDate(new Date(checked).toISOString().slice(0, 10)) : null;
  const text = typical ? t('price.flight.infoTypical')
    : date ? t('price.flight.info', { date }) : t('price.flight.infoNoDate');
  return (
    <div className="fls-book">
      <div className="fls-book-row">
        {href ? (
          <Button variant="primary" block href={href} external className="fls-book-link" iconEnd={<ExternalIcon size={16} />}>
            {t('price.flight.book')}
          </Button>
        ) : <span className="fls-book-link">{instead}</span>}
        <Pressable className={`fls-info-btn${open ? ' is-open' : ''}`} aria-expanded={open} aria-controls={id}
          aria-label={t('price.flight.infoLabel')} title={t('price.flight.infoLabel')}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
          <InfoGlyph />
        </Pressable>
      </div>
      <p id={id} className="fls-info" hidden={!open}>{text}</p>
    </div>
  );
}

/** The two flights as a switch: the picked one is the leg the bars and the list look at. */
function LegSwitch({ ft, t, nameOf, wanted }) {
  const ref = useRef(null);
  useRovingRadios(ref);
  return (
    <div className="fls-legs" role="radiogroup" aria-label={t('price.flight.legsAria')} ref={ref} onKeyDown={radioGroupKeyDown}>
      {['out', 'back'].map((dir) => {
        const leg = ft.shown[dir];
        if (!leg) return <span key={dir} className="fls-leg is-empty" aria-hidden="true" />;
        const moved = wanted && leg.date !== wanted[dir];
        const stops = stopsText(t, leg.stops);
        const on = ft.dir === dir;
        const late = nextDay(leg.dep, leg.arr);
        const name = t('price.flight.legAria', {
          dir: t(`flight.${dir}`), date: fmtDate(leg.date, true), airline: nameOf(leg.airline),
          dep: leg.dep || '', arr: leg.arr || '', stops, price: formatMoney(leg.price),
        }) + (late ? `, ${t('price.flight.nextDayAria')}` : '');
        return (
          <Pressable key={dir} role="radio" aria-checked={on} aria-label={name}
            className={`fls-leg${on ? ' is-on' : ''}`} onClick={() => ft.setDir(dir)}>
            <span className="fls-leg-top" aria-hidden="true">
              <span className="fls-leg-dir">{t(`flight.${dir}`)}</span>
              <span className="fls-leg-fare money">{formatMoney(leg.price)}</span>
            </span>
            <span className={`fls-leg-date${moved ? ' is-moved' : ''}`} aria-hidden="true">
              {fmtDate(leg.date, true)}{moved ? `, ${t('price.flight.nearest')}` : ''}
            </span>
            <span className="fls-leg-flight" aria-hidden="true">
              <AirlineMark code={leg.airline} size="sm" />
              <Times dep={leg.dep} arr={leg.arr} t={t} />
            </span>
          </Pressable>
        );
      })}
    </div>
  );
}

/** The cheapest checked fare of each day, as bars from a zero baseline, with breaks over long gaps. */
function DayBars({ ft, t, lang, nameOf }) {
  const ref = useRef(null);
  const scroller = useRef(null);
  const labelId = useId();
  useRovingRadios(ref);
  const cols = ft.strip;
  const days = cols.filter((c) => !c.gap);
  const max = days.reduce((m, d) => Math.max(m, d.leg.price), 0);
  const low = days.reduce((m, d) => Math.min(m, d.leg.price), Infinity);
  const shownDate = ft.leg?.date || null;
  // The shown day sits in the middle on open, so the traveller sees the
  // days either side of it without a hunt.
  useLayoutEffect(() => {
    const el = scroller.current?.querySelector('.fls-day.is-on, .fls-day.is-wanted');
    if (el && scroller.current) scroller.current.scrollLeft = el.offsetLeft - scroller.current.clientWidth / 2 + el.offsetWidth / 2;
  }, [ft.dir]); // centre once per way, not on every pick
  if (!days.length) return null;
  const wkd = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
  const mon = new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' });
  let lastMonth = null;
  return (
    <section className="fls-days" aria-labelledby={labelId}>
      <div className="fls-label-row">
        <h3 className="fls-label" id={labelId}>{t('price.flight.daysTitle')}</h3>
        <span className="fls-label-unit">{t('price.flight.daysUnit')}</span>
      </div>
      <div className="fls-strip" ref={scroller}>
        <div className="fls-strip-row" role="radiogroup" ref={ref} onKeyDown={radioGroupKeyDown}
          aria-label={t(ft.dir === 'back' ? 'price.flight.daysBackAria' : 'price.flight.daysOutAria')}>
          {cols.map((c, i) => {
            if (c.gap) return <span key={c.key} className="fls-gap" aria-hidden="true"><span className="fls-gap-mark" /></span>;
            const at = new Date(`${c.date}T00:00:00Z`);
            const m = c.date.slice(0, 7);
            const newMonth = m !== lastMonth;
            lastMonth = m;
            const on = c.date === shownDate;
            const cheap = c.leg.price === low;
            const wanted = c.date === ft.win.wanted;
            const name = t('price.flight.barAria', { date: fmtDate(c.date, true), price: formatMoney(c.leg.price), airline: nameOf(c.leg.airline) })
              + (cheap ? `, ${t('price.flight.barCheapest')}` : '') + (wanted ? `, ${t('price.flight.barYourDay')}` : '');
            return (
              <Pressable key={c.date} role="radio" aria-checked={on} aria-label={name}
                className={`fls-day${on ? ' is-on' : ''}${cheap ? ' is-cheap' : ''}${wanted ? ' is-wanted' : ''}`}
                style={{ '--i': i }} onClick={() => ft.pickDay(c)}>
                <span className="fls-bar-zone" aria-hidden="true">
                  {(on || cheap) && <span className="fls-bar-price money">{formatMoney(c.leg.price)}</span>}
                  <span className="fls-bar" style={{ height: barHeight(c.leg.price, max, { h: 64 }) }} />
                </span>
                <span className="fls-day-label" aria-hidden="true">
                  <span className="fls-day-wkd">{wkd.format(at)}</span>
                  <span className="fls-day-num">{at.getUTCDate()}</span>
                  <span className="fls-day-mon">{newMonth ? mon.format(at) : ' '}</span>
                </span>
              </Pressable>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Every flight of the shown day, live from Google Flights, cheapest first. */
function DayList({ ft, t, nameOf }) {
  const ref = useRef(null);
  const labelId = useId();
  const [all, setAll] = useState(false);
  useRovingRadios(ref);
  const date = fmtDate(ft.leg.date, true);
  const rows = ft.day.known ? ft.day.rows : [];
  const low = rows.reduce((m, r) => Math.min(m, r.leg.price), Infinity);
  const list = all ? rows : rows.slice(0, FIRST_ROWS);
  const shown = ft.leg;
  const state = ft.dayState;
  return (
    <section className="fls-list" aria-labelledby={labelId} aria-busy={state === 'loading' || undefined}>
      <h3 className="fls-label" id={labelId}>{t('price.flight.dayTitle', { date })}</h3>
      <HoursFilter value={ft.hours} onChange={ft.setHours} />
      {state === 'loading' && (
        <>
          <p className="sr-only" role="status">{t('price.flight.dayLoading')}</p>
          <div className="fls-skel" aria-hidden="true">
            {[0, 1, 2].map((k) => (
              <span key={k} className="fls-skel-row">
                <Skeleton w={36} h={36} />
                <span className="fls-skel-lines"><Skeleton w="46%" h={14} /><Skeleton w="70%" h={12} /></span>
                <Skeleton w={44} h={16} />
              </span>
            ))}
          </div>
        </>
      )}
      {state === 'error' && (
        <div className="fls-error" role="status">
          <p className="fls-sub">{t(ft.dayReason === 'rate' ? 'price.flight.dayBusy' : 'price.flight.dayNoAnswer')}</p>
          <Button variant="secondary" size="sm" onClick={ft.retryDay}>{t('price.retry')}</Button>
        </div>
      )}
      {state === 'ready' && ft.answer?.flights?.length === 0 && <p className="fls-sub">{t('price.flight.dayEmpty')}</p>}
      {state === 'ready' && ft.answer?.flights?.length > 0 && !rows.length && <p className="fls-sub">{t('price.flight.dayNoneInHours')}</p>}
      {state === 'ready' && rows.length > 0 && (
        <div className="fls-rows" role="radiogroup" aria-label={t('price.flight.dayTitle', { date })} ref={ref} onKeyDown={radioGroupKeyDown}>
          {list.map((r, i) => {
            const f = r.leg;
            const on = Boolean(shown && f.airline === shown.airline && f.dep === shown.dep && f.arr === shown.arr);
            const stops = stopsText(t, f.stops);
            const dur = durationOf(t, f.min) || '';
            const name = nameOf(f.airline, f.airlineName);
            const cheap = f.price === low;
            return (
              <Pressable key={`${f.airline}${f.dep}${f.arr}${i}`} role="radio" aria-checked={on}
                aria-label={t('price.flight.rowAria', { airline: name, dep: f.dep || '', arr: f.arr || '', stops, duration: dur, price: formatMoney(f.price) })
                  + (cheap ? `, ${t('price.flight.cheapest')}` : '')}
                className={`fls-row${on ? ' is-on' : ''}`} onClick={() => ft.pickLive(f)}>
                <AirlineMark code={f.airline} size="md" />
                <span className="fls-row-main" aria-hidden="true">
                  <Times dep={f.dep} arr={f.arr} t={t} />
                  <span className="fls-row-meta">{[name, dur, stops].filter(Boolean).join(', ')}</span>
                </span>
                <span className="fls-row-fare" aria-hidden="true">
                  <span className="money">{formatMoney(f.price)}</span>
                  {cheap && <span className="fls-tag">{t('price.flight.cheapest')}</span>}
                  {!cheap && r.current && <span className="fls-tag is-list">{t('price.flight.inList')}</span>}
                </span>
              </Pressable>
            );
          })}
        </div>
      )}
      {state === 'ready' && rows.length > FIRST_ROWS && !all && (
        <Pressable className="fls-textbtn" onClick={() => setAll(true)}>{t('price.flight.showAll', { n: rows.length })}</Pressable>
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
    <section className="fls-homes">
      <div className="fls-chips" role="radiogroup" aria-label={t('price.flight.homesAria')} ref={ref} onKeyDown={radioGroupKeyDown}>
        {ft.homes.map((h) => {
          const on = h.iata === ft.home;
          const none = h.perPerson == null;
          return (
            <Pressable key={h.iata} role="radio" aria-checked={on} aria-disabled={none || undefined}
              aria-label={none ? t('price.flight.homeNoneAria', { airport: h.iata }) : t('price.flight.homeChipAria', { airport: h.iata, price: formatMoney(h.perPerson) })}
              className={`fls-chip${on ? ' is-on' : ''}${h === cheapest ? ' is-cheap' : ''}`}
              onClick={() => { if (!none) ft.pickHome(h.iata); }}>
              <span aria-hidden="true"><b>{h.iata}</b> {none ? t('price.flight.homeNone') : formatMoney(h.perPerson)}</span>
            </Pressable>
          );
        })}
      </div>
      <p className="fls-sub">{t('price.flight.homesNote')}</p>
    </section>
  );
}
