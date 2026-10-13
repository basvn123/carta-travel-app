/*
 * IconButton (T422): a control whose only content is an icon.
 *
 * The box is always --tap (44 px) square, even when the glyph is 16 px, so a
 * finger can hit it (WCAG 2.5.5). The label is required: it becomes the
 * accessible name, because an icon alone names nothing.
 *
 * Tones
 *   plain    no fill, the icon in --text-2 (default; bars and rows)
 *   surface  a round --surface disc with a --border edge (over a map, on a sheet)
 *   photo    a round --surface disc with --elev-1 (over a photograph)
 * Pass `pressed` for a toggle (a saved heart): it sets aria-pressed and the
 * selected tint.
 */
import React from 'react';

const TONES = ['plain', 'surface', 'photo'];

export const IconButton = React.forwardRef(function IconButton(
  { label, tone = 'plain', pressed, type = 'button', className = '', children, ...rest },
  ref
) {
  if (!label && import.meta.env.DEV) {
    console.warn('IconButton needs a label: it is the accessible name.');
  }
  const t = TONES.includes(tone) ? tone : 'plain';
  const cls = ['icon-btn', `icon-btn-${t}`, pressed && 'is-pressed', className].filter(Boolean).join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      {...rest}
    >
      <span className="icon-btn-glyph" aria-hidden="true">{children}</span>
    </button>
  );
});
