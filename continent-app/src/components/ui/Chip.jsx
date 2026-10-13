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
  { kind = 'filter', selected = false, tone = 'neutral', icon = null, className = '', children, ...rest },
  ref
) {
  if (kind === 'count' || kind === 'status') {
    const t = TONES.includes(tone) ? tone : 'neutral';
    const cls = ['ui-chip', `ui-chip-${kind}`, kind === 'status' && `ui-chip-tone-${t}`, className].filter(Boolean).join(' ');
    return (
      <span ref={ref} className={cls} {...rest}>
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
    <button ref={ref} type="button" className={cls} {...a11y} {...rest}>
      {selected ? <Tick /> : icon && <span className="ui-chip-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-chip-label">{children}</span>
    </button>
  );
});

/* A row of choice chips. Arrow keys move the checked chip, as a radio group does. */
export function ChipGroup({ label, className = '', children, ...rest }) {
  const onKeyDown = (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const items = [...e.currentTarget.querySelectorAll('[role="radio"]:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = items[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    next.focus();
    next.click();
  };
  return (
    <div role="radiogroup" aria-label={label} className={`ui-chip-group ${className}`.trim()} onKeyDown={onKeyDown} {...rest}>
      {children}
    </div>
  );
}
