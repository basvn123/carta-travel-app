import React from 'react';
import { SHORT, WEEK } from '../lib/tripLength.js';

/**
 * The trip length control (T101, spec I2): two buttons, the short version and
 * the whole week, with one sentence under them that says which days the
 * figures on the page are for and where they come from.
 *
 * It is a pair of toggle buttons, not a slider, because there are two lengths
 * and no third in between. The pressed one is the page's length; the choice
 * is remembered per viewer (lib/tripLength.js) so the browse filter and the
 * page agree. Under 400px the two stack so neither label is cut.
 *
 *   lengths   { week, short } from tripLengths(trip)
 *   value     'short' or 'week'
 *   onChange  (key) => void
 */
export function LengthPicker({ lengths, value, onChange, t }) {
  const short = lengths.short;
  const week = lengths.week;
  const first = short.indexes[0] + 1;
  const last = short.indexes[short.indexes.length - 1] + 1;
  const options = [
    [SHORT, t('journey.lenShort', { n: short.days })],
    [WEEK, t('journey.lenWeek', { n: week.days })],
  ];
  return (
    <div className="tl-pick" role="group" aria-label={t('journey.lenLabel')}>
      <span className="tl-label">{t('journey.lenLabel')}</span>
      <div className="tl-buttons">
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tl-btn${value === key ? ' tl-on' : ''}`}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="tl-note">
        {value === SHORT
          ? t('journey.lenNoteShort', { n: short.days, from: first, to: last, all: week.days })
          : t('journey.lenNoteWeek', { n: week.days, short: short.days })}
      </p>
    </div>
  );
}
