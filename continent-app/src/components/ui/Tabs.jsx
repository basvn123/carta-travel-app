/*
 * Tabs (T422): sections of one page that swap in place.
 *
 * A row of labels on a hairline; the chosen tab is --text with a 2 px brown
 * underline, the others --text-2. role="tablist" with role="tab"; arrow keys
 * move between tabs, Home and End jump. The caller renders the panel and may
 * pass panelId so each tab points at it (aria-controls). Navigation between
 * pages is links, not tabs.
 */
import React, { useRef } from 'react';

export function Tabs({ label, tabs, value, onChange, panelId, className = '' }) {
  const ref = useRef(null);
  const go = (i) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    onChange?.(t.id);
    requestAnimationFrame(() => ref.current?.querySelector('[aria-selected="true"]')?.focus());
  };
  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(tabs.length - 1); }
  };
  return (
    <div ref={ref} role="tablist" aria-label={label} className={`ui-tabs ${className}`.trim()} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            className={`ui-tab${on ? ' is-selected' : ''}`}
            onClick={() => onChange?.(t.id)}
          >
            {t.label}
            {t.count != null && <span className="ui-tab-count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
