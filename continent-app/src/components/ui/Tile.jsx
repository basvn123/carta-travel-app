/*
 * Tile (T437): a choice shown as an icon over its word, for a short set the
 * eye should find by shape (trip types, the Destinations sections). Tiles sit
 * in an even grid, two or three across, and every tile is the same size.
 *
 *   toggle  many can be on (a filter): <button aria-pressed>
 *   choice  one of the set: role="radio" inside a TileGroup (arrow keys move)
 *
 * Selected takes the one selected state, the light tint with the selected
 * ink, plus a tick in the corner, so it never rests on colour alone.
 *
 *   <TileGroup label="Trip type" columns={2}>
 *     <Tile kind="toggle" icon={<BeachIcon />} selected={on} onClick={...}>Beach</Tile>
 *   </TileGroup>
 */
import React from 'react';

function Tick() {
  return (
    <svg className="ui-tile-tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export const Tile = React.forwardRef(function Tile(
  { kind = 'toggle', selected = false, icon = null, className = '', children, ...rest },
  ref
) {
  const a11y = kind === 'choice'
    ? { role: 'radio', 'aria-checked': !!selected, tabIndex: selected ? 0 : -1 }
    : { 'aria-pressed': !!selected };
  const cls = ['ui-tile', selected && 'is-selected', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type="button" className={cls} {...a11y} {...rest}>
      {icon && <span className="ui-tile-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-tile-label">{children}</span>
      {selected && <Tick />}
    </button>
  );
});

/*
 * The grid the tiles sit in. With choice tiles it is a radiogroup and the
 * arrow keys move the choice, as a radio group does; with toggles it is a
 * labelled group and Tab walks the tiles.
 */
export function TileGroup({ label, kind = 'toggle', columns = 2, className = '', children, ...rest }) {
  const onKeyDown = (e) => {
    if (kind !== 'choice') return;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const items = [...e.currentTarget.querySelectorAll('[role="radio"]:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = items[(i + step + items.length) % items.length];
    next.focus();
    next.click();
  };
  return (
    <div
      role={kind === 'choice' ? 'radiogroup' : 'group'}
      aria-label={label}
      className={`ui-tile-group ${className}`.trim()}
      style={{ '--tile-cols': columns }}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}
