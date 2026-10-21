import React from 'react';
import { Button } from '../components/ui/index.js';

/**
 * The one empty-result block (T498, roadmap 1.3b section F): what emptied
 * the list in one sentence, the one button that changes the result
 * ("Remove {filter}", "Clear search"), and "Clear all" beside it once two
 * or more filters are on. Whatever a layer can add under it (the nearest
 * results by name, for the outdoor layers) comes in as children. No
 * illustration, no apology.
 *
 *   line      the sentence, already translated
 *   action    { label, onClick } or null
 *   onClearAll  shown as a quiet button when given
 */
export function EmptyResult({ line, action = null, onClearAll = null, clearLabel = '', children = null, className = '' }) {
  return (
    <div className={`empty-result ${className}`.trim()} role="status">
      <p className="empty-result-line">{line}</p>
      {(action || onClearAll) && (
        <span className="empty-result-actions">
          {action && (
            <Button variant="secondary" onClick={action.onClick}>{action.label}</Button>
          )}
          {onClearAll && (
            <Button variant="quiet" onClick={onClearAll}>{clearLabel}</Button>
          )}
        </span>
      )}
      {children}
    </div>
  );
}
