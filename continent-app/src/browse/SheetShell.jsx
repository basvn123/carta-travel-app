import React from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../components/Icons.jsx';
import { useAnchoredSheet } from './sheetAnchor.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * The sheet, as one shell (P4.2).
 *
 * The filter sheets each grew their own copy of the same scaffold: a scrim
 * that closes on a click outside, a focus trap with Escape, a grab handle
 * that swipes the panel away on touch, and useAnchoredSheet to hang the
 * panel off its trigger on a pointer screen. This is that scaffold, with
 * nothing of the filters in it, so a new sheet is a title and a body rather
 * than a fourth transcription of the contract.
 *
 * The filter sheets are not ported onto it here: they carry drag state and
 * footer actions of their own, and rewriting three working surfaces to add
 * a fourth is how a small change becomes a regression. New sheets take this.
 */
export function SheetShell({
  title, onClose, anchorRef, width = 520, className = '',
  labelId = 'sheetshell-title', closeLabel, children,
}) {
  const { t } = useI18n();
  const scrimRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const anchor = useAnchoredSheet(anchorRef, width);

  React.useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // Capture phase and stopPropagation, so a sheet opened over another
        // overlay closes itself rather than the whole stack.
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = panelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [onClose]);

  // Swipe-down dismiss on touch, from the grab handle.
  const drag = React.useRef({ id: null, y0: 0 });
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return;
    drag.current = { id: e.pointerId, y0: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (drag.current.id !== e.pointerId) return;
    const dy = Math.max(0, e.clientY - drag.current.y0);
    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
      panelRef.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const onPointerUp = (e) => {
    if (drag.current.id !== e.pointerId) return;
    const dy = Math.max(0, e.clientY - drag.current.y0);
    drag.current = { id: null, y0: 0 };
    if (panelRef.current) {
      panelRef.current.style.transition = '';
      panelRef.current.style.transform = '';
    }
    if (dy > 90) onClose();
  };

  return createPortal(
    <div
      className={`fsheet-scrim${anchor ? ' is-anchored' : ''}`}
      ref={scrimRef}
      onMouseDown={(e) => { if (e.target === scrimRef.current) onClose(); }}
    >
      <div
        className={`fsheet ${className}${anchor ? ' is-anchored' : ''}`}
        ref={panelRef}
        style={anchor || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
      >
        <div
          className="fsheet-head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="fsheet-grab" aria-hidden="true" />
          <div className="fsheet-head-row">
            <h2 className="fsheet-title" id={labelId}>{title}</h2>
            <button
              type="button"
              className="fsheet-close"
              onClick={onClose}
              ref={closeRef}
              aria-label={closeLabel || t('legend.closeMethod')}
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>
        <div className="fsheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
