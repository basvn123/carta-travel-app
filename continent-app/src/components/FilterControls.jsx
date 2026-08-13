import React from 'react';

// Reusable filter form controls (a debounced-commit number input, a stepper
// and a dual-handle range slider) extracted from FilterBar.

// A plus/minus stepper for the small counts (people, nights). It replaces a
// text field on touch, where typing a number means summoning the keyboard over
// the sheet you are reading; both buttons are 44px so they clear the touch
// target floor with the visible glyph still drawn at 16px.
export function Stepper({
  value, min, max, onChange, ariaLabel, decLabel, incLabel, title,
}) {
  const n = Number.isFinite(value) ? value : min;
  const set = (next) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div className="fstepper" role="group" aria-label={ariaLabel} title={title}>
      <button
        type="button"
        className="fstepper-btn"
        onClick={() => set(n - 1)}
        disabled={n <= min}
        aria-label={decLabel}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <span className="fstepper-value">{n}</span>
      <button
        type="button"
        className="fstepper-btn"
        onClick={() => set(n + 1)}
        disabled={n >= max}
        aria-label={incLabel}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// A number input that can be emptied while typing a replacement. Clamping on
// every keystroke made "clear the field, type 3" produce 13 (the cleared
// field snapped back to 1); instead the draft is committed only when it
// parses, and blur restores the last committed value if left empty.
export function NumberField({ value, min, max, onCommit, ariaLabel, title }) {
  const [draft, setDraft] = React.useState(null); // null = mirror `value`
  // Commit once, on blur/Enter, not on every keystroke: each commit reprices
  // the whole filtered set, so live-committing while typing "12" fired a reprice
  // for "1" then "12". The draft stays live so editing still feels immediate.
  const commit = () => {
    if (draft == null) return;
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n)) onCommit(Math.min(max, Math.max(min, n)));
    setDraft(null);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft ?? String(value ?? '')}
      aria-label={ariaLabel}
      title={title}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } }}
      onBlur={commit}
    />
  );
}

// Dual-handle range slider. The handle position is local state so dragging is
// instant, but the value is only pushed to the parent (which reprices the whole
// filtered set) debounced during the drag and immediately on release, instead
// of once per pixel of movement.
export function DualRange({ min, max, value, onChange, fmt, hideValueRow, marks, axis, ariaLabel, hist }) {
  const [local, setLocal] = React.useState(value);
  const localRef = React.useRef(value);
  const draggingRef = React.useRef(false);
  const timerRef = React.useRef(null);

  // Adopt external changes (price-mode flip, reset) unless mid-drag. The
  // functional updater returns the same array when unchanged so React bails out
  // and we never loop even if the parent hands us a fresh array identity.
  React.useEffect(() => {
    if (draggingRef.current) return;
    localRef.current = value;
    setLocal((prev) => (prev[0] === value[0] && prev[1] === value[1] ? prev : value));
  }, [value]);
  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const push = (next) => {
    setLocal(next);
    localRef.current = next;
    draggingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(next), 150);
  };
  const flush = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    onChange(localRef.current);
  };

  const [lo, hi] = local;
  const span = max - min;
  const loPct = span > 0 ? ((lo - min) / span) * 100 : 0;
  const hiPct = span > 0 ? ((hi - min) / span) * 100 : 100;

  const onLo = (e) => push([Math.min(+e.target.value, hi - 1), hi]);
  const onHi = (e) => push([lo, Math.max(+e.target.value, lo + 1)]);

  // Distribution behind the rail: one column per bin, scaled against the
  // tallest bin, with the bins inside the chosen window drawn in the accent.
  // Square-rooting the heights keeps the long tail of expensive destinations
  // visible next to the spike of cheap ones instead of flattening it to a
  // pixel. Purely decorative, so the whole strip is aria-hidden.
  const histBars = React.useMemo(() => {
    if (!hist || hist.length === 0) return null;
    const peak = Math.max(...hist);
    if (!(peak > 0)) return null;
    const step = span / hist.length;
    return hist.map((n, i) => ({
      key: i,
      h: Math.max(n > 0 ? 0.14 : 0, Math.sqrt(n / peak)),
      inRange: min + (i + 1) * step > lo && min + i * step < hi,
    }));
  }, [hist, span, min, lo, hi]);

  return (
    <div className="dual-range">
      {histBars && (
        <div className="dual-range-hist" aria-hidden="true">
          {histBars.map((b) => (
            <span
              key={b.key}
              className={`dual-range-bar ${b.inRange ? 'in' : ''}`}
              style={{ height: `${(b.h * 100).toFixed(1)}%` }}
            />
          ))}
        </div>
      )}
      <div className="dual-range-track">
        <div
          className="dual-range-fill"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        {/* Static guide ticks (e.g. rating tier cutoffs) drawn on the rail so
            the band's meaning is legible without cluttering it with text. */}
        {marks && marks.map((m) => (
          <span
            key={m.value}
            className="dual-range-mark"
            style={{ left: `${span > 0 ? ((m.value - min) / span) * 100 : 0}%` }}
          />
        ))}
        <input type="range" min={min} max={max} value={lo} onChange={onLo}
          onPointerUp={flush} onKeyUp={flush} className="dual-range-input"
          aria-label={ariaLabel ? `${ariaLabel} minimum` : undefined} />
        <input type="range" min={min} max={max} value={hi} onChange={onHi}
          onPointerUp={flush} onKeyUp={flush} className="dual-range-input"
          aria-label={ariaLabel ? `${ariaLabel} maximum` : undefined} />
      </div>
      {axis && (
        <div className="dual-range-axis" aria-hidden="true">
          {axis.map((a) => (
            <span
              key={a.value}
              className="dual-range-axis-tick"
              style={{ left: `${span > 0 ? ((a.value - min) / span) * 100 : 0}%` }}
            >
              {a.label}
            </span>
          ))}
        </div>
      )}
      {!hideValueRow && (
        <div className="dual-range-vals">
          <span>{fmt(lo)}</span>
          <span>{fmt(hi)}</span>
        </div>
      )}
    </div>
  );
}
