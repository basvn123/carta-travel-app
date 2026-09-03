import React from 'react';
import { CrowdingBadge, crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';

/**
 * Crowding, said with more than one word (PLAN.md D3). What the pipeline
 * MEASURES is annual: tourist nights per km2 by NUTS3 region (Eurostat/JRC),
 * a tier, and a year. A month-by-month crowd bar would need monthly
 * occupancy data the pipeline does not hold, and inventing a curve from the
 * climate would be a guess wearing a chart - so this renders the honest
 * pieces: the measured tier with its density figure and region, plus the
 * note that the accommodation price curve (rendered beside it in the sleep
 * card) is the seasonal signal that IS measured. Absent when no crowding
 * measurement exists (54% of the catalogue, including all of the UK).
 */
export function CrowdCalendar({ destination, t }) {
  const c = destination?.crowding;
  if (!c || !crowdBadgeWorthShowing(destination)) return null;
  return (
    <div className="destp-crowd">
      <div className="destp-crowd-head">
        <CrowdingBadge crowding={c} t={t} size="lg" />
        {c.year && <span className="destp-crowd-year mono">{c.year}</span>}
      </div>
      {c.nights_per_km2 != null && (
        <p className="destp-crowd-line">
          {t('dest.crowdDensity', {
            n: new Intl.NumberFormat('en-GB').format(Math.round(c.nights_per_km2)),
            region: c.region || c.nuts3 || '',
          })}
        </p>
      )}
      <p className="destp-crowd-note">{t('dest.crowdSeasonNote')}</p>
    </div>
  );
}
