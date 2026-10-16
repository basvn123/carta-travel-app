import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { CountryFlag } from './CountryFlag.jsx';
import { ChevronDownIcon } from './Icons.jsx';

/**
 * The country filter as a real dropdown, not a bare <select>. A native select
 * hands its open list to the OS/browser to place, which is why it used to
 * land flush against the viewport edge instead of under the pill that opened
 * it. This wears the same button + anchored panel shape as OriginPicker
 * (.origin-pop and kin), so it opens the same way on phone and desktop that
 * every other picker in the toolbar already does.
 *
 * T457: a flag a row and rows at the 44 px touch floor, the way the side
 * panel's country fold draws them, and a drawn chevron for the caret. The
 * button is named by what it shows ("Croatia"), the search by its job, and
 * the listbox holds only the options.
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
      >
        <span className="country-picker-label">{current}</span>
        <ChevronDownIcon size={16} className="origin-btn-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="origin-pop country-picker-pop">
          <input
            ref={inputRef}
            className="origin-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('filter.countrySearch')}
            aria-label={t('filter.countrySearch')}
          />
          <div className="origin-list" role="listbox" aria-label={allLabel}>
            <button
              type="button"
              className={`origin-opt ${!value ? 'on' : ''}`}
              onClick={() => pick('')}
              role="option"
              aria-selected={!value}
            >
              <span className="origin-opt-flag" aria-hidden="true" />
              <span className="origin-opt-city">{allLabel}</span>
            </button>
            {filtered.length === 0 && (
              <p className="origin-empty">{t('country.noMatch', { query })}</p>
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
                <span className="origin-opt-flag" aria-hidden="true"><CountryFlag country={cc} size={12} /></span>
                <span className="origin-opt-city">{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
