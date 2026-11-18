/*
 * Pressable (G12, Style Studio): the kit's bare button, for a control whose
 * whole surface is drawn by its component (a style card, a choice row, a
 * picture tile, a step of a progress bar), where Button's label span and
 * padding would fight the layout.
 *
 * It keeps what every kit control promises: type="button" so it never
 * submits a form, the forwarded ref, and one haptic after the handler on a
 * touch when `haptic` is passed (lib/haptics.js). It draws nothing: the
 * caller's class owns the look, the focus ring and the 44 px target.
 *
 *   <Pressable className="sst-tile" aria-pressed={on} onClick={...}>...</Pressable>
 */
import React from 'react';
import { haptic as buzz } from '../../lib/haptics.js';

export const Pressable = React.forwardRef(function Pressable(
  { type = 'button', haptic = null, onClick, children, ...rest },
  ref
) {
  const press = haptic && onClick ? (e) => { onClick(e); buzz(haptic); } : onClick;
  return <button ref={ref} type={type} onClick={press} {...rest}>{children}</button>;
});
