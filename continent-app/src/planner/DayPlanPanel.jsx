import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SheetShell } from '../browse/SheetShell.jsx';
import { PoiThumb } from './DayActivityRows.jsx';
import { isMustSee, poiKind, poiMapCat } from './dayDraft.js';
import { useI18n } from '../i18n/index.jsx';
import {
  PlusIcon, ShareIcon, MapPinIcon, DownloadIcon, RouteIcon, CalendarIcon,
  SparkIcon, StarIcon, MountainIcon, CheckIcon, ChevronDownIcon, CloseIcon,
} from '../components/Icons.jsx';
import { formatSteps, kmToSteps } from '../lib/steps.js';
import { durationMs } from '../lib/motion.js';
import { useSettledFigure } from '../lib/figureChange.js';

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
  // Focus enters the menu once, as it opens (callers pass a fresh close
  // function every render, so this must not hang off the main effect).
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

/** One stop of today's walk. Everything that is not the place itself was cut:
 *  no clock, no leg distance, no explanation of how you get there. The order
 *  is the information, and the map above draws the rest. */
function RouteStop({ item, n, last, flash, onMoveUp, onMoveDown, onRemove, rowRef, rowKey, onHoverChange, t }) {
  return (
    <li
      className={`dayr-row${flash ? ' flash' : ''}${last ? ' last' : ''}`}
      ref={rowRef}
      data-key={rowKey}
      onMouseEnter={onHoverChange ? () => onHoverChange(true) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(false) : undefined}
    >
      <span className="dayr-mark">
        <PoiThumb img={item.img} cat={poiMapCat(item)} name={item.name} />
        <span className="dayr-no">{n}</span>
      </span>
      <span className="dayr-body">
        <span className="dayr-name">
          {item.name}
          {isMustSee(item) && (
            <span className="dayr-must" title={t('dayws.mustTitle')}><StarIcon size={9} /></span>
          )}
        </span>
        <span className="dayr-kind">
          {poiKind(item)}
          {/* A place the catalogue never heard of was pinned by best effort,
              and when that effort missed it sits on the city centre. Saying so
              is a correctness caveat, not decoration, so it survives the cut
              that took every other badge off this list. */}
          {item.custom && (
            <span
              className="day-badge-custom"
              title={item.unmapped
                ? t('dayws.customApproxTitle')
                : t('dayws.customTitle')}
            >
              {item.unmapped ? t('dayws.customApprox') : t('dayws.custom')}
            </span>
          )}
        </span>
      </span>
      <span className="dayr-tools">
        {/* T399: drawn icons from the one set, not the Unicode arrows and
            the multiplication sign (design direction v6, part 5). Up is the
            down chevron turned. */}
        <button className="dayr-tool" onClick={onMoveUp} disabled={n === 1} aria-label={t('dayws.moveUp')} title={t('dayws.moveUp')}>
          <ChevronDownIcon size={16} className="dayr-tool-up" />
        </button>
        <button className="dayr-tool" onClick={onMoveDown} disabled={last} aria-label={t('dayws.moveDown')} title={t('dayws.moveDown')}>
          <ChevronDownIcon size={16} />
        </button>
        <button className="dayr-tool dayr-tool-del" onClick={onRemove} aria-label={t('dayws.removeStop')} title={t('dayws.removeStop')}>
          <CloseIcon size={14} />
        </button>
      </span>
    </li>
  );
}

/**
 * The day strip (T399, carta-design "Data drawings", rule N4): one thin bar,
 * one segment per stop in ink and one per stretch between stops in rule,
 * each as wide as its minutes in the day's schedule (the same model that
 * prints "done ~14:00" in the head). It carries no figure, no legend and no
 * accent; the rows and the figures line carry the numbers, so it is hidden
 * from screen readers. The stop the traveller is looking at (under the
 * pointer, or tapped on the map) is outlined.
 *
 * `schedule` is buildDaySchedule()'s result plus `startMin`, the minute the
 * day leaves the door. Segments run from there to `endMin`, so their minutes
 * add up to the finish time the head prints.
 */
function daySegments(schedule) {
  const rows = schedule?.rows || [];
  if (!rows.length) return [];
  const segs = [];
  let t = Number.isFinite(schedule.startMin) ? Math.min(schedule.startMin, rows[0].arriveMin) : rows[0].arriveMin;
  rows.forEach((r, i) => {
    if (r.arriveMin > t) segs.push({ kind: 'gap', min: r.arriveMin - t });
    segs.push({ kind: 'stop', i, min: Math.max(1, r.departMin - r.arriveMin) });
    t = r.departMin;
  });
  if (Number.isFinite(schedule.endMin) && schedule.endMin > t) segs.push({ kind: 'gap', min: schedule.endMin - t });
  return segs;
}

function DayStrip({ schedule, focusIdx }) {
  const segs = daySegments(schedule);
  if (segs.length < 2) return null;
  return (
    <div className="dayp-strip" aria-hidden="true">
      {segs.map((s, k) => (
        <span
          key={k}
          className={`dayp-strip-seg ${s.kind}${s.kind === 'stop' && s.i === focusIdx ? ' on' : ''}`}
          style={{ flexGrow: s.min }}
        />
      ))}
    </div>
  );
}

/** A line of the day's figures that settles in place when they change: one
 *  opacity dip through the shared primitive, no count-up (design direction
 *  v6, part 2.3). `value` is the string of figures it shows. */
export function SettledLine({ className, value, children }) {
  const ref = useRef(null);
  useSettledFigure(ref, value);
  return <div className={className} ref={ref}>{children}</div>;
}

/** A stable key per stop, so React keeps a row's element when it moves and
 *  the reorder can slide it (a key holding the index remounts the row). */
function stopKeys(items) {
  const seen = new Map();
  return items.map((it) => {
    const base = String(it.id ?? it.name ?? '');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base}#${n}` : base;
  });
}

/**
 * Slide rows to their new place after a reorder (FLIP, design direction v6
 * part 2.3: a moved row slides in --dur-2 with --ease-in-out and the others
 * shift the same way). Reads each row's top before the paint, plays the
 * difference back to zero through the Web Animations API, and does nothing
 * under reduced motion, where durationMs() returns 0 and the rows jump.
 */
function useRowSlide(listRef, keys) {
  const tops = useRef(new Map());
  const sig = keys.join('|');
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.children];
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
 * Tab 1 of the day workspace: today's plan, and nothing else.
 *
 * One toolbar row sits above the list (T389, carta-design "Day list": a
 * planning surface puts its ways to add in one labelled toolbar row inside
 * the content). "Add" holds every way to put something into the day: more
 * places, Carta planning it, the refining asks that used to float over the
 * map as the Carta bot (more stops, less walking, rain, food) and reordering
 * the route, once. "Share" holds where the day can go: Google Maps, a message
 * to the people coming with you, then the file exports. Nothing floats over
 * the list any more.
 */
export function DayPlanPanel({
  items, dayNumber, city,
  onMoveUp, onMoveDown, onRemove, rowRefs, flashIdx, onHoverRow,
  onAddMore, onOptimize, onAskCarta, canOptimize,
  botPrompts = [], onBotPrompt,
  gmapsUrl, onShare, shareState, onPdf, onKml, onIcs,
  citytrip, onUseCitytrip, walksBlock, discoveries = [], aiSummary = '',
  schedule = null, focusIdx = null,
}) {
  const { t, lang } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const addBtnRef = useRef(null);
  const shareBtnRef = useRef(null);
  const listRef = useRef(null);
  const keys = stopKeys(items);
  useRowSlide(listRef, keys);

  if (items.length === 0) {
    return (
      <div className="dayp">
        <div className="dayp-empty">
          <span className="dayp-empty-glyph" aria-hidden="true"><RouteIcon size={22} /></span>
          <h3>{t('dayws.emptyTitle', { n: dayNumber })}</h3>
          <p>{t('dayws.emptySub', { city: city || t('day.thisCity') })}</p>
          <div className="dayp-empty-actions">
            <button className="dayp-cta" onClick={onAskCarta}>
              <SparkIcon size={14} /> {t('dayws.emptyAsk')}
            </button>
            <button className="dayp-cta dayp-cta-ghost" onClick={onAddMore}>
              <PlusIcon size={14} /> {t('dayws.emptyBrowse')}
            </button>
          </div>
          {citytrip && (
            <button className="dayp-ready" onClick={onUseCitytrip}>
              <span className="dayp-ready-ico"><RouteIcon size={16} /></span>
              <span className="dayp-ready-text">
                <b>{t('day.readyMade', { city: city || '' })}</b>
                <small>{t('day.readyMadeSubSteps', {
                  n: citytrip.n_stops,
                  steps: formatSteps(kmToSteps(citytrip.distance_m / 1000), lang),
                })}</small>
              </span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dayp">
      <div className="dayp-bar" role="toolbar" aria-label={t('dayws.toolbarAria', { n: dayNumber })}>
        <button
          ref={addBtnRef}
          type="button"
          className={`dayp-tool${addOpen ? ' on' : ''}`}
          onClick={() => { setShareOpen(false); setAddOpen((v) => !v); }}
          aria-haspopup="dialog"
          aria-expanded={addOpen}
          title={t('dayws.addAria')}
        >
          <PlusIcon size={16} />
          <span>{t('dayws.toolAdd')}</span>
          <ChevronDownIcon size={14} className="dayp-tool-caret" />
        </button>
        <button
          ref={shareBtnRef}
          type="button"
          className={`dayp-tool${shareOpen ? ' on' : ''}`}
          onClick={() => { setAddOpen(false); setShareOpen((v) => !v); }}
          aria-haspopup="dialog"
          aria-expanded={shareOpen}
          title={t('dayws.shareAria')}
        >
          <ShareIcon size={15} />
          <span>{t('dayws.toolShare')}</span>
          <ChevronDownIcon size={14} className="dayp-tool-caret" />
        </button>
      </div>

      {/* Both choices open in the shared sheet: a popover hung off its
          button on a pointer screen, a bottom sheet over the one scrim on a
          phone, where eight two-line items never fit above the bottom nav as
          a dropdown (the V1 walk found the exports cut off there). */}
      {addOpen && (
        <SheetShell
          title={t('dayws.addAria')}
          onClose={() => setAddOpen(false)}
          anchorRef={addBtnRef}
          width={320}
          className="dayp-sheet"
          labelId="dayp-add-title"
        >
          <div className="dayp-choices">
            <button type="button" className="dayp-menu-item" onClick={() => { setAddOpen(false); onAddMore(); }}>
              <MapPinIcon size={14} />
              <span><b>{t('dayws.addPlaces')}</b><small>{t('dayws.addPlacesSub')}</small></span>
            </button>
            {canOptimize && (
              <button type="button" className="dayp-menu-item" onClick={() => { setAddOpen(false); onOptimize(); }}>
                <RouteIcon size={14} />
                <span><b>{t('dayws.addReorder')}</b><small>{t('dayws.addReorderSub')}</small></span>
              </button>
            )}
            <div className="dayp-menu-rule" aria-hidden="true" />
            <div className="dayp-menu-label">{t('dayws.botTitle')}</div>
            <button type="button" className="dayp-menu-item" onClick={() => { setAddOpen(false); onAskCarta(); }}>
              <SparkIcon size={14} />
              <span><b>{t('dayws.addCarta')}</b><small>{t('dayws.addCartaSub')}</small></span>
            </button>
            {botPrompts.map((p) => (
              <button
                key={p.key}
                type="button"
                className="dayp-menu-item"
                onClick={() => { setAddOpen(false); onBotPrompt?.(p.key); }}
              >
                {React.createElement(p.Icon, { size: 14 })}
                <span><b>{t(p.labelKey)}</b><small>{t(p.subKey)}</small></span>
              </button>
            ))}
          </div>
        </SheetShell>
      )}
      {shareOpen && (
        <SheetShell
          title={t('dayws.shareAria')}
          onClose={() => setShareOpen(false)}
          anchorRef={shareBtnRef}
          width={320}
          className="dayp-sheet"
          labelId="dayp-share-title"
        >
          <div className="dayp-choices">
            {gmapsUrl && (
              <a className="dayp-menu-item" href={gmapsUrl} target="_blank" rel="noreferrer" onClick={() => setShareOpen(false)}>
                <MapPinIcon size={14} />
                <span><b>{t('export.openInGmaps')}</b><small>{t('dayws.shareGmapsSub')}</small></span>
              </a>
            )}
            {/* Stays open so "Copied" is read where it was clicked. */}
            <button type="button" className="dayp-menu-item" onClick={onShare}>
              {shareState === 'copied' ? <CheckIcon size={14} /> : <ShareIcon size={14} />}
              <span>
                <b>{shareState === 'copied' ? t('day.copied') : t('dayws.shareFriends')}</b>
                <small>{t('dayws.shareFriendsSub')}</small>
              </span>
            </button>
            <div className="dayp-menu-rule" aria-hidden="true" />
            <button type="button" className="dayp-menu-item dayp-menu-small" onClick={() => { setShareOpen(false); onPdf(); }}>
              <DownloadIcon size={13} /> <span><b>{t('day.downloadPdf')}</b></span>
            </button>
            <button type="button" className="dayp-menu-item dayp-menu-small" onClick={() => { setShareOpen(false); onKml(); }}>
              <RouteIcon size={13} /> <span><b>{t('export.myMaps')}</b></span>
            </button>
            <button type="button" className="dayp-menu-item dayp-menu-small" onClick={() => { setShareOpen(false); onIcs(); }}>
              <CalendarIcon size={13} /> <span><b>{t('export.calendar')}</b></span>
            </button>
          </div>
        </SheetShell>
      )}

      {aiSummary && <p className="dayp-summary">{aiSummary}</p>}

      <DayStrip schedule={schedule} focusIdx={focusIdx} />

      <ol className="dayr-list" ref={listRef}>
        {items.map((it, i) => (
          <RouteStop
            key={keys[i]}
            rowKey={keys[i]}
            item={it}
            n={i + 1}
            last={i === items.length - 1}
            flash={flashIdx === i}
            onMoveUp={() => onMoveUp(i)}
            onMoveDown={() => onMoveDown(i)}
            onRemove={() => onRemove(i)}
            rowRef={(el) => { if (rowRefs) rowRefs.current[i] = el; }}
            onHoverChange={(on) => onHoverRow?.(on ? i : null)}
            t={t}
          />
        ))}
      </ol>

      {walksBlock}

      {/* Places Carta found off the catalogue while planning: they carry their
          own map pins but no row to sit in, so they are named once, here. */}
      {discoveries.length > 0 && (
        <div className="dayp-finds">
          <div className="dayp-finds-title"><MountainIcon size={11} /> {t('ai.discoveryTitle')}</div>
          {discoveries.map((s, i) => (
            <div className="dayp-find" key={i}>
              <b>
                {s.name}
                {/* Two caveats that must travel with the find: an event may not
                    be running when you get there, and a place Carta knew but
                    could not locate has no pin to check it against. */}
                {s.isEvent && <span className="ai-disc-tag ai-event-tag">{t('ai.eventTag')}</span>}
                {s.unmapped && <span className="ai-disc-tag ai-unmapped-tag">{t('ai.unmappedTag')}</span>}
              </b>
              {s.why && <small>{s.why}</small>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Undo instead of confirm (carta-design rule N6, T409).
 *
 * A destructive action on the traveller's own data runs at once and offers
 * "Undo" for six seconds. Two shapes are supported:
 *
 *   offer(label, onUndo)            the change is already made; Undo puts it back.
 *   offer(label, onUndo, onCommit)  the change is only hidden; onCommit does the
 *                                   real, irreversible work when the six seconds
 *                                   end, when a second action starts, or when the
 *                                   panel unmounts, so nothing is ever left half
 *                                   deleted.
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

  // A panel that closes inside the window still honours the delete.
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
