import React from 'react';
import { CrowdingBadge, crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';

/**
 * Crowding, in the one form a reader can act on (PLAN.md D3). What the
 * pipeline MEASURES is annual: tourist nights per km2 by NUTS3 region
 * (Eurostat/JRC), a tier, and a year. A month-by-month crowd bar would need
 * monthly occupancy data the pipeline does not hold, and inventing a curve
 * from the climate would be a guess wearing a chart.
 *
 * So this is the tier and the year, and nothing else. The raw density figure
 * and the note pointing at the sleep price curve were dropped: "10,390
 * tourist nights per km2" is a regional statistic nobody can scale against
 * any other place they have been, and it was doing the badge's job worse
 * than the badge. The seasonal signal still exists, one card down, where
 * somebody reading about beds will meet it in context.
 *
 * Absent when no crowding measurement exists (54% of the catalogue,
 * including all of the UK).
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
    </div>
  );
}
