import React from 'react';

/**
 * Regional crowding (dest.crowding, JRC Tourism Density at NUTS 3, Eurostat
 * overnight stays per km of land). A companion to the hidden_gem signal, but
 * objective and regional rather than fame-based.
 *
 * To keep the detail header uncluttered, the pill shows only the two ACTIONABLE
 * extremes, "Quiet" (good if you want to dodge crowds) and "Crowded" (a
 * heads-up), via `crowdBadgeWorthShowing`. The middle tiers (Moderate/Busy)
 * still appear in the knownForFacts "Crowds" row.
 *
 *   tier 0 Quiet cr-quiet   1 Moderate   2 Busy   3 Crowded cr-crowded
 */

const TIER_KEY = {
  0: 'crowd.quiet', 1: 'crowd.moderate', 2: 'crowd.busy', 3: 'crowd.crowded',
};
const TIER_SLUG = { 0: 'quiet', 1: 'moderate', 2: 'busy', 3: 'crowded' };

/** Only the extremes earn a header pill; middle tiers are unremarkable. */
export function crowdBadgeWorthShowing(dest) {
  const c = dest?.crowding;
  return !!c && (c.tier === 0 || c.tier === 3);
}

function CrowdIcon({ size = 11 }) {
  // three simple figures = a crowd
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="currentColor">
      <circle cx="12" cy="6" r="2.6" />
      <circle cx="5.5" cy="8" r="2.1" />
      <circle cx="18.5" cy="8" r="2.1" />
      <path d="M12 10c-2.8 0-4.5 1.7-4.8 4.4-.1.9.6 1.6 1.5 1.6h6.6c.9 0 1.6-.7 1.5-1.6C16.5 11.7 14.8 10 12 10z" />
      <path d="M5.5 11c-2 0-3.3 1.2-3.5 3.1-.1.8.5 1.4 1.3 1.4h1.9c.2-1.5.9-2.8 2-3.7C6.7 11.3 6.1 11 5.5 11z" />
      <path d="M18.5 11c-.6 0-1.2.3-1.7.8 1.1.9 1.8 2.2 2 3.7h1.9c.8 0 1.4-.6 1.3-1.4C21.8 12.2 20.5 11 18.5 11z" />
    </svg>
  );
}

export function crowdTooltip(c, t) {
  if (!c) return '';
  const label = t(TIER_KEY[c.tier] || 'crowd.moderate');
  return t('crowd.tooltip', {
    label, dens: c.nights_per_km2, region: c.region, year: c.year,
  });
}

export function CrowdingBadge({ crowding, t, size = 'sm', showLabel = true }) {
  if (!crowding) return null;
  const slug = TIER_SLUG[crowding.tier] || 'moderate';
  const label = t(TIER_KEY[crowding.tier] || 'crowd.moderate');
  const tip = crowdTooltip(crowding, t);
  return (
    <span className={`crowd-badge cr-${slug} ${size}`} title={tip} aria-label={tip}>
      <CrowdIcon size={size === 'lg' ? 13 : 11} />
      {showLabel && <span>{t('crowd.badge', { label })}</span>}
    </span>
  );
}
