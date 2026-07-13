import React, { useEffect, useMemo, useRef, useState } from 'react';
import { originGroups, originLabel } from '../lib/origins.js';

/**
 * "Where are you flying from?" - the global departure-airport control that
 * reprices the whole app. Shows the current origin as a compact pill; opening it
 * reveals a searchable list of every European Ryanair origin we priced, grouped
 * by country. Selecting one calls `onChangeOrigin(code)`; the fares table is
 * rehydrated upstream (useAppData) so every price follows the new origin.
 *
 * Renders nothing until the multi-origin fares are present (data.meta.origins),
 * so the app degrades gracefully on an older dataset.
 */
export function OriginPicker({ data, origin, onChangeOrigin }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const origins = data?.meta?.origins;
  const hasOrigins = origins && Object.keys(origins).length > 0;

  const groups = useMemo(
    () => (hasOrigins ? originGroups(data, query) : []),
    [data, query, hasOrigins],
  );

  // Close on outside click / Escape; focus the search when it opens.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  if (!hasOrigins) return null;

  const label = origin ? originLabel(data, origin) : 'Pick airport';
  const pick = (code) => { onChangeOrigin(code); setOpen(false); setQuery(''); };

  return (
    <div className="origin-picker" ref={rootRef}>
      <button
        className="origin-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Where are you travelling from? Flights and drives both start here"
      >
        <span className="origin-btn-label">
          <span className="origin-btn-from">From</span>
          <b>{label}</b>
        </span>
        <span className="origin-btn-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="origin-pop" role="listbox">
          <input
            ref={inputRef}
            className="origin-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search city, country or airport code…"
            aria-label="Search departure airports"
          />
          <div className="origin-list">
            {groups.length === 0 && (
              <p className="origin-empty">No airport matches “{query}”.</p>
            )}
            {groups.map((g) => (
              <div className="origin-group" key={g.country}>
                <div className="origin-group-head">{g.country}</div>
                {g.items.map((o) => (
                  <button
                    key={o.code}
                    className={`origin-opt ${o.code === origin ? 'on' : ''}`}
                    onClick={() => pick(o.code)}
                    role="option"
                    aria-selected={o.code === origin}
                  >
                    <span className="origin-opt-city">{o.city}</span>
                    <span className="origin-opt-code">{o.code}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
