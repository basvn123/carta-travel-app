/*
 * Chip (T422): the one chip, in four kinds.
 *
 *   filter  a toggle that narrows a list: a <button> with aria-pressed. On, it
 *           takes the selected tint and a tick, so the state never rests on
 *           colour alone.
 *   choice  one of a set: role="radio" with aria-checked, inside a ChipGroup
 *           (role="radiogroup", arrow keys move the choice).
 *   count   a figure beside a label ("Filters 3"): not interactive.
 *   status  a label on an object: tone neutral, best (sun), gem (plum),
 *           rate (ochre), positive (green with its word) or danger. Not
 *           interactive.
 *
 * Interactive chips are 32 px high on a fine pointer and --tap on touch; the
 * label is sentence case and short.
 */
import React from 'react';
import { haptic } from '../../lib/haptics.js';
import { useRovingRadios, radioGroupKeyDown } from './radioGroup.js';

function Tick() {
  return (
    <svg className="ui-chip-tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const TONES = ['neutral', 'best', 'gem', 'rate', 'positive', 'danger'];

export const Chip = React.forwardRef(function Chip(
  { kind = 'filter', selected = false, tone = 'neutral', icon = null, className = '', children, onClick, ...rest },
  ref
) {
  if (kind === 'count' || kind === 'status') {
    const t = TONES.includes(tone) ? tone : 'neutral';
    const cls = ['ui-chip', `ui-chip-${kind}`, kind === 'status' && `ui-chip-tone-${t}`, className].filter(Boolean).join(' ');
    return (
      <span ref={ref} className={cls} onClick={onClick} {...rest}>
        {icon && <span className="ui-chip-icon" aria-hidden="true">{icon}</span>}
        {children}
      </span>
    );
  }
  const cls = ['ui-chip', `ui-chip-${kind === 'choice' ? 'choice' : 'filter'}`, selected && 'is-selected', className]
    .filter(Boolean).join(' ');
  const a11y = kind === 'choice'
    ? { role: 'radio', 'aria-checked': !!selected, tabIndex: selected ? 0 : -1 }
    : { 'aria-pressed': !!selected };
  return (
    // The Select primitive: the fill and the tick mark come from 04-ui.css;
    // a touch commit gets one haptic tick after the handler set the state.
    <button ref={ref} type="button" className={cls} {...a11y} {...rest}
      onClick={onClick ? (e) => { onClick(e); haptic('tick'); } : undefined}>
      {selected ? <Tick /> : icon && <span className="ui-chip-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-chip-label">{children}</span>
    </button>
  );
});

/* A row of choice chips. Arrow keys, Home and End move the checked chip, as a
   radio group does; with nothing checked the first chip is the tab stop (K9). */
export function ChipGroup({ label, className = '', children, ...rest }) {
  const ref = React.useRef(null);
  useRovingRadios(ref);
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={`ui-chip-group ${className}`.trim()} onKeyDown={radioGroupKeyDown} {...rest}>
      {children}
    </div>
  );
}
