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
 *   <ScorePlate value={9.7} label="Score" />   a bare figure
 *   <ScorePlate rating={place.rating} />       "about 8.1", "Not yet", the band word in its name
 */
import React from 'react';
import { haptic } from '../../lib/haptics.js';
import { useRovingRadios, radioGroupKeyDown } from './radioGroup.js';
import { useI18n } from '../../i18n/index.jsx';
import { ratingWords } from '../../lib/rating.js';
import { NotYet } from './StateBlock.jsx';

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

/*
 * PlateGroup (K6, place FR3): leg plates as one radio group. The roving tab
 * stop, arrow keys, Home and End live here; a pick (click, tap or key) gets
 * the touch tick. Give it `label` or `labelledBy`.
 */
export function PlateGroup({ label, labelledBy, className = '', children, onClick, ...rest }) {
  const ref = React.useRef(null);
  useRovingRadios(ref);
  const tick = (e) => {
    onClick?.(e);
    if (e.target.closest?.('[role="radio"]')) haptic('tick');
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} aria-labelledby={labelledBy}
      className={`hs-plate-group ${className}`.trim()} onKeyDown={radioGroupKeyDown} onClick={tick} {...rest}>
      {children}
    </div>
  );
}

export function ScorePlate({ value, rating, label, size = 'md', className = '' }) {
  const { t } = useI18n();
  const lg = size === 'lg' ? ' is-lg' : '';
  const extra = className ? ` ${className}` : '';
  // K1 (explore FR1): a rating object keeps what the old ScoreChip said. An
  // estimated Score reads "about 8.1", an unscored place "Not yet", and the
  // accessible name carries the band word ("Score 9.7, Exceptional").
  if (rating !== undefined) {
    if (rating?.unscored) return <NotYet className={`xscore-none ${className}`.trim()} />;
    const w = ratingWords(rating, t);
    if (!w) return null;
    const aria = w.word ? `${t('score.aria', { n: w.shown })}, ${w.word}` : t('score.aria', { n: w.shown });
    return (
      <span className={`hs-score xscore${lg}${w.estimated ? ' is-est' : ''}${extra}`}
        role="img" aria-label={aria} title={aria} data-band={w.band || ''} data-score={w.figure}>
        <span aria-hidden="true">{w.shown}</span>
      </span>
    );
  }
  if (!Number.isFinite(value)) return null;
  // The app's own Score format (src/lib/rating.js): one decimal, a point, in every language.
  const shown = value.toFixed(1);
  return (
    <span className={`hs-score${lg}${extra}`}>
      {label && <span className="sr-only">{label} </span>}
      {shown}
    </span>
  );
}
