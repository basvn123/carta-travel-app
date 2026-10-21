import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PoiThumb } from './DayActivityRows.jsx';
import { isMustSee, poiKind, poiMapCat } from './dayDraft.js';
import { useI18n } from '../i18n/index.jsx';
import {
  RouteIcon, StarIcon, ChevronDownIcon, CloseIcon, ShoeIcon, BusIcon, CarIcon,
  DiningIcon, HomeIcon, ClockIcon, SparkIcon, PlusIcon, MoreIcon, TicketIcon, CheckIcon,
} from '../components/Icons.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { DAY_BANDS, dayPhase, fmtClock, fmtClockLoose } from './daySchedule.js';
import { DETAIL_LEVELS } from './dayDetail.js';
import { formatMoney } from '../lib/money.js';
import { fmtDur, fmtKm } from './dayFormat.js';
import { googleMapsDirUrl } from '../lib/routing.js';
import { durationMs } from '../lib/motion.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { isWalkable } from '../lib/dayRoute.js';

/**
 * Close a popover on outside click and on Escape.
 *
 * T409 (brief V5-2): when the popover holds a role="menu", focus moves to its
 * first item as it opens, ArrowDown, ArrowUp, Home and End walk the items, and
 * Escape hands focus back to the button that opened it, so a keyboard or a
 * screen reader never loses its place.
 */
export function useDismiss(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector('[role="menu"] [role^="menuitem"]:not(:disabled)')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const root = ref.current;
    const items = () => [...(root?.querySelectorAll('[role="menu"] [role^="menuitem"]:not(:disabled)') || [])];
    const onDown = (e) => { if (!ref.current?.contains(e.target)) close(); };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        const had = root?.contains(document.activeElement);
        close();
        if (had) root.querySelector('button[aria-expanded]')?.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !root?.contains(document.activeElement)) return;
      const list = items();
      if (!list.length) return;
      e.preventDefault();
      const at = list.indexOf(document.activeElement);
      let to = 0;
      if (e.key === 'ArrowDown') to = (at + 1) % list.length;
      else if (e.key === 'ArrowUp') to = (at <= 0 ? list.length : at) - 1;
      else if (e.key === 'End') to = list.length - 1;
      list[to].focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** A line of the day's figures that settles in place when they change: one
 *  opacity dip through the shared primitive, no count-up (design direction
 *  v6, part 2.3). `value` is the string of figures it shows. */
export function SettledLine({ className, value, children }) {
  const ref = useRef(null);
  useSettledFigure(ref, value);
  return <div className={className} ref={ref}>{children}</div>;
}

/** A stable key per stop, so React keeps a row's element when it moves. */
function stopKeys(items) {
  const seen = new Map();
  return items.map((it) => {
    const base = String(it.id ?? it.name ?? '');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base}#${n}` : base;
  });
}

/** Slide rows to their new place after a reorder (FLIP, under --dur-2). */
function useRowSlide(listRef, keys) {
  const tops = useRef(new Map());
  const sig = keys.join('|');
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.querySelectorAll('[data-key]')];
    const next = new Map();
    rows.forEach((el) => { next.set(el.dataset.key, el.getBoundingClientRect().top); });
    const prev = tops.current;
    tops.current = next;
    if (!prev.size) return;
    const dur = durationMs('--dur-2');
    if (!dur) return;
    let ease = '';
    try { ease = getComputedStyle(document.documentElement).getPropertyValue('--ease-in-out').trim(); } catch { /* no DOM */ }
    rows.forEach((el) => {
      const before = prev.get(el.dataset.key);
      const now = next.get(el.dataset.key);
      if (before == null || now == null || Math.abs(before - now) < 1 || typeof el.animate !== 'function') return;
      el.animate(
        [{ transform: `translateY(${before - now}px)` }, { transform: 'translateY(0)' }],
        { duration: dur, easing: ease || 'ease-in-out' },
      );
    });
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps -- value key: the order of the stops is the only change that should slide
}

/** A leg between two rows of the timeline: a checked walk, or the ride a
 *  traveller should take instead, with the directions one tap away. */
function LegRow({ leg, from, to, t, lang, stepFree }) {
  if (!leg) return null;
  const walk = isWalkable(leg.status) && !leg.ride;
  const transitUrl = from && to ? googleMapsDirUrl([from, to], leg.ride && leg.mode === 'car' ? 'driving' : 'transit') : null;
  const walkUrl = from && to ? googleMapsDirUrl([from, to], 'walking') : null;
  if (walk) {
    return (
      <li className={`dayt-leg${leg.status === 'long' ? ' is-long' : ''}`}>
        <span className="dayt-time" aria-hidden="true" />
        <span className="dayt-rail" aria-hidden="true"><ShoeIcon size={14} /></span>
        <span className="dayt-leg-text">
          {leg.ferry
            ? t('dayws.legFerry', { min: leg.min ?? '?' })
            : t('dayws.legWalk', { min: leg.min ?? '?', km: fmtKm(leg.km, lang) })}
          {leg.status === 'long' && (
            <>
              {' '}<span className="dayt-flag">{t(stepFree ? 'dayws.legLongStepFree' : 'dayws.legLong')}</span>
              {/* T435 (T463-c): a space between the flag's sentence and the link. */}
              {transitUrl && <>{' '}<a className="dayt-link" href={transitUrl} target="_blank" rel="noreferrer">{t('dayws.legTransit')}</a></>}
            </>
          )}
          {!leg.checked && <span className="dayt-est"> {t('money.est')}</span>}
        </span>
        {walkUrl && leg.status !== 'long' && (
          <a className="dayt-link dayt-link-quiet" href={walkUrl} target="_blank" rel="noreferrer">{t('dayws.legDirections')}</a>
        )}
      </li>
    );
  }
  const Icon = leg.mode === 'car' ? CarIcon : BusIcon;
  const why = leg.ride ? null
    : leg.status === 'detour' ? t('dayws.legWhyDetour')
      : leg.status === 'far' ? t('dayws.legWhyFar')
        : leg.status === 'unreachable' ? t('dayws.legWhyOffPath')
          : t('dayws.legWhyNoPath');
  return (
    <li className="dayt-leg is-ride">
      <span className="dayt-time" aria-hidden="true" />
      <span className="dayt-rail" aria-hidden="true"><Icon size={14} /></span>
      <span className="dayt-leg-text">
        {why && <span className="dayt-flag">{why}</span>}{' '}
        {t(leg.mode === 'car' ? 'dayws.legDrive' : 'dayws.legRide', { min: leg.min ?? '?' })}
        <span className="dayt-est"> {t('money.est')}</span>
      </span>
      {(leg.dirUrl || transitUrl) && (
        <a className="dayt-link" href={leg.dirUrl || transitUrl} target="_blank" rel="noreferrer">{t('dayws.legDirections')}</a>
      )}
    </li>
  );
}

/** "Check hours": the catalogue holds no opening hours yet, so the day never
 *  claims a place is open; it opens the place on Google Maps, where its hours
 *  and today's exceptions are. */
function hoursUrl(item, city) {
  if (!Number.isFinite(item?.lat)) return null;
  const q = [item.name, city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** A phone's stop tools: one button, the three actions in a menu, so a row
 *  is one line of controls wide rather than three stacked 44 px buttons.
 *  Moving crosses the parts of the day (T501): the menu says what it does. */
function StopMenu({ canEarlier, canLater, onMoveUp, onMoveDown, onRemove, name, t }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const pick = (fn) => () => { setOpen(false); fn(); };
  return (
    <span className="dayt-menu" ref={ref}>
      <IconButton
        className="dayt-tool"
        label={t('dayws.stopActions', { name })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      ><MoreIcon size={18} /></IconButton>
      {open && (
        <span className="dayp-menu dayt-menu-pop" role="menu">
          <Button variant="quiet" role="menuitem" className="dayp-menu-item" disabled={!canEarlier} onClick={pick(onMoveUp)}
            iconStart={<ChevronDownIcon size={16} className="dayt-tool-up" />}>{t('dayws.moveUp')}</Button>
          <Button variant="quiet" role="menuitem" className="dayp-menu-item" disabled={!canLater} onClick={pick(onMoveDown)}
            iconStart={<ChevronDownIcon size={16} />}>{t('dayws.moveDown')}</Button>
          <Button variant="quiet" role="menuitem" className="dayp-menu-item" onClick={pick(onRemove)}
            iconStart={<CloseIcon size={16} />}>{t('dayws.removeStop')}</Button>
        </span>
      )}
    </span>
  );
}

/** The ticket line on a stop (T501, owner T492-d): a price Carta knows, or
 *  the plain fact that there is one without a price. Nothing for no fee. */
function TicketLine({ ticket, t, lang }) {
  if (!ticket || (ticket.kind !== 'known' && ticket.kind !== 'unknown')) return null;
  if (ticket.kind === 'unknown') {
    return <span className="dayt-ticket"><TicketIcon size={14} /> {t('dayws.ticketUnknown')}</span>;
  }
  const precision = Math.round(ticket.eur) === ticket.eur ? 'whole' : 'cents';
  return (
    <span className="dayt-ticket">
      <TicketIcon size={14} /> {t('dayws.ticket', { price: formatMoney(ticket.eur, { precision, locale: lang }) })}
    </span>
  );
}

function StopRow({
  item, n, canEarlier, canLater, time, dwell, flash, onMoveUp, onMoveDown, onRemove, rowRef, rowKey,
  onHoverChange, offPathM, city, compact, ticket, t, lang,
}) {
  const url = hoursUrl(item, city);
  return (
    <li
      className={`dayt-stop${flash ? ' flash' : ''}`}
      ref={rowRef}
      data-key={rowKey}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
    >
      <span className="dayt-time">{time}{n === 1 && time && <small className="dayt-est"> {t('money.est')}</small>}</span>
      <span className="dayt-mark">
        <PoiThumb img={item.img} cat={poiMapCat(item)} name={item.name} />
        <span className="dayt-no">{n}</span>
      </span>
      <span className="dayt-body">
        <span className="dayt-name">
          {item.name}
          {isMustSee(item) && <span className="dayt-must" title={t('dayws.mustTitle')}><StarIcon size={12} /></span>}
        </span>
        <span className="dayt-meta">
          {[poiKind(item), dwell ? fmtDur(dwell) : null].filter(Boolean).join(', ')}
          {item.custom && (
            <span className="dayt-flag">{item.unmapped ? t('dayws.customApprox') : t('dayws.custom')}</span>
          )}
        </span>
        <TicketLine ticket={ticket} t={t} lang={lang} />
        <span className="dayt-links">
          {url && <a className="dayt-link" href={url} target="_blank" rel="noreferrer">{t('dayws.checkHours')}</a>}
          {offPathM != null && <span className="dayt-flag">{t('dayws.offPath', { m: offPathM })}</span>}
        </span>
      </span>
      {compact ? (
        <span className="dayt-tools">
          <StopMenu canEarlier={canEarlier} canLater={canLater} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove} name={item.name} t={t} />
        </span>
      ) : (
      <span className="dayt-tools">
        <IconButton className="dayt-tool" onClick={onMoveUp} disabled={!canEarlier} label={t('dayws.moveUpName', { name: item.name })}>
          <ChevronDownIcon size={18} className="dayt-tool-up" />
        </IconButton>
        <IconButton className="dayt-tool" onClick={onMoveDown} disabled={!canLater} label={t('dayws.moveDownName', { name: item.name })}>
          <ChevronDownIcon size={18} />
        </IconButton>
        <IconButton className="dayt-tool" onClick={onRemove} label={t('dayws.removeStopName', { name: item.name })}>
          <CloseIcon size={16} />
        </IconButton>
      </span>
      )}
    </li>
  );
}

const DETAIL_KEYS = { list: 'dayws.detailList', parts: 'dayws.detailParts', hour: 'dayws.detailHour' };
const BAND_ADD_KEYS = { morning: 'dayws.addToMorning', afternoon: 'dayws.addToAfternoon', evening: 'dayws.addToEvening' };

/**
 * The quiet "Detail" control (T501, owner T492-c): how much structure the
 * traveller wants on their day. A small quiet button naming the level now,
 * opening a menu of the three; never a primary, never in the way.
 */
export function DetailMenu({ value, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <span className="dayt-menu dayp-detail" ref={ref}>
      <Button
        variant="quiet"
        size="sm"
        className="dayp-detail-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('dayws.detailAria', { level: t(DETAIL_KEYS[value]) })}
        onClick={() => setOpen((v) => !v)}
        iconEnd={<ChevronDownIcon size={16} className={open ? 'plan-chev is-open' : 'plan-chev'} />}
      >
        <span className="dayp-detail-lbl">{t('dayws.detail')}</span> {t(DETAIL_KEYS[value])}
      </Button>
      {open && (
        <span className="dayp-menu dayt-menu-pop dayp-detail-pop" role="menu" aria-label={t('dayws.detail')}>
          {DETAIL_LEVELS.map((lv) => (
            <Button
              key={lv}
              variant="quiet"
              role="menuitemradio"
              aria-checked={lv === value}
              className={`dayp-menu-item${lv === value ? ' is-on' : ''}`}
              onClick={() => { setOpen(false); onChange(lv); }}
              iconStart={lv === value ? <CheckIcon size={16} /> : <span className="dayp-menu-gap" aria-hidden="true" />}
            >{t(DETAIL_KEYS[lv])}</Button>
          ))}
        </span>
      )}
    </span>
  );
}

/** A part's head (T501): the label, its hours, and "Add" for that part. A
 *  quiet heading over a group of rows, never a card and never coloured. */
function BandHead({ band, range, onAdd, t }) {
  return (
    <li className="dayt-band" data-band={band.key}>
      <h3 className="dayt-band-h">
        <span className="dayt-band-name">{t(band.labelKey)}</span>
        {range && <span className="dayt-band-range">{range}</span>}
      </h3>
      {onAdd && (
        <Button variant="quiet" size="sm" className="dayt-band-add" iconStart={<PlusIcon size={16} />}
          aria-label={t(BAND_ADD_KEYS[band.key])} onClick={() => onAdd(band.key)}>
          {t('dayws.bandAdd')}
        </Button>
      )}
    </li>
  );
}

/** A meal row (lunch, dinner): no amount of its own, since the food is in
 *  the day's price already. */
function MealRow({ kind, time, label }) {
  return (
    <li className={`dayt-lunch dayt-meal is-${kind}`}>
      <span className="dayt-time">{time}</span>
      <span className="dayt-rail" aria-hidden="true"><DiningIcon size={14} /></span>
      <span className="dayt-body"><span className="dayt-name">{label}</span></span>
    </li>
  );
}

/** The hours a part covers on this day, as its head prints them. */
function bandRange(band, startMin, t) {
  if (band.key === 'evening') return t('dayws.bandFrom', { time: fmtClock(band.fromMin) });
  const from = band.key === 'morning' && Number.isFinite(startMin) && startMin < band.untilMin ? startMin : band.fromMin;
  return t('dayws.timeSpan', { from: fmtClockLoose(from), to: fmtClock(band.untilMin) });
}

/**
 * The planned day (T433, T501). One list from the door and back, at the
 * detail the traveller chose (dayDetail.js):
 *
 *   list   the stops in order with the walks between: the default
 *   parts  the same under Morning, Afternoon and Evening, each with "Add";
 *          Lunch heads the afternoon and Dinner the evening, without amounts
 *   hour   the clock: every stop's time, lunch and dinner where they fall,
 *          when the day is done
 *
 *   items       today's stops, in order
 *   schedule    buildDaySchedule() result, plus startMin
 *   bands       the part each stop starts in (rowBands), aligned to items
 *   legs[i]     leg from stop i to i+1 (see DayPlannerTab legForRow)
 *   stayLeg     the leg from the start to stop 0, or null
 *   offPath[i]  metres from stop i to the nearest path, or null
 *   start       { label, lat, lon } where the day leaves from, or null
 *   tickets[i]  ticketOf(items[i]) (lib/dayTickets.js)
 *   onAdd(band) opens the places with that part chosen (null: the day's end)
 *   onMove(i, dir), canMove(i, dir)   tap moves, across parts
 *   onBestRoute  reorders inside the parts; asked first (owner T492-e)
 */
export function DayPlanPanel({
  items, dayNumber, city, schedule, bands = [], legs = [], stayLeg = null, offPath = [], start = null,
  onMove, canMove, onRemove, rowRefs, flashIdx, onHoverRow, focusIdx = null,
  onAdd, onAskCarta, onBestRoute, canBestRoute = false, aiSummary = '', dwellOf, stepFree = false, compact = false,
  walksBlock = null, tickets = [], detail = 'list', onDetail,
}) {
  const { t, lang } = useI18n();
  const listRef = useRef(null);
  const keys = stopKeys(items);
  useRowSlide(listRef, keys);
  const [asking, setAsking] = useState(false);
  const keepRef = useRef(null);
  useEffect(() => { if (asking) keepRef.current?.focus(); }, [asking]);
  useEffect(() => { setAsking(false); }, [dayNumber]);

  const head = (
    <div className="dayp-head">
      <h2 className="dayp-h">{t('dayws.tabYourDay')}</h2>
      {onDetail && <DetailMenu value={detail} onChange={onDetail} />}
    </div>
  );

  const startMin = Number.isFinite(schedule?.startMin) ? schedule.startMin : schedule?.rows?.[0]?.arriveMin;

  if (items.length === 0) {
    return (
      <div className="dayp is-empty">
        {head}
        {detail === 'parts' ? (
          <ol className="dayt is-untimed is-bands">
            {DAY_BANDS.map((b) => (
              <BandHead key={b.key} band={b} range={null} onAdd={onAdd} t={t} />
            ))}
          </ol>
        ) : (
          <div className="dayp-empty-line">
            <p>{t('dayws.dayEmptyShort')}</p>
            <Button variant="quiet" size="sm" iconStart={<PlusIcon size={16} />} onClick={() => onAdd(null)}>{t('dayws.addPlaces')}</Button>
          </div>
        )}
        <Button variant="primary" className="dayp-carta" iconStart={<SparkIcon size={20} />} onClick={onAskCarta}>
          {t('dayws.emptyCarta', { n: dayNumber })}
        </Button>
      </div>
    );
  }

  const rows = schedule?.rows || [];
  const timed = detail === 'hour';
  const banded = detail !== 'list';
  const pos = (it) => (Number.isFinite(it?.lat) ? { lat: it.lat, lon: it.lon } : null);
  const clock = (min) => (timed && Number.isFinite(min) ? fmtClockLoose(min) : '');
  const bandAt = (min) => dayPhase(min).key;

  // Every row of the day, in clock order, each with the part it belongs to.
  // A walk belongs to the part of the stop it walks to, so a part's head
  // sits between a stop and the walk out of it.
  const seq = [];
  items.forEach((it, i) => {
    seq.push({ kind: 'stop', i, band: bands[i] || bandAt(rows[i]?.arriveMin) });
    if (timed && schedule?.lunch && schedule.lunch.afterIndex === i && i < items.length - 1) {
      seq.push({ kind: 'lunch', band: bandAt(schedule.lunch.startMin) });
    }
    if (timed && schedule?.dinner && schedule.dinner.afterIndex === i && i < items.length - 1) {
      seq.push({ kind: 'dinner', band: bandAt(schedule.dinner.startMin) });
    }
    if (i < items.length - 1) seq.push({ kind: 'leg', i, band: bands[i + 1] || bandAt(rows[i + 1]?.arriveMin) });
  });
  if (timed || banded) seq.push({ kind: 'end', band: banded ? bandAt(schedule?.endMin) : null });
  if (timed && schedule?.dinner && schedule.dinner.afterIndex === items.length - 1) {
    seq.push({ kind: 'dinner', band: 'evening' });
  }

  const renderEntry = (e, k) => {
    if (e.kind === 'stop') {
      const i = e.i;
      const it = items[i];
      return (
        <StopRow
          key={keys[i]}
          rowKey={keys[i]}
          item={it}
          n={i + 1}
          canEarlier={canMove ? canMove(i, -1) : i > 0}
          canLater={canMove ? canMove(i, 1) : i < items.length - 1}
          time={timed && rows[i] ? fmtClockLoose(rows[i].arriveMin) : ''}
          dwell={dwellOf ? dwellOf(it) : null}
          flash={flashIdx === i || focusIdx === i}
          onMoveUp={() => onMove(i, -1)}
          onMoveDown={() => onMove(i, 1)}
          onRemove={() => onRemove(i)}
          rowRef={(el) => { if (rowRefs) rowRefs.current[i] = el; }}
          onHoverChange={(on) => onHoverRow?.(on ? i : null)}
          offPathM={offPath[i] ?? null}
          city={city}
          compact={compact}
          ticket={tickets[i] || null}
          t={t}
          lang={lang}
        />
      );
    }
    if (e.kind === 'leg') {
      return <LegRow key={`leg-${keys[e.i]}`} leg={legs[e.i]} from={pos(items[e.i])} to={pos(items[e.i + 1])} t={t} lang={lang} stepFree={stepFree} />;
    }
    if (e.kind === 'lunch') {
      return <MealRow key={`m-l-${k}`} kind="lunch" time={clock(schedule.lunch.startMin)} label={timed ? t('dayws.lunchFor', { min: schedule.lunch.endMin - schedule.lunch.startMin }) : t('dayws.lunch')} />;
    }
    if (e.kind === 'dinner') {
      return <MealRow key={`m-d-${k}`} kind="dinner" time={clock(schedule.dinner.startMin)} label={t('dayws.dinner')} />;
    }
    return (
      <li className="dayt-end" key="end">
        <span className="dayt-time">{clock(schedule?.endMin)}</span>
        <span className="dayt-rail is-end" aria-hidden="true"><ClockIcon size={14} /></span>
        <span className="dayt-body">
          <span className="dayt-name">{t('dayws.dayDone')}</span>
          {schedule?.freeMin >= 45 && <span className="dayt-meta">{t('dayws.freeLeft', { dur: fmtDur(schedule.freeMin) })}</span>}
        </span>
      </li>
    );
  };

  const startRow = (
    <li className="dayt-start" key="start">
      <span className="dayt-time">{clock(startMin)}</span>
      <span className="dayt-rail is-end" aria-hidden="true"><HomeIcon size={14} /></span>
      <span className="dayt-body"><span className="dayt-name">{start?.label ? t('dayws.leaveFrom', { place: start.label }) : t('dayws.leave')}</span></span>
    </li>
  );

  let body;
  if (!banded) {
    body = [startRow, stayLeg && <LegRow key="stay-leg" leg={stayLeg} from={pos(start)} to={pos(items[0])} t={t} lang={lang} stepFree={stepFree} />, ...seq.map(renderEntry)];
  } else {
    // The parts, always all three: an empty part is its head and "Add".
    body = [startRow];
    let s = 0;
    DAY_BANDS.forEach((b) => {
      body.push(<BandHead key={`band-${b.key}`} band={b} range={bandRange(b, startMin, t)} onAdd={onAdd} t={t} />);
      // In "Parts of the day" the meals head their part without a time.
      if (!timed && b.key === 'afternoon') body.push(<MealRow key="m-lunch" kind="lunch" time="" label={t('dayws.lunch')} />);
      if (!timed && b.key === 'evening') body.push(<MealRow key="m-dinner" kind="dinner" time="" label={t('dayws.dinner')} />);
      if (b.key === 'morning' && stayLeg && bands[0] === 'morning') {
        body.push(<LegRow key="stay-leg" leg={stayLeg} from={pos(start)} to={pos(items[0])} t={t} lang={lang} stepFree={stepFree} />);
      }
      const bi = DAY_BANDS.indexOf(b);
      while (s < seq.length && (seq[s].band == null || DAY_BANDS.findIndex((x) => x.key === seq[s].band) <= bi)) {
        // The walk from the door belongs to the first stop's part.
        if (seq[s].kind === 'stop' && seq[s].i === 0 && stayLeg && bands[0] !== 'morning') {
          body.push(<LegRow key="stay-leg" leg={stayLeg} from={pos(start)} to={pos(items[0])} t={t} lang={lang} stepFree={stepFree} />);
        }
        body.push(renderEntry(seq[s], s));
        s += 1;
      }
    });
  }

  return (
    <div className="dayp">
      {head}
      {aiSummary && <p className="dayp-summary"><SparkIcon size={14} /> {aiSummary}</p>}

      <ol className={`dayt${timed ? '' : ' is-untimed'}${banded ? ' is-bands' : ''}`} ref={listRef}>
        {body}
      </ol>

      {walksBlock}

      <div className="dayp-tools" role="toolbar" aria-label={t('dayws.toolbarAria', { n: dayNumber })}>
        <Button size="sm" iconStart={<PlusIcon size={16} />} onClick={() => onAdd(null)}>{t('dayws.addPlaces')}</Button>
        <Button size="sm" iconStart={<SparkIcon size={16} />} onClick={onAskCarta}>{t('dayws.askCarta')}</Button>
        {canBestRoute && (
          <Button size="sm" iconStart={<RouteIcon size={16} />} aria-expanded={asking} onClick={() => setAsking(true)}>{t('dayws.bestRoute')}</Button>
        )}
      </div>
      {asking && (
        <div
          className="dayp-ask"
          role="group"
          aria-label={t('dayws.bestRoute')}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAsking(false); } }}
        >
          <p>{t(banded ? 'dayws.bestRouteAskParts' : 'dayws.bestRouteAsk', { n: dayNumber })}</p>
          <div className="dayp-ask-acts">
            <Button variant="secondary" size="sm" ref={keepRef} onClick={() => setAsking(false)}>{t('dayws.bestRouteKeep')}</Button>
            <Button variant="primary" size="sm" onClick={() => { setAsking(false); onBestRoute(); }}>{t('dayws.bestRouteGo')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Undo instead of confirm (carta-design rule N6, T409).
 *
 *   offer(label, onUndo)            the change is already made; Undo puts it back.
 *   offer(label, onUndo, onCommit)  the change is only hidden; onCommit does the
 *                                   real work when the six seconds end.
 */
const UNDO_MS = 6000;

export function useUndo() {
  const [pending, setPending] = useState(null);
  const ref = useRef(null);
  const timer = useRef(0);

  const settle = useCallback(() => {
    window.clearTimeout(timer.current);
    const cur = ref.current;
    ref.current = null;
    setPending(null);
    if (cur?.onCommit) cur.onCommit();
  }, []);

  const offer = useCallback((label, onUndo, onCommit) => {
    settle();
    ref.current = { label, onUndo, onCommit };
    setPending({ label });
    timer.current = window.setTimeout(settle, UNDO_MS);
  }, [settle]);

  const undo = useCallback(() => {
    window.clearTimeout(timer.current);
    const cur = ref.current;
    ref.current = null;
    setPending(null);
    cur?.onUndo?.();
  }, []);

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    const cur = ref.current;
    ref.current = null;
    if (cur?.onCommit) cur.onCommit();
  }, []);

  return { pending, offer, undo, settle };
}

export function UndoToast({ pending, onUndo }) {
  const { t } = useI18n();
  if (!pending) return null;
  return (
    <div className="day-undo" role="status">
      <span className="day-undo-text">{pending.label}</span>
      <button type="button" className="day-undo-btn" onClick={onUndo}>{t('dayws.undo')}</button>
    </div>
  );
}

