import { useI18n } from '../../i18n/index.jsx';
import { useState, useRef, useEffect } from 'react';
import { IconButton } from '../../components/ui/index.js';
import { MoreIcon } from '../../components/Icons.jsx';
import { Button } from '../../components/Button.jsx';

/**
 * The planned view's "More" menu (carta-design "More" menu rule, T388): the
 * footer keeps Plan your days and Save trip, and every further action sits
 * behind one secondary button with menu semantics. Escape and a click outside
 * close it and focus returns to the button; the arrow keys move between the
 * items. A destructive item is drawn in --danger text and keeps its confirm.
 */
// T832: `round` draws the button as the trip page's round icon button and
// opens the menu downward (it sits on the page's top row now, not a footer).
export function MoreMenu({ items, round = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const first = wrapRef.current?.querySelector('[role="menuitem"]');
    first?.focus();
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const list = [...(wrapRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next].focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className={`trip-more${round ? ' is-down' : ''}`} ref={wrapRef}>
      {round ? (
        <IconButton
          ref={btnRef}
          tone="surface"
          className="trip-more-btn"
          label={t('trip.moreActionsAria')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreIcon size={20} />
        </IconButton>
      ) : (
        <Button
          ref={btnRef}
          className="trip-more-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t('trip.moreActions')}
        </Button>
      )}
      {open && (
        <div className="trip-more-menu" role="menu" aria-label={t('trip.moreActionsAria')}>
          {shown.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={`trip-more-item ${it.danger ? 'is-danger' : ''} ${it.className || ''}`}
              title={it.title}
              onClick={() => { setOpen(false); it.onClick(); }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
