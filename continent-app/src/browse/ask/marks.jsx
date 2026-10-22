import React from 'react';

/** Ask Carta's own small marks (T570), drawn in the icon set's 1.5 stroke. */

/** A question to ask: the turn-down arrow before a suggestion. */
export function CornerArrow() {
  return (
    <svg className="ac-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 3v5.5A1.5 1.5 0 0 0 5.5 10H12m0 0-2.5-2.5M12 10l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** From one airport to the next, in a route. */
export function RouteArrow() {
  return (
    <svg className="ac-route-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10m0 0-3.5-3.5M13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Send: the arrow up. */
export function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 16V4m0 0-5 5m5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
