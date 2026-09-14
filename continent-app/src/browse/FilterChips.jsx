import React from 'react';

/**
 * Active filters as one row of removable chips above the grid (PLAN.md C6),
 * plus Clear all. Each chip names what it filters and removes exactly that
 * filter - the reader never has to reopen a control to see or undo what is
 * narrowing the list. ExploreTab builds the chip list (it owns every filter
 * state); this renders and dispatches.
 */
export function FilterChips({ t, chips, onClearAll }) {
  if (!chips.length) return null;
  return (
    <div className="xchips" role="group" aria-label={t('filter.activeAria')}>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          className="xchip"
          onClick={c.remove}
          title={t('filter.removeChip', { name: c.label })}
        >
          <span>{c.label}</span>
          <span className="xchip-x" aria-hidden="true">×</span>
        </button>
      ))}
      <button type="button" className="xchip xchip-clear" onClick={onClearAll}>
        {t('filter.clearAll')}
      </button>
    </div>
  );
}
