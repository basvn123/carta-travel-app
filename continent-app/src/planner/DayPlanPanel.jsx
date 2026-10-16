import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PoiThumb } from './DayActivityRows.jsx';
import { isMustSee, poiKind, poiMapCat } from './dayDraft.js';
import { useI18n } from '../i18n/index.jsx';
import {
  RouteIcon, StarIcon, ChevronDownIcon, CloseIcon, ShoeIcon, BusIcon, CarIcon,
  DiningIcon, HomeIcon, ClockIcon, SparkIcon, PlusIcon, MoreIcon,
} from '../components/Icons.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { fmtClockLoose } from './daySchedule.js';
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
    ref.current?.querySelector('[role="menu"] [role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const root = ref.current;
    const items = () => [...(root?.querySelectorAll('[role="menu"] [role="menuitem"]:not(:disabled)') || [])];
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

/**
 * The day bar (T433): the shape of the day on one line, with the hours under
 * it. Each stop is a segment as wide as its visit, numbered as on the map;
 * the walks between are the gaps, lunch its own segment. It replaces the
 * unlabelled ink strip the owner and the critique found unreadable: the hour
 * ticks make it a timetable you can read at a glance.
 */
export function DayBar({ schedule, startMin, focusIdx = null }) {
  const { t } = useI18n();
  const rows = schedule?.rows || [];
  if (!rows.length) return null;
  const t0 = Number.isFinite(startMin) ? Math.min(startMin, rows[0].arriveMin) : rows[0].arriveMin;
  const t1 = Math.max(schedule.endMin || 0, rows[rows.length - 1].departMin);
  const span = Math.max(60, t1 - t0);
  const pct = (m) => `${((m - t0) / span) * 100}%`;
  const ticks = [];
  for (let h = Math.ceil(t0 / 60); h * 60 <= t1; h += 1) ticks.push(h);
  const step = ticks.length > 8 ? 2 : 1;
  return (
    <div className="dayb" aria-hidden="true">
      <div className="dayb-track">
        {rows.map((r, i) => (
          <span
            key={i}
            className={`dayb-seg${i === focusIdx ? ' on' : ''}`}
            style={{ left: pct(r.arriveMin), width: `calc(${((r.departMin - r.arriveMin) / span) * 100}% - 2px)` }}
          >{(r.departMin - r.arriveMin) / span > 0.06 ? i + 1 : ''}</span>
        ))}
        {schedule.lunch && (
          <span
            className="dayb-seg is-lunch"
            style={{ left: pct(schedule.lunch.startMin), width: `calc(${((schedule.lunch.endMin - schedule.lunch.startMin) / span) * 100}% - 2px)` }}
            title={t('dayws.lunch')}
          />
        )}
      </div>
      <div className="dayb-ticks">
        {ticks.filter((h, k) => k % step === 0).map((h) => (
          <span key={h} style={{ left: pct(h * 60) }}>{String(h).padStart(2, '0')}</span>
        ))}
      </div>
    </div>
  );
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
              {transitUrl && <a className="dayt-link" href={transitUrl} target="_blank" rel="noreferrer">{t('dayws.legTransit')}</a>}
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
 *  is one line of controls wide rather than three stacked 44 px buttons. */
function StopMenu({ n, last, onMoveUp, onMoveDown, onRemove, name, t }) {
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
          <Button variant="quiet" role="menuitem" className="dayp-menu-item" disabled={n === 1} onClick={pick(onMoveUp)}
            iconStart={<ChevronDownIcon size={16} className="dayt-tool-up" />}>{t('dayws.moveUp')}</Button>
          <Button variant="quiet" role="menuitem" className="dayp-menu-item" disabled={last} onClick={pick(onMoveDown)}
            iconStart={<ChevronDownIcon size={16} />}>{t('dayws.moveDown')}</Button>
          <Button variant="quiet" role="menuitem" className="dayp-menu-item" onClick={pick(onRemove)}
            iconStart={<CloseIcon size={16} />}>{t('dayws.removeStop')}</Button>
        </span>
      )}
    </span>
  );
}

function StopRow({
  item, n, last, time, dwell, flash, onMoveUp, onMoveDown, onRemove, rowRef, rowKey,
  onHoverChange, offPathM, city, compact, t,
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
        <span className="dayt-links">
          {url && <a className="dayt-link" href={url} target="_blank" rel="noreferrer">{t('dayws.checkHours')}</a>}
          {offPathM != null && <span className="dayt-flag">{t('dayws.offPath', { m: offPathM })}</span>}
        </span>
      </span>
      {compact ? (
        <span className="dayt-tools">
          <StopMenu n={n} last={last} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onRemove={onRemove} name={item.name} t={t} />
        </span>
      ) : (
      <span className="dayt-tools">
        <IconButton className="dayt-tool" onClick={onMoveUp} disabled={n === 1} label={t('dayws.moveUp')}>
          <ChevronDownIcon size={18} className="dayt-tool-up" />
        </IconButton>
        <IconButton className="dayt-tool" onClick={onMoveDown} disabled={last} label={t('dayws.moveDown')}>
          <ChevronDownIcon size={18} />
        </IconButton>
        <IconButton className="dayt-tool" onClick={onRemove} label={t('dayws.removeStop')}>
          <CloseIcon size={16} />
        </IconButton>
      </span>
      )}
    </li>
  );
}

/**
 * The day, hour by hour (T433). One list from the door and back: when you
 * leave, each stop with its arrival time, how long it takes and a way to
 * check its hours, the leg to the next with its minutes and kilometres as
 * routed on real footpaths (or the ride Carta recommends where no footpath
 * was found), lunch where it falls, and when the day is done.
 *
 *   items       today's stops, in order
 *   schedule    buildDaySchedule() result, plus startMin
 *   legs[i]     leg from stop i to i+1 (see DayPlannerTab legForRow)
 *   stayLeg     the leg from the start to stop 0, or null
 *   offPath[i]  metres from stop i to the nearest path, or null
 *   start       { label, lat, lon } where the day leaves from, or null
 */
export function DayPlanPanel({
  items, dayNumber, city, schedule, legs = [], stayLeg = null, offPath = [], start = null,
  onMoveUp, onMoveDown, onRemove, rowRefs, flashIdx, onHoverRow, focusIdx = null,
  onAddMore, onAskCarta, onOptimize, canOptimize, aiSummary = '', dwellOf, stepFree = false, compact = false,
  walksBlock = null,
}) {
  const { t, lang } = useI18n();
  const listRef = useRef(null);
  const keys = stopKeys(items);
  useRowSlide(listRef, keys);

  if (items.length === 0) {
    return (
      <div className="dayp">
        <div className="dayp-empty">
          <h2>{t('dayws.emptyTitle', { n: dayNumber })}</h2>
          <p>{t('dayws.emptySub', { city: city || t('day.thisCity') })}</p>
          <div className="dayp-empty-actions">
            <Button variant="primary" iconStart={<PlusIcon size={16} />} onClick={onAddMore}>{t('dayws.emptyBrowse')}</Button>
            <Button iconStart={<SparkIcon size={16} />} onClick={onAskCarta}>{t('dayws.emptyAsk')}</Button>
          </div>
        </div>
      </div>
    );
  }

  const rows = schedule?.rows || [];
  const lunchAfter = schedule?.lunch ? schedule.lunch.afterIndex : -1;
  const startMin = Number.isFinite(schedule?.startMin) ? schedule.startMin : rows[0]?.arriveMin;
  const pos = (it) => (Number.isFinite(it?.lat) ? { lat: it.lat, lon: it.lon } : null);

  return (
    <div className="dayp">
      {aiSummary && <p className="dayp-summary"><SparkIcon size={14} /> {aiSummary}</p>}

      <ol className="dayt" ref={listRef}>
        <li className="dayt-start">
          <span className="dayt-time">{fmtClockLoose(startMin)}</span>
          <span className="dayt-rail is-end" aria-hidden="true"><HomeIcon size={14} /></span>
          <span className="dayt-body"><span className="dayt-name">{start?.label ? t('dayws.leaveFrom', { place: start.label }) : t('dayws.leave')}</span></span>
        </li>
        {stayLeg && <LegRow leg={stayLeg} from={pos(start)} to={pos(items[0])} t={t} lang={lang} stepFree={stepFree} />}
        {items.map((it, i) => (
          <React.Fragment key={keys[i]}>
            <StopRow
              rowKey={keys[i]}
              item={it}
              n={i + 1}
              last={i === items.length - 1}
              time={rows[i] ? fmtClockLoose(rows[i].arriveMin) : ''}
              dwell={dwellOf ? dwellOf(it) : null}
              flash={flashIdx === i || focusIdx === i}
              onMoveUp={() => onMoveUp(i)}
              onMoveDown={() => onMoveDown(i)}
              onRemove={() => onRemove(i)}
              rowRef={(el) => { if (rowRefs) rowRefs.current[i] = el; }}
              onHoverChange={(on) => onHoverRow?.(on ? i : null)}
              offPathM={offPath[i] ?? null}
              city={city}
              compact={compact}
              t={t}
            />
            {i === lunchAfter && (
              <li className="dayt-lunch">
                <span className="dayt-time">{fmtClockLoose(schedule.lunch.startMin)}</span>
                <span className="dayt-rail" aria-hidden="true"><DiningIcon size={14} /></span>
                <span className="dayt-body"><span className="dayt-name">{t('dayws.lunchFor', { min: schedule.lunch.endMin - schedule.lunch.startMin })}</span></span>
              </li>
            )}
            {i < items.length - 1 && <LegRow leg={legs[i]} from={pos(it)} to={pos(items[i + 1])} t={t} lang={lang} stepFree={stepFree} />}
          </React.Fragment>
        ))}
        <li className="dayt-end">
          <span className="dayt-time">{schedule ? fmtClockLoose(schedule.endMin) : ''}</span>
          <span className="dayt-rail is-end" aria-hidden="true"><ClockIcon size={14} /></span>
          <span className="dayt-body">
            <span className="dayt-name">{t('dayws.dayDone')}</span>
            {schedule?.freeMin >= 45 && <span className="dayt-meta">{t('dayws.freeLeft', { dur: fmtDur(schedule.freeMin) })}</span>}
          </span>
        </li>
      </ol>

      {walksBlock}

      <div className="dayp-tools" role="toolbar" aria-label={t('dayws.toolbarAria', { n: dayNumber })}>
        <Button size="sm" iconStart={<PlusIcon size={16} />} onClick={onAddMore}>{t('dayws.addPlaces')}</Button>
        <Button size="sm" iconStart={<SparkIcon size={16} />} onClick={onAskCarta}>{t('dayws.askCarta')}</Button>
        {canOptimize && (
          <Button size="sm" iconStart={<RouteIcon size={16} />} onClick={onOptimize}>{t('dayws.addReorder')}</Button>
        )}
      </div>
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

