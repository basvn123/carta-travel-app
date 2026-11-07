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

export function DialogSheet({ titleId, title, className = '', onClose, closeLabel, skipEscapeWhen = null, children }) {
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const skip = skipEscapeWhen ? () => skipEscapeWhen(panelRef.current) : null;
  useFocusTrap(panelRef, onClose, { initialFocusRef: closeRef, skipEscapeWhen: skip });
  return createPortal(
    <div className="frr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`frr-sheet ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef}>
        <div className="frr-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton label={closeLabel} onClick={onClose} ref={closeRef}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
