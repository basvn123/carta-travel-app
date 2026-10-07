import React, {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/index.jsx';
import { glossaryKeys, glossarySplit, hasTerm } from '../lib/glossary.js';

/**
 * One glossary marker for the whole product (T156, carta-design: InfoDot).
 *
 *   <InfoDot term="hardpack" />
 *
 * A 6 px ink-mute dot set after the word or figure it explains, inside a
 * real button with a 44 px box. It opens a popover with the term and one or
 * two sentences, both read from the shared glossary (src/lib/glossary.js
 * and the `glossary.*` catalogue keys), never written on the screen. Escape,
 * a second tap or a tap outside closes it and focus returns to the dot.
 *
 * Use one dot per term per view, on the first occurrence. Never on a
 * heading, a button label or a price pin. A term that is not in the
 * glossary renders nothing, so a typo cannot ship an empty dot.
 *
 * The popover is portalled to the body and placed with position: fixed, so
 * no overflow or transform on an ancestor clips it. It closes on scroll and
 * resize rather than chasing the dot.
 */

const POP_W = 280;
const GUTTER = 12;
const GAP = 8;

export function InfoDot({ term, className = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const id = useId();
  const known = hasTerm(term);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) btnRef.current?.focus();
  }, []);

  // Place the popover under the dot, flipped above it when there is no room,
  // and kept inside the viewport on a 380 px phone.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const w = Math.min(POP_W, window.innerWidth - 2 * GUTTER);
    const centre = r.left + r.width / 2;
    const left = Math.max(GUTTER, Math.min(centre - w / 2, window.innerWidth - GUTTER - w));
    const h = popRef.current?.offsetHeight || 120;
    const below = r.bottom + GAP;
    const top = below + h > window.innerHeight - GUTTER && r.top - GAP - h > GUTTER
      ? r.top - GAP - h
      : below;
    setPos({ left, top, width: w });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    // Capture phase on the window, so this runs before a full-screen page's
    // own Escape handler: one press closes the popover, not the page.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close(true);
    };
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close(false);
    };
    const onMove = () => close(false);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, close]);

  if (!known) return null;
  const keys = glossaryKeys(term);
  const name = t(keys.term);

  return (
    <span className={`infodot ${className}`.trim()}>
      <button
        ref={btnRef}
        type="button"
        className="infodot-btn"
        aria-label={t('glossary.dotLabel', { term: name })}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-term={term}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <span className="infodot-mark" aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          id={id}
          role="dialog"
          aria-label={name}
          className="infodot-pop"
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: 'hidden' }}
        >
          <strong className="infodot-term">{name}</strong>
          <p className="infodot-text">{t(keys.text)}</p>
        </div>,
        document.body,
      )}
    </span>
  );
}

/**
 * A line of written copy with a dot after the first mention of each glossary
 * term in it. The words stay as authored; only the dot is added. Terms
 * without a `match` pattern are never found here (see glossary.js).
 */
export function GlossLine({ text }) {
  const parts = glossarySplit(text);
  if (!parts.some((p) => p.term)) return String(text ?? '');
  return (
    <>
      {parts.map((p, i) => (p.term
        ? <InfoDot key={`d${i}`} term={p.term} />
        : <React.Fragment key={`t${i}`}>{p.text}</React.Fragment>))}
    </>
  );
}
