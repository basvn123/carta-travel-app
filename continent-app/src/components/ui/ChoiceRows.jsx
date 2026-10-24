import React from 'react';
import * as Icons from '../Icons.jsx';

/**
 * ChoiceRows (T654): answer rows for a one-question screen, after the
 * Polarsteps "what kind of trip" sheet: full-width bordered rows, a round mark on the left
 * (a square one when several may be picked), the icon, the label and an
 * optional second line. Selected is the one selected state: the light tint,
 * the selected ink and the brown edge, with the mark filled, so it never
 * rests on colour alone.
 *
 *   options   [{ value, icon (Icons.jsx name) | null, label, sub? }]
 *   value     the selected values (an array, one item for a single pick)
 *   multi     several may be on (checkbox semantics) or one (radio)
 *   onPick(v) the tapped value; the caller decides the next selection
 */
export function ChoiceRows({ label, options, value = [], multi = false, onPick, className = '' }) {
  const role = multi ? 'checkbox' : 'radio';
  const onKeyDown = (e) => {
    if (multi) return;
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'];
    if (!keys.includes(e.key)) return;
    const items = [...e.currentTarget.querySelectorAll('[role="radio"]')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const next = items[(i + step + items.length) % items.length];
    next.focus();
    next.click();
  };
  const firstOn = options.findIndex((o) => value.includes(o.value));
  return (
    <div
      role={multi ? 'group' : 'radiogroup'}
      aria-label={label}
      className={`ui-crows ${className}`.trim()}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => {
        const on = value.includes(o.value);
        const Glyph = o.icon ? Icons[o.icon] : null;
        // A radio group is one tab stop: the selected row, else the first.
        const tabIndex = multi ? 0 : (on || (firstOn < 0 && i === 0) ? 0 : -1);
        return (
          <button
            key={o.value}
            type="button"
            role={role}
            aria-checked={on}
            tabIndex={tabIndex}
            className={`ui-crow${on ? ' is-on' : ''}${o.sub ? ' has-sub' : ''}`}
            onClick={() => onPick(o.value)}
          >
            <span className={`ui-crow-mark ${multi ? 'is-box' : 'is-dot'}`} aria-hidden="true" />
            {Glyph && <span className="ui-crow-icon" aria-hidden="true"><Glyph size={20} /></span>}
            <span className="ui-crow-text">
              <span className="ui-crow-label">{o.label}</span>
              {o.sub && <span className="ui-crow-sub">{o.sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
