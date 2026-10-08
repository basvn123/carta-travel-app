import React from 'react';
import { CloseIcon } from '../components/Icons.jsx';

/**
 * Active filters as one row of removable chips above the grid (PLAN.md C6),
 * plus Clear all. Each chip names what it filters and removes exactly that
 * filter - the reader never has to reopen a control to see or undo what is
 * narrowing the list. ExploreTab builds the chip list (it owns every filter
 * state); this renders and dispatches.
 *
 * Drawn as carta-design's filter chips (T391, row T384-d): --paper-dim, ink,
 * a --rule border, CloseIcon for the remove mark, and each chip named for
 * what it does, "Remove <filter>".
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
          aria-label={t('filter.removeChip', { name: c.label })}
        >
          <span>{c.label}</span>
          <span className="xchip-x" aria-hidden="true"><CloseIcon size={12} /></span>
        </button>
      ))}
      <button type="button" className="xchip xchip-clear" onClick={onClearAll}>
        {t('filter.clearAll')}
      </button>
    </div>
  );
}
