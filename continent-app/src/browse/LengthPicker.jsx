import React from 'react';
import { SHORT } from '../lib/tripLength.js';
import { LengthSegments } from './TripFilters.jsx';

/**
 * The trip length control (T101, spec I2): the short version and the whole
 * week, with one sentence under it that says which days the figures on the
 * page are for and where they come from.
 *
 * Two segments, not a slider, because there are two lengths and no third in
 * between. The pressed one is the page's length; the choice is remembered
 * per viewer (lib/tripLength.js) so the browse filter and the page agree.
 *
 * T387 (v6 trips brief, V3.5): the same two-segment control as the trip list,
 * in the same order (short first), set right under the suitability strip so
 * it sits beside the cost it changes, instead of two full-width buttons above
 * the photograph.
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
  return (
    <div className="tl-pick">
      <LengthSegments
        value={value}
        onChange={onChange}
        shortLabel={t('journey.nDays', { n: short.days })}
        weekLabel={t('journey.nDays', { n: week.days })}
        label={t('journey.lenLabel')}
        className="tl-seg-page"
      />
      <p className="tl-note">
        {value === SHORT
          ? t('journey.lenNoteShort', { n: short.days, from: first, to: last, all: week.days })
          : t('journey.lenNoteWeek', { n: week.days, short: short.days })}
      </p>
    </div>
  );
}
