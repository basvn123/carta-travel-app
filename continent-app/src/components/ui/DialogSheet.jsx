/*
 * DialogSheet (T1121, roadmap G2): the centred sheet with a scrim, a head
 * (title and close) and a focus trap, built once. FlightSheet ("Your
 * flight") and RatingSheet ("Why it rates") each wrote the scrim and head
 * out line for line; the markup and the frr-* classes are theirs, unchanged.
 *
 * The bottom sheets of the planner and Explore use browse/SheetShell.jsx
 * (fsheet-*), which adds a swipe handle and an exit animation; this one is
 * the short modal over the page, portalled to <body>.
 *
 * Props
 *   titleId, title   the heading and its id (the dialog's aria-labelledby)
 *   className        added to frr-sheet (rs-sheet for the rating sheet)
 *   onClose          the close button, Escape and a press on the scrim
 *   closeLabel       the close button's accessible name
 *   skipEscapeWhen   (panel) => true leaves Escape to a child popover
 *   children         the body, in the caller's own element (a form, a div)
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { IconButton } from './IconButton.jsx';
import { CloseIcon } from '../Icons.jsx';

// Longest exit (--dur-2 plus slack): onClose still runs if animationend never fires.
const EXIT_FALLBACK_MS = 320;

export function DialogSheet({ titleId, title, className = '', onClose, closeLabel, skipEscapeWhen = null, children }) {
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const [leaving, setLeaving] = React.useState(false);
  const doneRef = React.useRef(false);
  const timerRef = React.useRef(0);
  React.useEffect(() => () => clearTimeout(timerRef.current), []);
  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    onClose();
  }, [onClose]);
  const close = React.useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    timerRef.current = setTimeout(finish, EXIT_FALLBACK_MS);
  }, [leaving, finish]);
  const skip = skipEscapeWhen ? () => skipEscapeWhen(panelRef.current) : null;
  useFocusTrap(panelRef, close, { initialFocusRef: closeRef, skipEscapeWhen: skip });
  return createPortal(
    <div className={`frr-scrim hs-dscrim${leaving ? ' is-leaving' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`frr-sheet hs-dsheet${leaving ? ' is-leaving' : ''} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef}
        onAnimationEnd={(e) => { if (leaving && e.target === e.currentTarget) finish(); }}>
        <div className="frr-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton label={closeLabel} onClick={close} ref={closeRef}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
