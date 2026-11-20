import React from 'react';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { Blaze, Button, Segmented } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { prefersReducedMotion } from '../../lib/motion.js';
import { openFilters } from '../filters/filtersStore.js';
import { openSettings } from '../settings/settingsSheetStore.js';
import { MapRow } from './MapRow.jsx';

/**
 * The phone's list over the map (G12, map view: decision.md "Phone map
 * view"; round 2, proposal.md section 3). At rest the map is the whole
 * screen and only the "List of {n}" pill shows; the pill opens the sheet
 * half way. Snap points: peek, half and full (with a Map pill to come back;
 * full stops under the chip rows, so they stay in reach). The sheet follows
 * the finger on its head, and on its rows when they are scrolled to the
 * top; a flick moves one stop.
 *
 * The head: In view | All (the traveller's choice; a pan never changes it)
 * with Filters beside it, then Sort and the price basis (a quiet button to
 * the basis setting). In view lists the places on the map, All every place
 * the filters keep; a row picks its place (in All the map flies there). With
 * nothing in view the pill says so and the sheet offers Show all and Zoom
 * out. The state is the sheet's own, so a drag never re-renders the tab
 * under it (audit-map.md: a 336 ms task on release).
 *
 *   rows, count        the places in view (rows capped) and how many
 *   allRows, allCount  every place the filters keep (rows capped)
 *   pickedId           the picked place; a new pick closes the sheet
 *   sort               the sort control (SortMenu, bare), drawn in the head
 *   filterCount        how many filters are on (the Filters pill's figure)
 *   basis              the price basis in words (the Settings' prices chip)
 *   bestId             the best value in view (its row says so)
 *   onZoomOut          zooms the map out a step (the empty state)
 */
const STOPS = ['closed', 'peek', 'half', 'full'];
// How far down the floating search and chip rows reach in the host, plus a gap.
function measureTop(host) {
  const top = host.getBoundingClientRect().top;
  let room = 0;
  // A tablet's quick chips ride the map's top edge (.xmap-quick).
  for (const el of document.querySelectorAll('.band.is-map .band-row, .band.is-map .band-strip, .band.is-map .band-quick, .xmap-quick')) {
    const r = el.getBoundingClientRect();
    if (r.height) room = Math.max(room, r.bottom - top);
  }
  return Math.round(room + 8);
}
const PEEK_PX = 72;
// A release faster than this (px per ms) moves one stop the way it went.
const FLICK = 0.45;

export function MapSheet({
  rows, count, allRows = [], allCount = 0, pickedId, overviewOf, onPick, favSet, onToggleFav, sort,
  filterCount = 0, basis = '', bestId = '', onZoomOut = null, listSwitch = null, t, lang,
}) {
  const [stop, setStop] = React.useState('closed');
  const [scope, setScope] = React.useState('view');
  const rootRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const [hostH, setHostH] = React.useState(0);
  const [topRoom, setTopRoom] = React.useState(0);
  // Peek shows the head down to its first row, measured: its lines wrap by
  // language.
  const [peekPx, setPeekPx] = React.useState(PEEK_PX);
  const [headH, setHeadH] = React.useState(PEEK_PX + 24);
  const [drag, setDrag] = React.useState(null);
  const dragRef = React.useRef(null);

  // The host is the map's own box (above the nav); full stops under the
  // floating search and chip rows, so they stay in reach.
  React.useLayoutEffect(() => {
    const host = rootRef.current?.parentElement;
    if (!host) return undefined;
    const read = () => {
      setHostH(host.clientHeight);
      setTopRoom(measureTop(host));
      const head = rootRef.current?.querySelector('.xsheet-head');
      const row = rootRef.current?.querySelector('.xsheet-row');
      if (row) setPeekPx(Math.max(PEEK_PX, row.offsetTop + row.offsetHeight + 8));
      if (head) setHeadH(head.offsetHeight);
    };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    ro?.observe(host);
    const head = rootRef.current?.querySelector('.xsheet-head');
    if (head) ro?.observe(head);
    return () => ro?.disconnect();
  }, []);

  // The chip rows can change after the sheet mounted (a style chip whose
  // words wrap, the quick row arriving): measured again on every new stop.
  React.useEffect(() => {
    const host = rootRef.current?.parentElement;
    if (host) setTopRoom(measureTop(host));
  }, [stop]);

  const shown = (s) => {
    if (s === 'full') return Math.max(peekPx, hostH - topRoom);
    if (s === 'half') return Math.max(peekPx, Math.round(hostH * 0.5));
    if (s === 'peek') return peekPx;
    return 0;
  };
  const visible = drag != null ? drag : shown(stop);

  // The chrome over the map changed: the map moves its pins clear of it once
  // the sheet has settled.
  React.useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('carta:map-chrome')), prefersReducedMotion() ? 0 : 320);
    return () => clearTimeout(id);
  }, [stop]);

  // A pick on the map puts the sheet away: the tap card shows the place.
  const lastPick = React.useRef(pickedId);
  React.useEffect(() => {
    if (pickedId && pickedId !== lastPick.current) setStop('closed');
    lastPick.current = pickedId;
  }, [pickedId]);

  // Escape lowers the sheet one stop.
  React.useEffect(() => {
    if (stop === 'closed') return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (!rootRef.current?.contains(document.activeElement)) return;
      setStop((s) => STOPS[Math.max(0, STOPS.indexOf(s) - 1)]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stop]);

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button:not(.xsheet-grab), a, input, [role="menu"]') && !e.target.closest('.xsheet-head')) {
      // A row: it drags the sheet only from the top of its scroll.
      if ((bodyRef.current?.scrollTop || 0) > 0) return;
    }
    // The whole head starts a drag, its buttons too: only a move past 6 px
    // makes it a drag, so a tap still presses the button. An open menu
    // keeps its own touches.
    if (e.target.closest('[role="menu"], [role="listbox"]')) return;
    dragRef.current = { id: e.pointerId, y0: e.clientY, v0: shown(stop), moved: false, last: [[e.timeStamp, e.clientY]] };
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = d.y0 - e.clientY;
    if (!d.moved) {
      if (Math.abs(dy) < 6) return;
      // On the rows, an upward drag at half or full is a scroll, not a drag.
      const inBody = bodyRef.current?.contains(e.target);
      if (inBody && (dy > 0 ? stop === 'full' : (bodyRef.current.scrollTop || 0) > 0)) { dragRef.current = null; return; }
      d.moved = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    }
    d.last.push([e.timeStamp, e.clientY]);
    if (d.last.length > 5) d.last.shift();
    setDrag(Math.max(0, Math.min(shown('full'), d.v0 + dy)));
  };
  const onUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return;
    const px = Math.max(0, Math.min(shown('full'), d.v0 + (d.y0 - e.clientY)));
    const [t0, y0] = d.last[0];
    const dt = Math.max(1, e.timeStamp - t0);
    const v = (y0 - e.clientY) / dt;
    let next;
    if (Math.abs(v) > FLICK) {
      // A flick: one stop the way it went, from where the finger started.
      const i = STOPS.indexOf(stop);
      next = STOPS[Math.max(0, Math.min(STOPS.length - 1, i + (v > 0 ? 1 : -1)))];
    } else {
      next = STOPS.reduce((a, s) => (Math.abs(shown(s) - px) < Math.abs(shown(a) - px) ? s : a), 'closed');
    }
    setDrag(null);
    setStop(next);
    // The click a drag ends in is not a press on a row.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
  };

  // While the list is up the tap card waits under it (86-map-view.css).
  const sheetUp = stop !== 'closed';
  React.useEffect(() => {
    document.documentElement.classList.toggle('xsheet-open', sheetUp);
    return () => document.documentElement.classList.remove('xsheet-open');
  }, [sheetUp]);

  const fmt = (x) => new Intl.NumberFormat(lang).format(x);
  const offset = Math.max(0, hostH - visible);
  const open = stop !== 'closed' || drag != null;
  const all = scope === 'all';
  const list = all ? allRows : rows;
  const empty = !all && count === 0;
  const scopeOptions = [
    { value: 'view', label: <><span>{t('explore.map.scopeView')}</span> <span className="xsheet-n">{fmt(count)}</span></> },
    { value: 'all', label: <><span>{t('explore.map.scopeAll')}</span> <span className="xsheet-n">{fmt(allCount)}</span></> },
  ];
  return (
    <>
      {stop === 'closed' && drag == null && (
        <Pressable className={`xmap-listpill${pickedId ? ' is-above-card' : ''}`} onClick={() => setStop('half')}
          aria-expanded="false">
          <HouseIcon.list size={18} />
          <span>{count === 0 ? t('explore.map.nothingInView') : t('explore.mapListOf', { n: fmt(count) })}</span>
        </Pressable>
      )}
      {stop === 'full' && (
        <Pressable className="xmap-listpill is-map" onClick={() => setStop('closed')}>
          <HouseIcon.map size={18} />
          <span>{t('explore.viewMap')}</span>
        </Pressable>
      )}
      <section ref={rootRef}
        className={`xsheet is-${drag != null ? 'dragging' : stop}${open ? '' : ' is-closed'}`}
        style={{ transform: `translateY(${offset}px)` }}
        aria-label={t('explore.drawerAria')}
        inert={open ? undefined : ''}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="xsheet-head">
          <Pressable className="xsheet-grab" aria-label={t(stop === 'full' ? 'drawer.full' : 'drawer.half')}
            aria-expanded={stop === 'half' || stop === 'full'}
            onClick={() => setStop(stop === 'full' ? 'peek' : stop === 'half' ? 'full' : 'half')}>
            <span className="xsheet-grab-bar" aria-hidden="true" />
          </Pressable>
          <div className="xsheet-row">
            <Segmented label={t('explore.map.scopeAria')} size="sm" className="xsheet-scope"
              options={scopeOptions} value={scope} onChange={setScope} />
            <Pressable className={`xsheet-filters${filterCount ? ' is-on' : ''}`} aria-haspopup="dialog"
              onClick={(e) => openFilters({ opener: e.currentTarget })}>
              <HouseIcon.filter size={18} />
              <span>{t('band.filters')}</span>
              {filterCount > 0 && <span className="band-count" aria-hidden="true">{filterCount}</span>}
            </Pressable>
          </div>
          <div className="xsheet-row2">
            <span className="xsheet-sort">{sort}{listSwitch}</span>
            {basis && (
              <Button variant="quiet" size="sm" className="xsheet-basis"
                onClick={() => openSettings({ step: 'prices' })}>{basis}</Button>
            )}
          </div>
        </div>
        <div ref={bodyRef} className="xsheet-body" style={{ height: `${Math.max(0, shown(stop === 'closed' ? 'half' : stop) - headH)}px` }}>
          {open && empty ? (
            <div className="xsheet-empty">
              <Blaze size="lg" state="blank" className="xsheet-empty-mark" />
              <h2 className="xsheet-empty-title">{t('explore.map.empty')}</h2>
              <div className="xsheet-empty-acts">
                <Button variant="primary" iconStart={<HouseIcon.list size={18} />} onClick={() => setScope('all')}>
                  {t('explore.map.showAll', { n: fmt(allCount) })}
                </Button>
                {onZoomOut && (
                  <Button variant="quiet" iconStart={<HouseIcon.minus size={18} />} onClick={onZoomOut}>
                    {t('explore.map.zoomOut')}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="xsheet-rows">
              {/* Rows only while the sheet shows: a closed sheet re-rendering
                  60 rows after every pan cost the map its frames. */}
              {open && list.map((p) => (
                <MapRow key={p.id} p={p} {...overviewOf(p)} t={t}
                  selected={p.id === pickedId} best={p.id === bestId}
                  fav={favSet ? favSet.has(p.id) : false} onToggleFav={onToggleFav}
                  onOpen={() => { setStop('closed'); onPick(p.id); }} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
