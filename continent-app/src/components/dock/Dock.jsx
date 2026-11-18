import React, {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/index.js';
import { HouseIcon } from '../HouseIcons.jsx';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { prefersReducedMotion } from '../../lib/motion.js';
import { clearDockFocus, closeDock, getDock, toggleDock, useDock } from './dockStore.js';
import '../../styles/89-dock.css';

/**
 * Dock (G12, explore polish; decision.md "Dock semantics"): one control that
 * grows in place from its own corner into a card. Two of them share this
 * component and one store (dockStore.js), so they move and close alike:
 *
 *   anchor="under-tabs"  the Trip dock, a 44 px pill at the right end of the
 *                        row under the category tabs; the card grows down
 *   anchor="corner"      the Style dock, a disc in the bottom-left corner.
 *                        It passes onActivate and has no card: a tap opens
 *                        the Style Studio, the one place a style is edited
 *                        (Style Studio, G12)
 *
 * Below 769 px the card is a real modal: aria-modal, the rest of the app
 * inert, a scrim, Tab kept inside, and it spans the full width of the screen
 * (owner, 2026-11-17). From 769 px it is a non-modal popover after its
 * trigger: no trap, and Escape, a press outside or focus leaving it closes it.
 * Escape inside a drilled row goes back one level first (useDockBack).
 *
 * Motion is CSS only (89-dock.css), on the --dur-* and --ease-* tokens: the
 * card scales up from its corner, the rows arrive 24 ms apart, the chevron
 * turns; reduced motion shows the end state.
 */

const DockContext = createContext(null);
// The card's place is measured before paint in a browser; a server render
// (the tests) has nothing to measure.
const useBeforePaint = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

/** Inside a dock: close it, and register a "back one level" for Escape. */
// eslint-disable-next-line react-refresh/only-export-components -- the docks' rows need it beside the Dock they live in
export function useDockBack(back) {
  const ctx = useContext(DockContext);
  const ref = ctx?.backRef;
  useEffect(() => {
    if (!ref) return undefined;
    ref.current = back;
    return () => { if (ref.current === back) ref.current = null; };
  }, [ref, back]);
  return ctx;
}

export function Dock({
  id, anchor = 'under-tabs', glyph, label, title = '', changed = false, heading,
  headingHidden = false, className = '', hidden = false, onActivate = null, children,
}) {
  const { open, focus } = useDock();
  // A disc with onActivate opens something else, so its own card never opens.
  const isOpen = open === id && !hidden && !onActivate;
  const isDesktop = useIsDesktop();
  const modal = !isDesktop;
  const cardId = useId();
  const headId = useId();
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const cardRef = useRef(null);
  const backRef = useRef(null);

  const close = useCallback(() => closeDock(id), [id]);
  // Escape walks back out of a drilled row first, then closes.
  const back = useCallback(() => (backRef.current ? backRef.current() !== false : false), []);

  // A dock hidden while open (Plan, a page over it) closes, so nothing is
  // left inert behind it.
  useEffect(() => { if (hidden && open === id) closeDock(id); }, [hidden, open, id]);

  // Phone: a real modal (WCAG dialog pattern). The app behind is inert; the
  // trap moves focus in, keeps Tab inside and hands focus back to the
  // trigger on close. The inert effect is declared first so its cleanup runs
  // first: the trigger must be live again before the trap focuses it.
  useEffect(() => {
    if (!isOpen || !modal) return undefined;
    const root = document.getElementById('root');
    const trigger = triggerRef.current;
    root?.setAttribute('inert', '');
    return () => {
      root?.removeAttribute('inert');
      // The trap hands focus to whatever opened it, which after a hand-over
      // (the Trip dock's Style row) is the other dock's trigger. Closing goes
      // back to this dock's own trigger, unless another dock is opening.
      requestAnimationFrame(() => { if (!getDock().open) trigger?.focus({ preventScroll: true }); });
    };
  }, [isOpen, modal]);
  useFocusTrap(cardRef, close, { enabled: isOpen && modal, skipEscapeWhen: back });

  // Desktop: a popover. Escape closes it (or steps back), a press outside or
  // focus leaving it closes it; focus moves in once on open.
  useEffect(() => {
    if (!isOpen || modal) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (back()) return;
      close();
      triggerRef.current?.focus();
    };
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    const first = cardRef.current?.querySelector('button:not([disabled]), [href], input:not([disabled]), [tabindex="0"]');
    first?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [isOpen, modal, back, close]);

  // The row the dock was asked to open on (the price sheet's hand-off): its
  // first control takes focus and its label paints once.
  useEffect(() => {
    if (!isOpen || !focus) return;
    const row = cardRef.current?.querySelector(`[data-dock-row="${focus}"]`);
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      const ctl = row.matches('button, a') ? row : row.querySelector('button:not([disabled]), input, [tabindex="0"]');
      ctl?.focus({ preventScroll: true });
      row.classList.remove('is-pulse');
      void row.offsetWidth;
      row.classList.add('is-pulse');
    }
    clearDockFocus();
  }, [isOpen, focus]);

  // Where the phone card sits: under the trigger, the full width of the
  // screen. (The corner disc has no card: it opens the Style Studio.)
  useBeforePaint(() => {
    if (!isOpen || !modal) return;
    const r = triggerRef.current?.getBoundingClientRect();
    const card = cardRef.current;
    if (!r || !card) return;
    card.style.setProperty('--dock-top', `${Math.round(r.bottom)}px`);
  }, [isOpen, modal]);

  const onBlur = (e) => {
    if (modal || !isOpen) return;
    const next = e.relatedTarget;
    if (next && !wrapRef.current?.contains(next) && getDock().open === id) close();
  };

  const card = (
    <div
      ref={cardRef}
      id={cardId}
      role="dialog"
      aria-modal={modal ? 'true' : 'false'}
      aria-labelledby={headId}
      className={`dock-card dock-card--${anchor}${modal ? ' is-modal' : ''}${isOpen ? ' is-open' : ''}`}
      inert={isOpen ? undefined : ''}
    >
      <h2 id={headId} className={headingHidden ? 'sr-only' : 'dock-head'}>{heading}</h2>
      <div className="dock-body">{children}</div>
    </div>
  );
  const scrim = (
    <div className={`dock-scrim${isOpen ? ' is-open' : ''}`} aria-hidden="true" onClick={close} />
  );

  if (hidden) return null;
  return (
    <DockContext.Provider value={{ close, backRef, isOpen }}>
      <div ref={wrapRef} className={`dock dock--${anchor} ${className}`.trim()} onBlur={onBlur}>
        <Button
          ref={triggerRef}
          variant="quiet"
          className={`dock-trigger dock-trigger--${anchor}${changed ? ' is-changed' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={onActivate ? undefined : isOpen}
          aria-controls={onActivate ? undefined : cardId}
          aria-label={label}
          title={title || undefined}
          onClick={onActivate || (() => toggleDock(id))}
        >
          <span className="dock-glyph">{glyph}</span>
          {anchor === 'corner'
            ? <span className="dock-badge"><HouseIcon.next size={14} className="dock-chev" /></span>
            : <HouseIcon.next size={16} className="dock-chev" />}
          {changed && <span className="dock-dot" />}
        </Button>
        {/* On a phone the card leaves the app's tree, so the app can be
            inert while the card stays live. */}
        {onActivate ? null : modal && typeof document !== 'undefined' ? createPortal(<>{scrim}{card}</>, document.body) : card}
      </div>
    </DockContext.Provider>
  );
}

/** A row that opens something: a label, its value and a chevron, full width. */
export function DockRowButton({ index = 0, rowKey, label, value, onClick, ariaLabel, extra = null, ...rest }) {
  return (
    <Button
      variant="quiet"
      className="dock-row dock-row--button"
      style={{ '--i': index }}
      data-dock-row={rowKey}
      aria-label={ariaLabel}
      onClick={onClick}
      iconEnd={<HouseIcon.next size={18} />}
      {...rest}
    >
      <span className="dock-row-label">{label}</span>
      <span className="dock-row-value">{value}</span>
      {extra}
    </Button>
  );
}

/** A row that holds its own control (chips, a segmented control, steppers). */
export function DockRowField({ index = 0, rowKey, label, labelId, children, className = '' }) {
  return (
    <div className={`dock-row dock-row--field ${className}`.trim()} style={{ '--i': index }} data-dock-row={rowKey}>
      <span className="dock-row-label" id={labelId}>{label}</span>
      <div className="dock-row-control">{children}</div>
    </div>
  );
}
