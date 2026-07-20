import React from 'react';

// Reusable filter form controls (a debounced-commit number input and a
// dual-handle range slider) extracted from FilterBar.

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
export function DualRange({ min, max, value, onChange, fmt, hideValueRow }) {
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

  return (
    <div className="dual-range">
      <div className="dual-range-track">
        <div
          className="dual-range-fill"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input type="range" min={min} max={max} value={lo} onChange={onLo}
          onPointerUp={flush} onKeyUp={flush} className="dual-range-input" />
        <input type="range" min={min} max={max} value={hi} onChange={onHi}
          onPointerUp={flush} onKeyUp={flush} className="dual-range-input" />
      </div>
      {!hideValueRow && (
        <div className="dual-range-vals">
          <span>{fmt(lo)}</span>
          <span>{fmt(hi)}</span>
        </div>
      )}
    </div>
  );
}
