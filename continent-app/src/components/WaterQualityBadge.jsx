import React from 'react';

/**
 * Bathing-water quality (dest.bathing_water, EEA WISE, Bathing Water Directive).
 * A colour-coded pill: the official class of the nearby coastal/lake/river
 * bathing sites, with the count and Excellent share in the tooltip.
 *
 *   Excellent  bw-excellent   Good  bw-good
 *   Sufficient bw-sufficient  Poor  bw-poor
 *
 * Only rendered when a destination actually sits near an official EEA bathing
 * site (inland cities have no block, so nothing shows).
 */

// Categories where swimming is an actual reason to visit. The EEA layer also
// matches inland cities near a river/lake bathing site (e.g. the Seine's new
// Paris sites), but a water-quality pill there is noise, not signal, so the
// badge only shows for coast/beach/island/lake destinations.
const SWIM_CATS = new Set([
  'beach', 'coast', 'island', 'islands', 'lake', 'lakes',
  'surf', 'diving', 'sailing', 'fjord', 'fjords',
]);
export function swimRelevant(dest) {
  return !!dest?.bathing_water && (dest.categories || []).some((c) => SWIM_CATS.has(c));
}

const CLASS_KEY = {
  Excellent: 'water.excellent',
  Good: 'water.good',
  Sufficient: 'water.sufficient',
  Poor: 'water.poor',
};
const CLASS_SLUG = {
  Excellent: 'excellent', Good: 'good', Sufficient: 'sufficient', Poor: 'poor',
};

function WaveIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7c2.2 0 2.2 2 4.4 2s2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2" />
      <path d="M2 12c2.2 0 2.2 2 4.4 2s2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2" />
      <path d="M2 17c2.2 0 2.2 2 4.4 2s2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2" />
    </svg>
  );
}

/** Human tooltip: "Excellent water. 89% of 19 nearby bathing sites rated
 *  Excellent (EEA 2025). Nearest: La Barceloneta, 1.0 km." */
export function waterTooltip(bw, t) {
  if (!bw) return '';
  const cls = t(CLASS_KEY[bw.rating] || 'water.excellent');
  const parts = [t('water.tooltip', {
    cls, pct: bw.excellent_pct, n: bw.n_sites, year: bw.year,
  })];
  if (bw.nearest) {
    parts.push(t('water.nearest', {
      name: titleCase(bw.nearest.name), km: bw.nearest.dist_km.toFixed(1),
    }));
  }
  if (bw.trend === 'improving') parts.push(t('water.trendImproving'));
  else if (bw.trend === 'declining') parts.push(t('water.trendDeclining'));
  return parts.join(' ');
}

/** EEA names are ALL CAPS ("PLAYA DE LA BARCELONETA PM1"); tidy for display. */
export function titleCase(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
}

export function WaterQualityBadge({ bathing, t, size = 'sm', showLabel = true }) {
  if (!bathing || !bathing.rating) return null;
  const slug = CLASS_SLUG[bathing.rating] || 'excellent';
  const cls = t(CLASS_KEY[bathing.rating] || 'water.excellent');
  const tip = waterTooltip(bathing, t);
  return (
    <span className={`water-badge bw-${slug} ${size}`} title={tip} aria-label={tip}>
      <WaveIcon size={size === 'lg' ? 13 : 11} />
      {showLabel && <span>{t('water.badge', { cls })}</span>}
    </span>
  );
}
