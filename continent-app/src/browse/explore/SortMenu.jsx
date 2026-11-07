import React from 'react';
import { Button } from '../../components/ui/index.js';
import { SortIcon, CheckIcon } from '../../components/Icons.jsx';
import { createPortal } from 'react-dom';

/**
 * Sort as a menu behind one pill (T588): the choices as menu radios, the
 * current one ticked. Arrow keys, Home and End move inside it; Escape, a
 * pick or a press outside closes it and focus goes back to the pill. The
 * menu is fixed under the pill, so the toolbar's sideways scroll on a
 * phone does not clip it.
 */
export function SortMenu({ t, options, value, onChange }) {
  const [pos, setPos] = React.useState(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const id = React.useId();
  const cur = options.find((o) => o.key === value) || options[0];
  const open = pos != null;
  const close = React.useCallback((refocus) => {
    setPos(null);
    if (refocus) btnRef.current?.focus();
  }, []);
  const toggle = () => {
    if (open) { close(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    const width = 220;
    setPos({
      top: Math.round(r.bottom + 4),
      left: Math.round(Math.max(16, Math.min(r.left, window.innerWidth - width - 16))),
    });
  };
  React.useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[aria-checked="true"]')?.focus();
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) close(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, close]);
  const onMenuKey = (e) => {
    const items = [...menuRef.current.querySelectorAll('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    else if (e.key === 'Tab') { close(false); return; }
    if (next) { e.preventDefault(); next.focus(); }
  };
  return (
    <>
      <Button ref={btnRef} variant="secondary" size="sm" className={`xtool${open ? ' is-open' : ''}`}
        iconStart={<SortIcon size={18} />} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${t('places.sortLabel')}: ${t(cur.labelKey)}`}
        onClick={toggle}>
        {t('explore.toolSort')}
      </Button>
      {open && createPortal(
        <div className="xsort-menu" role="menu" id={id} ref={menuRef} aria-label={t('places.sortLabel')}
          style={{ top: pos.top, left: pos.left }} onKeyDown={onMenuKey}>
          {options.map((o) => {
            const on = o.key === cur.key;
            return (
              <Button key={o.key} variant="quiet" size="sm" role="menuitemradio" aria-checked={on}
                tabIndex={-1} className={`xsort-item${on ? ' is-on' : ''}`}
                iconEnd={on ? <CheckIcon size={16} /> : null}
                onClick={() => { onChange(o.key); close(true); }}>
                {t(o.labelKey)}
              </Button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
