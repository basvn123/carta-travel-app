import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Custom calendar date field — matches the editorial paper/ink/rust palette.
 *
 * Replaces the native <input type="date">, whose popup calendar is rendered by
 * the browser/OS (white chrome, blue selection) and cannot be styled with CSS.
 *
 * Props:
 *   value           — selected date as ISO 'YYYY-MM-DD' (or '' / null)
 *   onChange(iso)   — called with the new ISO date string when a day is picked
 *   min, max        — optional ISO bounds; days outside are disabled
 *   placeholder     — trigger text when nothing is selected
 */

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 6-week (42-cell) grid covering the visible month plus padding days.
function buildGrid(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const start = new Date(year, month, 1 - firstWeekday);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      y: d.getFullYear(),
      m: d.getMonth(),
      d: d.getDate(),
      outside: d.getMonth() !== month,
    });
  }
  return cells;
}

export function DateField({ value, onChange, min, max, placeholder = 'Select…' }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const sel = parseISO(value);
  const todayISO = useMemo(() => {
    const t = new Date();
    return toISO(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const [view, setView] = useState(() => {
    const base = sel || parseISO(min) || parseISO(todayISO);
    return { y: base.y, m: base.m };
  });

  // Jump the visible month to the selected date each time the popup opens.
  useEffect(() => {
    if (open && sel) setView({ y: sel.y, m: sel.m });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click / Escape — same convention as Dropdown.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cells = useMemo(() => buildGrid(view.y, view.m), [view.y, view.m]);

  const isDisabled = (iso) => (min && iso < min) || (max && iso > max);

  const label = sel
    ? `${String(sel.d).padStart(2, '0')} ${MONTHS[sel.m].slice(0, 3)} ${sel.y}`
    : placeholder;

  const pick = (cell) => {
    const iso = toISO(cell.y, cell.m, cell.d);
    if (isDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
  };

  const shiftMonth = (delta) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  // Disable an arrow when the entire adjacent month falls outside the bounds.
  const prevDisabled = (() => {
    if (!min) return false;
    const lastOfPrev = toISO(...(() => {
      const d = new Date(view.y, view.m, 0); // day 0 = last day of prev month
      return [d.getFullYear(), d.getMonth(), d.getDate()];
    })());
    return lastOfPrev < min;
  })();
  const nextDisabled = (() => {
    if (!max) return false;
    const firstOfNext = toISO(...(() => {
      const d = new Date(view.y, view.m + 1, 1);
      return [d.getFullYear(), d.getMonth(), d.getDate()];
    })());
    return firstOfNext > max;
  })();

  return (
    <div className="date-field" ref={wrapperRef}>
      <button
        type="button"
        className={`date-field-trigger ${open ? 'open' : ''} ${sel ? '' : 'placeholder'}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>

      {open && (
        <div className="cal" role="dialog" aria-label="Choose date">
          <div className="cal-head">
            <button
              type="button"
              className="cal-nav"
              onClick={() => shiftMonth(-1)}
              disabled={prevDisabled}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="cal-title">{MONTHS[view.m]} {view.y}</span>
            <button
              type="button"
              className="cal-nav"
              onClick={() => shiftMonth(1)}
              disabled={nextDisabled}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="cal-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w} className="cal-weekday">{w}</span>
            ))}
          </div>

          <div className="cal-grid">
            {cells.map((cell, i) => {
              const iso = toISO(cell.y, cell.m, cell.d);
              const selected = sel && iso === toISO(sel.y, sel.m, sel.d);
              const disabled = isDisabled(iso);
              const cls = [
                'cal-day',
                cell.outside ? 'outside' : '',
                selected ? 'selected' : '',
                iso === todayISO ? 'today' : '',
                disabled ? 'disabled' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  onClick={() => pick(cell)}
                  disabled={disabled}
                  tabIndex={cell.outside ? -1 : 0}
                >
                  {cell.d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
