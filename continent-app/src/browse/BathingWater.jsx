import React from 'react';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';

/**
 * Bathing water (PLAN.md D3), on coastal and lake destinations only: the
 * EEA WISE classification, how much of the surrounding water rates
 * excellent, and the nearest measured site with its distance. Renders from
 * the dossier's `water` section; absent everywhere the register has no
 * sites in reach (70% of the catalogue), never an empty block.
 */
export function BathingWater({ water, destination, t }) {
  if (!water?.rating || !swimRelevant(destination)) return null;
  const near = water.nearest;
  return (
    <div className="destp-water">
      <div className="destp-water-head">
        <WaterQualityBadge bathing={destination.bathing_water} t={t} size="lg" />
        {water.year && <span className="destp-crowd-year mono">{water.year}</span>}
      </div>
      {water.excellent_pct != null && water.n_sites != null && (
        <p className="destp-water-line">
          {t('dest.waterShare', { pct: water.excellent_pct, n: water.n_sites })}
        </p>
      )}
      {near?.name && (
        <p className="destp-water-line">
          {t('dest.waterNearest', {
            name: near.name,
            km: near.dist_km != null ? near.dist_km : '?',
          })}
          {near.type ? ` (${near.type})` : ''}
        </p>
      )}
    </div>
  );
}
