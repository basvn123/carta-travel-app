import React from 'react';
import { Button } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { ChevronDownIcon } from '../../components/Icons.jsx';
import { createPortal } from 'react-dom';

/**
 * Sort as a menu behind one pill (T588): the choices as menu radios, the
 * current one ticked. Arrow keys, Home and End move inside it; Escape, a
 * pick or a press outside closes it and focus goes back to the pill. The
 * menu is fixed under the pill, so the toolbar's sideways scroll on a
 * phone does not clip it.
 */
// G12: `compact` draws the icon alone (the phone row once a chip exists);
// at 320 px CSS hides the word too, before any chip shrinks.
// G12 round 2: `showValue` says the order on the pill ("Sort: Best match"),
// the desktop applied row's right end.
// G12 map view round 2: `bare` draws the map sheet's quiet control (the
// icon, the current order and a chevron, no pill); a choice may carry
// `args` for its words (Distance names the From place) and `rule` (A to Z
// sits after a hairline).
export function SortMenu({ t, options, value, onChange, compact = false, showValue = false, bare = false, className = '' }) {
  const [pos, setPos] = React.useState(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const id = React.useId();
  const cur = options.find((o) => o.key === value) || options[0];
  const word = (o) => t(o.labelKey, o.args);
  const open = pos != null;
  const close = React.useCallback((refocus) => {
    setPos(null);
    if (refocus) btnRef.current?.focus();
  }, []);
  const toggle = () => {
    if (open) { close(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    const width = 260;
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
      <Button ref={btnRef} variant={bare ? 'quiet' : 'secondary'} size="sm"
        className={`xtool xtool-sort${open ? ' is-open' : ''}${compact ? ' is-compact' : ''}${bare ? ' is-bare' : ''}${className ? ` ${className}` : ''}`}
        iconStart={<HouseIcon.sort size={18} />} aria-haspopup="menu" aria-expanded={open}
        iconEnd={bare ? <ChevronDownIcon size={16} /> : undefined}
        aria-controls={open ? id : undefined}
        aria-label={t('explore.sortAria', { value: word(cur) })}
        title={compact ? t('explore.sortAria', { value: word(cur) }) : undefined}
        onClick={toggle}>
        <span className="xtool-word">
          {bare ? word(cur) : showValue ? t('filters.sortValue', { value: word(cur) }) : t('explore.toolSort')}
        </span>
      </Button>
      {open && createPortal(
        <div className="xsort-menu" role="menu" id={id} ref={menuRef} aria-label={t('places.sortLabel')}
          style={{ top: pos.top, left: pos.left }} onKeyDown={onMenuKey}>
          <p className="xsort-head" aria-hidden="true">{t('filters.sort')}</p>
          {options.map((o) => {
            const on = o.key === cur.key;
            return (
              <React.Fragment key={o.key}>
                {o.rule && <span className="xsort-rule" role="separator" />}
                <Button variant="quiet" size="sm" role="menuitemradio" aria-checked={on}
                  tabIndex={-1} className={`xsort-item${on ? ' is-on' : ''}`}
                  iconEnd={on ? <HouseIcon.check size={16} /> : null}
                  onClick={() => { onChange(o.key); close(true); }}>
                  {word(o)}
                </Button>
              </React.Fragment>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
