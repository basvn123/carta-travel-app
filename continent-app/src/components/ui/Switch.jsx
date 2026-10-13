/*
 * Switch (T437): an on/off setting that applies at once (Hidden gems, No car
 * needed). A real <button role="switch"> with aria-checked, its visible label
 * beside it, and the whole row as the hit area, so it is --tap high on a
 * touch screen. On is the action colour with the thumb moved across; the
 * state also reads from the thumb's position, never colour alone.
 *
 *   <Switch label="Hidden gems" checked={gems} onChange={setGems} />
 *
 * A setting that waits for a Save is a checkbox in a form, not this.
 */
import React from 'react';

export function Switch({ label, checked = false, onChange, hint, disabled = false, className = '', id }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={!!checked}
      disabled={disabled}
      className={['ui-switch', checked && 'is-on', className].filter(Boolean).join(' ')}
      onClick={() => onChange?.(!checked)}
    >
      <span className="ui-switch-text">
        <span className="ui-switch-label">{label}</span>
        {hint && <span className="ui-switch-hint">{hint}</span>}
      </span>
      <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
    </button>
  );
}
