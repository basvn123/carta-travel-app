/*
 * Plate and ScorePlate (G1, house style 2026-11, DESIGN.md "Signature
 * components"). Styles in src/styles/05-house.css.
 *
 * The signpost plate: one component, four variants. Minutes on foot and
 * euros are one unit on one object, read the same way everywhere.
 *   variant="place"  an ink plate with a pointed end: a place, a walk, a stop,
 *                    a price band ("€100 to €149", count on the tip)
 *   variant="leg"    outlined: a leg or a getting-there option. With
 *                    `checked` it is a radio (aria-checked) and takes the umber
 *                    edge and the beige wash when chosen
 *   variant="total"  label above the big figure: a total
 *   variant="mark"   the small umber plate, only for "you chose this"
 * Lint list: a plate is never an ordinary card; use it only for these.
 *
 *   <Plate name="Chamonix" sub="France" fig={<Money value={223} />} />
 *   <Plate variant="total" name={t('...total')} fig={<Money value={3335} precision="whole" />} />
 *   <Plate variant="leg" as="button" checked={on} onClick={pick} name="Train" fig="€211" />
 *
 * ScorePlate: the Score as a small dark plate (out of 10), never a star chip.
 */
import React from 'react';

export function Plate({
  variant = 'place', as, lead, name, sub, fig, figSub, checked, settle = false,
  className = '', children, ...rest
}) {
  const Tag = as || (rest.href ? 'a' : rest.onClick ? 'button' : 'div');
  const cls = [
    'hs-plate',
    variant !== 'place' && `is-${variant}`,
    !lead && 'no-lead',
    settle && 'hs-settle-in',
    className,
  ].filter(Boolean).join(' ');
  const a11y = checked == null ? {} : { role: 'radio', 'aria-checked': !!checked };
  const btn = Tag === 'button' ? { type: 'button' } : {};
  if (variant === 'mark') {
    return <Tag className={cls} {...btn} {...a11y} {...rest}>{fig ?? children}</Tag>;
  }
  return (
    <Tag className={cls} {...btn} {...a11y} {...rest}>
      {lead && <span className="hs-plate-lead">{lead}</span>}
      <span className="hs-plate-text">
        {name != null && <span className="hs-plate-name">{name}</span>}
        {sub != null && <span className="hs-plate-sub">{sub}</span>}
        {children}
      </span>
      {fig != null && (
        <span className="hs-plate-fig">{fig}{figSub != null && <small>{figSub}</small>}</span>
      )}
    </Tag>
  );
}

export function ScorePlate({ value, label, size = 'md', className = '' }) {
  if (!Number.isFinite(value)) return null;
  const shown = value.toFixed(1);
  return (
    <span className={`hs-score${size === 'lg' ? ' is-lg' : ''}${className ? ` ${className}` : ''}`}>
      {label && <span className="sr-only">{label} </span>}
      {shown}
    </span>
  );
}
