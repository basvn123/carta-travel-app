/**
 * WarnLine: the one way the app says "look at this" (K1 step C, owner
 * 2026-11-28). An outline warning icon and the words in ink at 700, no box
 * and no second colour; the words carry the meaning, the icon is decoration.
 *
 *   <WarnLine>€120 over your budget</WarnLine>
 *   <WarnLine as="p" role="alert">That didn't load. Try again.</WarnLine>
 *
 * Inline by default (a span), so it sits inside a sentence, a hint or a flag;
 * `as="p"` for a line of its own. Extra props (role, id, data-*) pass through.
 */
import React from 'react';
import { AlertIcon } from '../Icons.jsx';

export function WarnLine({ as: Tag = 'span', className = '', children, ...rest }) {
  return (
    <Tag className={`hs-warn${className ? ` ${className}` : ''}`} {...rest}>
      <AlertIcon size={16} className="hs-warn-icon" />
      <span className="hs-warn-text">{children}</span>
    </Tag>
  );
}
