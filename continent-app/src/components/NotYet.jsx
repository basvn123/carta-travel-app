import React from 'react';
import { useI18n } from '../i18n/index.jsx';

/**
 * The one placeholder for a field a sheet shows before the data has it
 * (T630, owner decision for the explore-completeness batch: every field in
 * the spec keeps its slot, a missing value says so in words instead of
 * leaving the slot out).
 *
 * Short ("Not available yet") in a fact cell, a card badge or a table cell;
 * `line` gives the sentence that says it comes with a later data update, for
 * a section that has nothing else to show. Never a blank or a lone dash.
 */
export function notYet(t, line = false) {
  return t(line ? 'data.notYetLine' : 'data.notYet');
}

/** The value when it is there, else the short placeholder. */
export function orNotYet(t, value) {
  return value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value))
    ? notYet(t)
    : value;
}

export default function NotYet({ line = false, as: Tag = 'span', className = '' }) {
  const { t } = useI18n();
  return (
    <Tag className={`not-yet${line ? ' not-yet-line' : ''}${className ? ` ${className}` : ''}`}
      data-testid="not-yet">
      {notYet(t, line)}
    </Tag>
  );
}
