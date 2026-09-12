import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';

/**
 * The country filter as a real dropdown, not a bare <select>. A native select
 * hands its open list to the OS/browser to place, which is why it used to
 * land flush against the viewport edge instead of under the pill that opened
 * it. This wears the same button + anchored panel shape as OriginPicker
 * (.origin-pop and kin), so it opens the same way on phone and desktop that
 * every other picker in the toolbar already does.
 */
export function CountryPicker({ value, options, onChange, className = '', label }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const allLabel = label || t('places.allCountries');
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? options.filter(([, name]) => name.toLowerCase().includes(q)) : options),
    [options, q],
  );
  const current = value ? options.find(([cc]) => cc === value)?.[1] : allLabel;

  const pick = (cc) => { onChange(cc); setOpen(false); };

  return (
    <div className="country-picker" ref={rootRef}>
      <button
        type="button"
        className={`${className} country-picker-btn ${value ? 'on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={allLabel}
      >
        <span className="country-picker-label">{current}</span>
        <span className="origin-btn-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="origin-pop country-picker-pop" role="listbox">
          <input
            ref={inputRef}
            className="origin-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={allLabel}
            aria-label={allLabel}
          />
          <div className="origin-list">
            <button
              type="button"
              className={`origin-opt ${!value ? 'on' : ''}`}
              onClick={() => pick('')}
              role="option"
              aria-selected={!value}
            >
              <span className="origin-opt-city">{allLabel}</span>
            </button>
            {filtered.length === 0 && (
              <p className="origin-empty">{t('origin.noMatch', { query })}</p>
            )}
            {filtered.map(([cc, name]) => (
              <button
                type="button"
                key={cc}
                className={`origin-opt ${cc === value ? 'on' : ''}`}
                onClick={() => pick(cc)}
                role="option"
                aria-selected={cc === value}
              >
                <span className="origin-opt-city">{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
