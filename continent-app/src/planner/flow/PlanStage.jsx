import React from 'react';
import { IconButton } from '../../components/ui/index.js';
import { ArrowLeftIcon, CloseIcon } from '../../components/Icons.jsx';

/**
 * PlanStage (T654, T748): the planner's one layout. The step sits on the
 * Plan place's warm paper: straight on it on a phone, on a white card
 * centred on the page from 769 px. T654 put a map of Europe behind it; it
 * showed no stops on any step, so T748 took it out (owner 2026-10-27).
 *
 *   bar       round buttons, top right (settings, share)
 *   wide      a wider card on desktop, for steps that hold a list of places
 */
export function PlanStage({ bar = null, wide = false, sheetLabel, children }) {
  return (
    <div className={`pf-stage${wide ? ' is-wide' : ''}`}>
      {bar && <div className="pf-bar">{bar}</div>}
      <section className="pf-sheet" aria-label={sheetLabel}>
        {children}
      </section>
    </div>
  );
}

/**
 * The head of a step on the sheet: a round back control on the left, the
 * position in the middle, a close on the right (Polarsteps' question sheet).
 * Either side may be absent; the middle stays centred.
 *
 * `marks` (T858): one mark a question, [{ key, done, now }], drawn over the
 * position: a question the words or a screen already answered shows ticked,
 * so a skipped question reads as done instead of the count jumping. The
 * position text stays the spoken one.
 *
 * `end` puts another round control (the trip's settings gear) where the
 * close would stand, so it lines up with the back control (owner, plan flow
 * walk) instead of floating in a bar above the step.
 */
export function SheetHead({ onBack, backLabel, onClose, closeLabel, position = '', marks = null, end = null }) {
  return (
    <div className="pf-head">
      <span className="pf-head-side">
        {onBack && (
          <IconButton tone="surface" label={backLabel} onClick={onBack} className="pf-round">
            <ArrowLeftIcon size={18} />
          </IconButton>
        )}
      </span>
      <span className="pf-head-pos">
        {marks?.length > 1 && (
          <span className="pf-marks" aria-hidden="true">
            {marks.map((m) => (
              <span key={m.key} className={`pf-mark${m.now ? ' is-now' : m.done ? ' is-done' : ''}`}>
                {m.done && !m.now && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                )}
              </span>
            ))}
          </span>
        )}
        {position}
      </span>
      <span className="pf-head-side is-end">
        {end}
        {!end && onClose && (
          <IconButton tone="surface" label={closeLabel} onClick={onClose} className="pf-round">
            <CloseIcon size={16} />
          </IconButton>
        )}
      </span>
    </div>
  );
}
