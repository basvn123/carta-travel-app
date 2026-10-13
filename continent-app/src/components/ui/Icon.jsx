/*
 * Icon (T422): the three icon sizes, so call sites stop picking from fifteen.
 *
 *   sm 16 px  inside chips, inline with 13 to 14 px text
 *   md 20 px  buttons, rows, the tab bar (default)
 *   lg 24 px  empty states, the hero of a sheet
 *
 * Wraps a component from Icons.jsx (1.5 stroke, currentColor). Decorative by
 * default (hidden from assistive tech, since the control around it carries the
 * name); pass label when the icon alone carries meaning.
 *
 *   <Icon as={MapPinIcon} size="sm" />
 */
import React from 'react';

const PX = { sm: 16, md: 20, lg: 24 };

export function Icon({ as: Glyph, size = 'md', label, className = '' }) {
  const px = PX[size] || PX.md;
  return (
    <span className={`icon icon-${size} ${className}`.trim()} aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined} aria-label={label}>
      {React.createElement(Glyph, { size: px })}
    </span>
  );
}
