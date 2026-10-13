/*
 * Segmented (T422): two to four exclusive views of one thing (Overview and
 * Day by day, List and Map, I know my dates and I'm flexible).
 *
 * A sunken track with a raised white thumb under the chosen segment: the
 * selected segment is lifted, never painted dark. role="radiogroup" with
 * role="radio" segments; arrow keys move the choice; only the chosen segment
 * is in the tab order. More than four options is a Chip group, not this.
 *
 *   <Segmented label="View" value={v} onChange={setV}
 *     options={[{ value: 'list', label: 'List', icon: <ListIcon /> }, ...]} />
 */
import React, { useRef } from 'react';

export function Segmented({ label, options, value, onChange, size = 'md', block = false, className = '' }) {
  const ref = useRef(null);
  const move = (dir) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange?.(next.value);
    requestAnimationFrame(() => ref.current?.querySelector('[aria-checked="true"]')?.focus());
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  };
  const cls = ['seg', size === 'sm' && 'seg-sm', block && 'seg-block', className].filter(Boolean).join(' ');
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={cls} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            className={`seg-item${on ? ' is-selected' : ''}`}
            onClick={() => onChange?.(o.value)}
          >
            {o.icon && <span className="seg-icon" aria-hidden="true">{o.icon}</span>}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
