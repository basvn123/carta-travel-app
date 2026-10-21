import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { InfoDot } from './InfoDot.jsx';
import { dayIncludesText } from '../lib/dayIncludes.js';

/**
 * The one glossary dot for the day price (T498, roadmap 1.3b rule 6): what
 * "a person a day" holds, said once per view, on the first place the figure
 * has a name ("Budget a day" in the filters, "Typical day" on a country
 * page). The sentence is built from the same list of parts the destination
 * page prints (lib/dayIncludes.js, owner answer T491-h), so the day the
 * owner adds a transport estimate every dot follows; the second sentence is
 * dest.priceExcludes, word for word.
 */
export function DayPriceDot({ className = '' }) {
  const { t } = useI18n();
  return (
    <InfoDot term="day-price" className={className}>
      <p className="infodot-text">{`${dayIncludesText(t)} ${t('dest.priceExcludes')}`}</p>
    </InfoDot>
  );
}
