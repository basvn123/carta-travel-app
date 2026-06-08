import React, { useState, useRef, useEffect } from 'react';

/**
 * Custom searchable dropdown. Supports single-select (default) or multi-select.
 *
 * Props:
 *   value           — single mode: selected value (string). multi mode: array of values.
 *   onChange(value) — single mode: receives the picked value. multi mode: receives the new array.
 *   options         — Array<{ value, label, sublabel? }>
 *   placeholder     — text shown on the trigger when nothing selected
 *   searchPlaceholder — text in the search input (only shown when options ≥ searchThreshold)
 *   searchThreshold — minimum # options to show search box (default 8)
 *   multiple        — when true, value is an array and the menu stays open while picking
 *   multiLabel(arr) — multi mode: format the trigger label from the selected array
 *
 * Renders a button matching native <select> styling (filter-bar friendly), with a
 * popover list that can be search-filtered. Click outside to close. Escape closes.
 */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  searchThreshold = 8,
  multiple = false,
  multiLabel,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const showSearch = options.length >= searchThreshold;
  const selectedValues = multiple ? (value || []) : [];
  const isSelected = (v) => (multiple ? selectedValues.includes(v) : v === value);
  const selected = multiple ? null : options.find((o) => o.value === value);

  // Multi mode: trigger label is the caller-formatted summary (or a sensible
  // default), and picking an item toggles it without closing the menu.
  const triggerLabel = multiple
    ? (selectedValues.length === 0
        ? null
        : (multiLabel
            ? multiLabel(selectedValues)
            : `${selectedValues.length} selected`))
    : (selected ? selected.label : null);

  const handlePick = (v) => {
    if (multiple) {
      onChange(selectedValues.includes(v)
        ? selectedValues.filter((x) => x !== v)
        : [...selectedValues, v]);
      // keep the menu open so several can be toggled in one go
    } else {
      onChange(v);
      setOpen(false);
      setQuery('');
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus search when opening
  useEffect(() => {
    if (open && showSearch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, showSearch]);

  const filteredOptions = query
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel || '').toLowerCase().includes(query.toLowerCase())
      )
    : options;

  return (
    <div className="dropdown" ref={wrapperRef}>
      <button
        className={`dropdown-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="dropdown-label">
          {triggerLabel != null
            ? triggerLabel
            : <span className="dropdown-placeholder">{placeholder}</span>}
        </span>
        <span className="dropdown-chev">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="dropdown-menu">
          {showSearch && (
            <div className="dropdown-search">
              <input
                ref={inputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          <div className="dropdown-list">
            {filteredOptions.length === 0 ? (
              <div className="dropdown-empty">No matches</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`dropdown-item ${isSelected(opt.value) ? 'selected' : ''} ${multiple ? 'is-multi' : ''}`}
                  onClick={() => handlePick(opt.value)}
                >
                  {multiple && (
                    <span className="dropdown-check" aria-hidden="true">
                      {isSelected(opt.value) ? '✓' : ''}
                    </span>
                  )}
                  <span className="dropdown-item-label">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="dropdown-item-sublabel">{opt.sublabel}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
