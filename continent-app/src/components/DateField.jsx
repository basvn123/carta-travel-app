import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Custom calendar date field, matches the editorial paper/ink/rust palette.
 *
 * Replaces the native <input type="date">, whose popup calendar is rendered by
 * the browser/OS (white chrome, blue selection) and cannot be styled with CSS.
 *
 * Props:
 *   value           - selected date as ISO 'YYYY-MM-DD' (or '' / null)
 *   onChange(iso)   - called with the new ISO date string when a day is picked
 *   min, max        - optional ISO bounds; days outside are disabled
 *   placeholder     - trigger text when nothing is selected
 *   inline          - render the calendar in the page instead of behind a
 *                     trigger, so choosing dates is not a trip through a modal
 *   panes           - how many consecutive months to show (inline range work
 *                     reads far better across two)
 *   rangeStart/End  - ISO span to shade, for picking a start and an end on one
 *                     calendar; purely presentational, the parent owns which
 *                     end a click sets
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

// 6-week (42-cell) grid covering the visible month plus padding days. With
// `trim`, a month that fits in five weeks drops its trailing all-padding row
// rather than paying a whole empty week of height for it. Side-by-side panes
// keep the full six rows so the two months stay the same height.
function buildGrid(year, month, trim) {
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
  return trim && cells.slice(-7).every((c) => c.outside) ? cells.slice(0, 35) : cells;
}

export function DateField({
  value, onChange, min, max, placeholder = 'Select…',
  inline = false, panes = 1, rangeStart = null, rangeEnd = null,
}) {
  // Inline calendars are never "closed": the whole point is that the dates are
  // choosable without opening anything.
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

  // Follow the range as the parent moves it, so picking a start in July and an
  // end in August doesn't strand the view on the month you started in.
  useEffect(() => {
    if (!inline) return;
    const base = parseISO(rangeStart) || parseISO(value);
    if (base) setView((v) => (v.y === base.y && v.m === base.m ? v : { y: base.y, m: base.m }));
  }, [inline, rangeStart, value]);

  // Close on outside click / Escape, same convention as Dropdown.
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

  // Two months side by side is the point on a laptop and a trap on a phone,
  // where they stack and the second one lands below the fold. A narrow screen
  // gets one month and the head's own title, navigated with the same arrows.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 620px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 620px)');
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    setNarrow(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const paneCount = Math.max(1, inline && !narrow ? panes : 1);
  const panesData = useMemo(() => Array.from({ length: paneCount }, (_, i) => {
    const d = new Date(view.y, view.m + i, 1);
    return { y: d.getFullYear(), m: d.getMonth(), cells: buildGrid(d.getFullYear(), d.getMonth(), paneCount === 1) };
  }), [view.y, view.m, paneCount]);

  const isDisabled = (iso) => (min && iso < min) || (max && iso > max);

  const label = sel
    ? `${String(sel.d).padStart(2, '0')} ${MONTHS[sel.m].slice(0, 3)} ${sel.y}`
    : placeholder;

  const pick = (cell) => {
    const iso = toISO(cell.y, cell.m, cell.d);
    if (isDisabled(iso)) return;
    onChange(iso);
    if (!inline) setOpen(false);
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
      const d = new Date(view.y, view.m + paneCount, 1);
      return [d.getFullYear(), d.getMonth(), d.getDate()];
    })());
    return firstOfNext > max;
  })();

  const body = (
    <div
      className={inline ? `cal cal-inline cal-panes-${paneCount}` : 'cal'}
      role={inline ? undefined : 'dialog'}
      aria-label="Choose date"
    >
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
        <span className="cal-title">
          {MONTHS[view.m]} {view.y}
          {paneCount > 1 && ` ${MONTHS[panesData[paneCount - 1].m]} ${panesData[paneCount - 1].y}`}
        </span>
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

      <div className="cal-panes">
        {panesData.map((pane) => (
          <div className="cal-pane" key={`${pane.y}-${pane.m}`}>
            {paneCount > 1 && <div className="cal-pane-title">{MONTHS[pane.m]} {pane.y}</div>}
            <div className="cal-weekdays">
              {WEEKDAYS.map((w) => (
                <span key={w} className="cal-weekday">{w}</span>
              ))}
            </div>
            <div className="cal-grid">
              {pane.cells.map((cell, i) => {
                const iso = toISO(cell.y, cell.m, cell.d);
                const selected = sel && iso === toISO(sel.y, sel.m, sel.d);
                const disabled = isDisabled(iso);
                // Range shading: the two ends read as caps, the days between
                // as a connected band, so a seven-night trip looks like one.
                const isStart = rangeStart && iso === rangeStart;
                const isEnd = rangeEnd && iso === rangeEnd;
                const inRange = rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd;
                const cls = [
                  'cal-day',
                  cell.outside ? 'outside' : '',
                  selected || isStart || isEnd ? 'selected' : '',
                  isStart ? 'range-start' : '',
                  isEnd ? 'range-end' : '',
                  inRange ? 'in-range' : '',
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
        ))}
      </div>
    </div>
  );

  if (inline) return <div className="date-field date-field-inline">{body}</div>;

  return (
    <div className="date-field" ref={wrapperRef}>
      <button
        type="button"
        className={`date-field-trigger ${open ? 'open' : ''} ${sel ? '' : 'placeholder'}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && body}
    </div>
  );
}
