/*
 * LoadingBlock and ErrorBlock, the two states every surface shares (T189).
 *
 * LoadingBlock is a skeleton at the final dimensions of what is coming: a few
 * hairline-ruled rows on paper-dim, never a spinner and never a bare "Loading".
 * The words ride along for screen readers only, and aria-busy tells them the
 * region is not final. ErrorBlock says what failed and what to do in one
 * sentence the caller supplies (an i18n key, no apology, no "Error:" prefix),
 * with a retry button when a retry can change the outcome. It never prints a
 * raw error.message: that text is for the console, not the traveller.
 *
 * Styling is src/styles/27-states.css.
 */
import React from 'react';
import { Button } from './Button.jsx';

/**
 * @param {string} label  words for assistive tech, already translated
 * @param {number} rows   how many rows the real content will have
 * @param {'row'|'card'|'line'} shape  row = 56px list row, card = 120px block, line = one text line
 */
export function LoadingBlock({ label, rows = 3, shape = 'row', className = '' }) {
  return (
    <div className={`state-skel state-skel-${shape}${className ? ` ${className}` : ''}`}
      role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <span className="state-skel-item" aria-hidden="true" key={i} />
      ))}
    </div>
  );
}

/**
 * @param {string} message   what failed and what to do, already translated
 * @param {() => void} onRetry  omit when a retry cannot help
 * @param {string} retryLabel  already translated
 */
export function ErrorBlock({ message, onRetry, retryLabel, className = '' }) {
  return (
    <div className={`state-err${className ? ` ${className}` : ''}`} role="alert">
      <p className="state-err-msg">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>{retryLabel}</Button>
      )}
    </div>
  );
}
