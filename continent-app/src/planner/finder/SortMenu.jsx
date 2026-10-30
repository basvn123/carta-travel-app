import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui/index.js';
import { CheckIcon, SortIcon } from '../../components/Icons.jsx';

/**
 * Sort as a menu behind one pill (T880), the same behaviour as Explore's
 * (ExploreTab SortMenu, T588; its styles copied as .tff-sortmenu, since the
 * planner does not load Explore's stylesheet): the choices as menu radios, the current one ticked; arrow keys, Home and End move inside
 * it; Escape, a pick or a press outside closes it and focus goes back to
 * the pill. The pill names the current sort, so a phone never needs a
 * segmented control that wraps. Fixed under the pill, so the toolbar's
 * sideways scroll on a phone does not clip it.
 *
 *   options   [{ key, label }]
 *   value     the current key
 *   label     the menu's accessible name ("Sort the trips")
 */
export function SortMenu({ options, value, onChange, label }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const id = useId();
  const cur = options.find((o) => o.key === value) || options[0];
  const open = pos != null;
  const close = useCallback((refocus) => {
    setPos(null);
    if (refocus) btnRef.current?.focus();
  }, []);
  const toggle = () => {
    if (open) { close(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    const width = 220;
    setPos({ top: Math.round(r.bottom + 4), left: Math.round(Math.max(16, Math.min(r.left, window.innerWidth - width - 16))) });
  };
  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[aria-checked="true"]')?.focus();
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close(false);
    };
    // Capture phase, and the key stops here: App keeps its own Escape stack.
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
      <Button ref={btnRef} variant="secondary" size="sm" className={`tff-sortbtn${open ? ' is-open' : ''}`}
        iconStart={<SortIcon size={16} />} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? id : undefined} aria-label={`${label}: ${cur.label}`} onClick={toggle}>
        {cur.label}
      </Button>
      {open && createPortal(
        <div className="tff-sortmenu" role="menu" id={id} ref={menuRef} aria-label={label}
          style={{ top: pos.top, left: pos.left }} onKeyDown={onMenuKey}>
          {options.map((o) => {
            const on = o.key === cur.key;
            return (
              <Button key={o.key} variant="quiet" size="sm" role="menuitemradio" aria-checked={on}
                tabIndex={-1} className={`tff-sortitem${on ? ' is-on' : ''}`}
                iconEnd={on ? <CheckIcon size={16} /> : null}
                onClick={() => { onChange(o.key); close(true); }}>
                {o.label}
              </Button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
