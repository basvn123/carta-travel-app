import React, { useState } from 'react';

// The cost bar (T172): one stacked bar above the receipt lines. One segment per
// receipt line, in receipt order, proportional to the mid point of its range.
// Tapping a segment shows its figure and note under the bar. The receipt below
// keeps every figure, so the bar is a summary, never the only place.
const RAMP = ['var(--kind-metro)', 'var(--kind-city)', 'var(--kind-town)', 'var(--kind-village)'];

export function CostBar({ t, segments }) {
  const [sel, setSel] = useState(null);
  const total = segments.reduce((s, x) => s + x.weight, 0);
  if (segments.length < 2 || total <= 0) return null;
  const cur = sel != null ? segments[sel] : null;
  return (
    <div className="costbar">
      <div className="costbar-track" role="group" aria-label={t('journey.barLabel')}>
        {segments.map((s, i) => (
          <button
            key={s.slot}
            type="button"
            className="costbar-seg"
            style={{ flexGrow: s.weight }}
            aria-pressed={sel === i}
            aria-label={`${s.label}, ${s.figure}`}
            onClick={() => setSel(sel === i ? null : i)}
          >
            <span className="costbar-fill" style={{ background: RAMP[i % RAMP.length] }} />
          </button>
        ))}
      </div>
      <p className="costbar-read" aria-live="polite">
        {cur ? (
          <>
            <span>{cur.label}</span>{' '}
            <span className="mono">{cur.figure}</span>
            {cur.note && <small>{cur.note}</small>}
          </>
        ) : (
          t('journey.barHint')
        )}
      </p>
    </div>
  );
}
