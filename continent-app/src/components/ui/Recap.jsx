/*
 * Recap (T459): the planners' "Planning around" row as one kit piece.
 *
 * Every answer given so far, as a chip; a chip with an onClick goes back to
 * the question that answered it. The markup and class names are the trip
 * wizard's (GuidedTripWizard.jsx, styled in 19-guide-ratings.css and
 * 67-v6-tripplanner.css), so the day planner's recap and the trip planner's
 * recap are the same object, and the trip wizard can move onto this with no
 * visual change.
 *
 *   label   the row's lead, "Planning around"
 *   chips   [{ key, Icon?, text, onClick?, title? }]
 *   inBody  the phone's variant: it scrolls with the step instead of sitting
 *           as a band under the head
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

export function Recap({ label, chips = [], inBody = false, className = '' }) {
  if (!chips.length) return null;
  return (
    <div className={`guide-recap ${inBody ? 'wiz-recap-inbody' : ''} ${className}`.trim()}>
      <div className="guide-recap-inner">
        <span className="guide-recap-label"><Tick /> {label}</span>
        {chips.map((c, i) => {
          const Icon = c.Icon;
          const body = <>{Icon && <Icon size={10} />} {c.text}</>;
          return c.onClick ? (
            <button
              type="button"
              key={c.key || i}
              className="guide-recap-chip is-link"
              onClick={c.onClick}
              title={c.title}
            >{body}</button>
          ) : (
            <span key={c.key || i} className="guide-recap-chip">{body}</span>
          );
        })}
      </div>
    </div>
  );
}
