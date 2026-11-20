import React from 'react';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { prefersReducedMotion } from '../../lib/motion.js';
import { countKey } from '../../lib/plural.js';
import { PlaceRow } from './PlaceRow.jsx';

/**
 * The phone's list over the map (G12, map view: decision.md "Phone map
 * view"). At rest the map is the whole screen and only the "List of {n}"
 * pill shows; the pill opens the sheet half way. Three snap points: peek
 * (the count, the sort and the best-value legend), half and full (with a
 * Map pill to come back). The sheet follows the finger on its head, and on
 * its rows when they are scrolled to the top; a flick moves one stop.
 *
 * The rows are the places in view in the list's order, the picked one
 * marked. A row picks its place: the sheet steps down and the tap card
 * shows it over the map. The state is the sheet's own, so a drag never
 * re-renders the tab under it (audit-map.md: a 336 ms task on release).
 *
 *   rows       the places in view, best first (capped by the caller)
 *   count      how many places are in view
 *   pickedId   the picked place, marked in the rows; a new pick closes
 *              the sheet so the tap card has the map
 *   sort       the sort control (SortMenu), drawn in the head
 *   listSwitch the List | Map toggle (ExploreTab's viewSwitch): the way
 *              from the map view back to the full list view
 */
const STOPS = ['closed', 'peek', 'half', 'full'];
const PEEK_PX = 72;
// A release faster than this (px per ms) moves one stop the way it went.
const FLICK = 0.45;

export function MapSheet({ rows, count, pickedId, overviewOf, onPick, favSet, onToggleFav, sort, listSwitch = null, t, lang }) {
  const [stop, setStop] = React.useState('closed');
  const rootRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const [hostH, setHostH] = React.useState(0);
  const [topRoom, setTopRoom] = React.useState(0);
  const [drag, setDrag] = React.useState(null);
  const dragRef = React.useRef(null);

  // The host is the map's own box (above the nav); full stops under the
  // floating search and chips, so they stay in reach.
  React.useLayoutEffect(() => {
    const host = rootRef.current?.parentElement;
    if (!host) return undefined;
    const read = () => {
      setHostH(host.clientHeight);
      const top = host.getBoundingClientRect().top;
      let room = 0;
      for (const el of document.querySelectorAll('.band.is-map .band-row, .band.is-map .band-strip')) {
        const r = el.getBoundingClientRect();
        if (r.height) room = Math.max(room, r.bottom - top);
      }
      setTopRoom(Math.round(room + 8));
    };
    read();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    ro?.observe(host);
    return () => ro?.disconnect();
  }, []);

  const shown = (s) => {
    if (s === 'full') return Math.max(PEEK_PX, hostH - topRoom);
    if (s === 'half') return Math.max(PEEK_PX, Math.round(hostH * 0.5));
    if (s === 'peek') return PEEK_PX;
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
    if (e.target.closest('.xsheet-sort')) return;
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

  const n = new Intl.NumberFormat(lang).format(count);
  const offset = Math.max(0, hostH - visible);
  const open = stop !== 'closed' || drag != null;
  return (
    <>
      {stop === 'closed' && drag == null && !pickedId && (
        <Pressable className="xmap-listpill" onClick={() => setStop('half')}
          aria-expanded="false">
          <HouseIcon.list size={18} />
          <span>{t('explore.mapListOf', { n })}</span>
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
        inert={!open || undefined}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="xsheet-head">
          <Pressable className="xsheet-grab" aria-label={t(stop === 'full' ? 'drawer.full' : 'drawer.half')}
            aria-expanded={stop === 'half' || stop === 'full'}
            onClick={() => setStop(stop === 'full' ? 'peek' : stop === 'half' ? 'full' : 'half')}>
            <span className="xsheet-grab-bar" aria-hidden="true" />
          </Pressable>
          <div className="xsheet-row">
            <h2 className="xsheet-count">{t(countKey(lang, count, 'mapPanel.inViewOne', 'mapPanel.inView'), { n })}</h2>
            <span className="xsheet-sort">{sort}{listSwitch}</span>
          </div>
          <p className="xsheet-legend"><span className="xmap-best-dot" aria-hidden="true" />{t('explore.mapBestInView')}</p>
        </div>
        <div ref={bodyRef} className="xsheet-body" style={{ height: `${Math.max(0, shown(stop === 'closed' ? 'half' : stop) - PEEK_PX - 24)}px` }}>
          <div className="xrows xsheet-rows">
            {rows.map((p) => (
              <PlaceRow key={p.id} p={p} {...overviewOf(p)} t={t}
                selected={p.id === pickedId}
                fav={favSet ? favSet.has(p.id) : false} onToggleFav={onToggleFav}
                onOpen={() => { setStop('closed'); onPick(p.id); }} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
