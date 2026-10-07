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
