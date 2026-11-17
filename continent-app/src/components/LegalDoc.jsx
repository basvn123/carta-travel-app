import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { scrollBehavior, useDialogExit } from '../lib/motion.js';
import { useI18n } from '../i18n/index.jsx';
import { CloseIcon } from './Icons.jsx';
import { Blaze, IconButton } from './ui/index.js';
import '../styles/brand-pages.css';

/**
 * LegalDoc (T461): the reading page the privacy policy, the terms and the
 * imprint share. It was a 380 px modal at 12.5 px; it is now a wide dialog
 * (a full-height sheet on a phone) set for reading: body text at the reading
 * size and measure, section headings, the date under the title, and a list of
 * contents built from the document's own headings, beside the text from
 * 1024 px and folded above it on smaller screens. One close, Escape, a focus
 * trap and focus back to the opener, as every dialog in the family.
 *
 * The documents stay English only, as before (register row T461-c); the
 * cookie page (T945) is in six languages and names its own contents list.
 */
export function LegalDoc({ id, title, updated, onClose, children, contentsLabel = 'Contents' }) {
  const { t } = useI18n();
  const cardRef = useRef(null);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const exit = useDialogExit(onClose);
  // Focus opens on the title, so the reader starts at the top and a screen
  // reader announces the document, not a ring around Close.
  useFocusTrap(cardRef, exit.close, { initialFocusRef: titleRef });
  const [toc, setToc] = useState([]);

  useLayoutEffect(() => {
    const heads = [...(bodyRef.current?.querySelectorAll('h3') || [])];
    heads.forEach((h, i) => { if (!h.id) h.id = `${id}-s${i + 1}`; });
    setToc(heads.map((h) => ({ id: h.id, label: h.textContent })));
  }, [id]);

  // House style (G1 2026-11): the contents mark the section you are in
  // ("here", the blaze), from the last heading that has scrolled past the
  // top of the reading column. Presentation only; nothing else listens.
  const [here, setHere] = useState('');
  const colsRef = useRef(null);
  useEffect(() => {
    const box = colsRef.current;
    if (!box || toc.length < 3) return undefined;
    const pick = () => {
      const top = box.getBoundingClientRect().top + 24;
      let cur = toc[0].id;
      for (const s of toc) {
        const el = box.querySelector(`#${CSS.escape(s.id)}`);
        if (el && el.getBoundingClientRect().top <= top) cur = s.id;
      }
      setHere(cur);
    };
    pick();
    box.addEventListener('scroll', pick, { passive: true });
    return () => box.removeEventListener('scroll', pick);
  }, [toc]);

  const go = (ev, target) => {
    ev.preventDefault();
    const el = cardRef.current?.querySelector(`#${CSS.escape(target)}`);
    el?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    el?.setAttribute('tabindex', '-1');
    el?.focus({ preventScroll: true });
    setHere(target);
    // On a phone the list sits above the text; fold it once it has done its job.
    ev.currentTarget.closest('details')?.removeAttribute('open');
  };

  // The trap wraps at its first and last control, but the title and a jumped
  // to heading hold focus without being in its list (tabindex -1). Tab from
  // one of them goes to the next control in the document, Shift+Tab to the
  // previous one, and both wrap, so focus never leaves the dialog.
  const onKeyDown = (ev) => {
    if (ev.key !== 'Tab') return;
    const card = cardRef.current;
    const at = document.activeElement;
    if (!card || !at || at.getAttribute('tabindex') !== '-1' || !card.contains(at)) return;
    const items = [...card.querySelectorAll('a[href], button:not([disabled]), summary, input, select, textarea, [tabindex="0"]')]
      .filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const after = items.filter((el) => at.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    const before = items.filter((el) => at.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
    const next = ev.shiftKey ? (before[before.length - 1] || items[items.length - 1]) : (after[0] || items[0]);
    ev.preventDefault();
    ev.stopPropagation();
    next.focus();
  };

  const contents = toc.length > 2 && (
    <ol className="legal-toc-list">
      {toc.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} onClick={(ev) => go(ev, s.id)} aria-current={here === s.id ? 'location' : undefined}>
            {here === s.id && <Blaze size="sm" className="hs-paint" />}
            {s.label}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className={`auth-overlay legal-overlay shell-scrim${exit.leaving ? ' is-leaving' : ''}`} onClick={exit.close}>
      <div
        className={`legal-doc privacy-modal shell-dialog hs-legal${exit.leaving ? ' is-leaving' : ''}`}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={onKeyDown}
      >
        <header className="legal-head">
          <div>
            <h2 className="legal-title" id={`${id}-title`} ref={titleRef} tabIndex={-1}>{title}</h2>
            {updated && <p className="legal-updated">Last updated {updated}</p>}
          </div>
          <IconButton label={t('a11y.close')} onClick={exit.close}><CloseIcon size={16} /></IconButton>
        </header>
        <div className="legal-cols" ref={colsRef}>
          {contents && (
            <nav className="legal-toc" aria-label={contentsLabel}>
              <details className="legal-toc-fold">
                <summary>{contentsLabel}</summary>
                {contents}
              </details>
              <div className="legal-toc-wide">
                <p className="legal-toc-title">{contentsLabel}</p>
                {contents}
              </div>
            </nav>
          )}
          <div className="legal-body privacy-body" ref={bodyRef}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
