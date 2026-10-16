/*
 * StepRail (T433): the planners' step rail as one kit piece.
 *
 *   StepRail   the desktop rail: every step named, done steps tappable, the
 *              current one marked with the selected tint
 *   StepMini   the phone's one line: "Step x of n", a progress bar, and the
 *              way into the full list
 *   StepList   that list, for a sheet: done steps tappable with "Edit"
 *
 * The markup and class names are the trip wizard's (GuidedTripWizard.jsx,
 * styled in 19-guide-ratings.css and 67-v6-tripplanner.css), so the day
 * planner's rail and the trip planner's rail are the same object. The trip
 * wizard can move onto these with no visual change.
 *
 * steps: [{ key, label }]; at: index of the current step; onGo(i): jump to a
 * done step.
 */
import React from 'react';

function Tick({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const stateOf = (i, at) => (i < at ? 'done' : i === at ? 'now' : 'todo');

export function StepRail({ steps, at, onGo, label }) {
  return (
    <ol className="wiz-steps" aria-label={label}>
      {steps.map((s, i) => {
        const state = stateOf(i, at);
        return (
          <li key={s.key} className={`wiz-step ${state}`}>
            <button
              type="button"
              className="wiz-step-btn"
              disabled={state !== 'done'}
              onClick={() => onGo(i)}
              aria-current={state === 'now' ? 'step' : undefined}
            >
              <span className="wiz-step-mark">{state === 'done' ? <Tick /> : i + 1}</span>
              <span className="wiz-step-name">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function StepMini({ at, n, text, open, onOpen }) {
  return (
    <button
      type="button"
      className="wiz-mini"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <span className="wiz-mini-line">
        <span className="wiz-mini-now">{text}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
      <span className="wiz-mini-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(((at + 1) / Math.max(1, n)) * 100)}%` }} />
      </span>
    </button>
  );
}

export function StepList({ steps, at, onGo, editLabel }) {
  return (
    <ol className="wiz-sheet-list">
      {steps.map((s, i) => {
        const state = stateOf(i, at);
        return (
          <li key={s.key} className={`wiz-sheet-step ${state}`}>
            <button
              type="button"
              disabled={state !== 'done'}
              onClick={() => onGo(i)}
              aria-current={state === 'now' ? 'step' : undefined}
            >
              <span className="wiz-step-mark">{state === 'done' ? <Tick size={11} /> : i + 1}</span>
              <span className="wiz-sheet-name">{s.label}</span>
              {state === 'done' && <span className="wiz-sheet-edit">{editLabel}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
