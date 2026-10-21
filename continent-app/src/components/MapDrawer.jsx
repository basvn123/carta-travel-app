import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { ChevronDownIcon } from './Icons.jsx';
import { prefersReducedMotion } from '../lib/motion.js';
import { Button, IconButton } from './ui/index.js';
import { STRIP_PX, drawerVisiblePx, nearestDrawerState, nextDrawerState } from '../lib/mapDrawerState.js';

/**
 * The map drawer (T500, roadmap 1.3c section 3 and 1.17; owner T490-h, T490-k,
 * T492-g). One shared drawer for the planners on a phone: the map fills the
 * screen and this drawer lies over it in three states.
 *
 *   'strip'  72 px: the strip slot only (the amount, always visible)
 *   'half'   half the host's height: the strip, then the body
 *   'full'   up to under the header: the strip, the body, the footer
 *
 * The handle is a real 48 px button whose label names what it does in each
 * state (strip: show more, half: show all, full: show the map). Dragging the
 * strip is a shortcut, never the only way. Under prefers-reduced-motion the
 * drawer moves without a transition.
 *
 * It positions itself inside its host (position: absolute, inset 0 bottom
 * anchored), so the host must be a positioned box that stops under the header
 * and above the bottom nav. While the drawer is full on a phone, the bottom
 * nav steps aside (T492-g): 60-v6-shell's pattern, read through
 * `html:has(.map-drawer.is-full)`, so a planner kept mounted in a hidden tab
 * never hides the nav. T501 reuses this component for the day planner.
 *
 * Props
 *   state          'strip' | 'half' | 'full' (controlled)
 *   onStateChange  (next) => void
 *   strip          node: the always-visible strip content (the amount)
 *   children       node: the body, scrolls inside the drawer
 *   footer         node: one row of actions, shown in half and full
 *   labels         { strip, half, full }: the handle's label in each state
 *   mapLabel       label of the "Map" button shown when full
 *   className, ariaLabel
 */
export function MapDrawer({
  state = 'strip', onStateChange, strip = null, children = null, footer = null,
  labels = null, mapLabel = null, className = '', ariaLabel = null,
}) {
  const { t } = useI18n();
  const uid = useId();
  const rootRef = useRef(null);
  const [hostH, setHostH] = useState(0);
  const drag = useRef(null);
  const [dragPx, setDragPx] = useState(null);
  // A drag ends in a click on whatever it started on; that click is swallowed.
  const swallowRef = useRef(false);

  // The host's height, so the half stop and the body's room are real pixels.
  useLayoutEffect(() => {
    const host = rootRef.current?.parentElement;
    if (!host) return undefined;
    const read = () => setHostH(host.clientHeight);
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const set = useCallback((next) => { if (next !== state) onStateChange?.(next); }, [state, onStateChange]);

  // Escape from a full drawer goes back to the map, the way the handle does.
  useEffect(() => {
    if (state !== 'full') return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (!rootRef.current?.contains(document.activeElement)) return;
      set('half');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, set]);

  const visibleFor = (s) => drawerVisiblePx(s, hostH);
  const visible = dragPx != null ? dragPx : visibleFor(state);
  // The drawer is always the host's full height and slides; nothing animates
  // a height (carta-design, motion). The body is given the room it can show.
  const offset = Math.max(0, hostH - visible);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, select, textarea, .map-drawer-map')) return;
    drag.current = { id: e.pointerId, y0: e.clientY, v0: visibleFor(state), moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = d.y0 - e.clientY;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) {
      d.moved = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
    }
    setDragPx(Math.max(STRIP_PX, Math.min(hostH, d.v0 + dy)));
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
      const px = Math.max(STRIP_PX, Math.min(hostH, d.v0 + (d.y0 - e.clientY)));
      setDragPx(null);
      set(nearestDrawerState(px, hostH));
      swallowRef.current = true;
      window.setTimeout(() => { swallowRef.current = false; }, 0);
    }
  };
  const handleLabel = (labels && labels[state]) || t(`drawer.${state}`);
  const reduced = prefersReducedMotion();
  const bodyId = `${uid}-body`;

  return (
    <section
      ref={rootRef}
      className={`map-drawer is-${state} ${dragPx != null ? 'is-dragging' : ''} ${reduced ? 'is-still' : ''} ${className}`.trim()}
      style={{ transform: `translateY(${offset}px)`, '--md-visible': `${visible}px` }}
      aria-label={ariaLabel || undefined}
    >
      <div
        className="map-drawer-strip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => { if (swallowRef.current) { e.stopPropagation(); e.preventDefault(); } }}
      >
        <span className="map-drawer-grab" aria-hidden="true" />
        <div className="map-drawer-strip-slot">{strip}</div>
        {state === 'full' && (
          <Button variant="secondary" size="sm" className="map-drawer-map" onClick={() => set('strip')}>
            {mapLabel || t('drawer.map')}
          </Button>
        )}
        <IconButton
          className="map-drawer-handle"
          label={handleLabel}
          aria-expanded={state !== 'strip'}
          aria-controls={bodyId}
          onClick={() => set(nextDrawerState(state))}
        >
          <ChevronDownIcon size={20} className="map-drawer-chev" />
        </IconButton>
      </div>
      <div className="map-drawer-body" id={bodyId} hidden={state === 'strip' && dragPx == null}>
        <div className="map-drawer-scroll">{children}</div>
        {footer && <div className="map-drawer-foot">{footer}</div>}
      </div>
    </section>
  );
}
