import React from 'react';
import { GemIcon } from './GemRating.jsx';

/**
 * Traveller rating (schema v14 dest.rating) - the one visual language for
 * "how strong is this destination":
 *
 *   score  0-10 chip, colour-coded by tier
 *   tier   1-3 diamonds, Michelin Green Guide idiom:
 *            3 = Worth the journey, 2 = Worth a detour, 1 = Worth a visit
 *   hidden_gem  a separate "Hidden gem" tag - highly rated, hardly famous
 *
 * Diamonds (not stars) on purpose: stars mean "shortlist" in this app, and
 * the diamond keeps continuity with the old gem look users already know.
 */

export function tierClass(rating) {
  return `rt-${rating?.tier ?? 0}`;
}

export function ScoreChip({ rating, size = 'sm' }) {
  if (!rating || rating.score == null) return null;
  const label = rating.label
    ? `${rating.score}/10 - ${rating.label}`
    : `Rated ${rating.score}/10`;
  return (
    <span className={`score-chip ${tierClass(rating)} ${size}`} title={label} aria-label={label}>
      {rating.score.toFixed(1)}
    </span>
  );
}

export function TierDiamonds({ tier = 0, size = 9 }) {
  if (!tier) return null;
  return (
    <span className={`tier-diamonds rt-${tier}`} aria-hidden="true">
      {Array.from({ length: tier }, (_, i) => <GemIcon key={i} filled size={size} />)}
    </span>
  );
}

export function HiddenGemTag({ size = 'sm' }) {
  return (
    <span className={`hidden-gem-tag ${size}`} title="Highly rated, still under the radar">
      <GemIcon filled size={size === 'lg' ? 11 : 9} />
      Hidden gem
    </span>
  );
}

/** Compact inline badge: score chip + tier diamonds (+ optional gem tag). */
export function RatingBadge({ rating, size = 'sm', showGem = true, showLabel = false }) {
  if (!rating || rating.score == null) return null;
  return (
    <span className={`rating-badge ${size}`}>
      <ScoreChip rating={rating} size={size} />
      <TierDiamonds tier={rating.tier} size={size === 'lg' ? 12 : 9} />
      {showLabel && rating.label && (
        <span className={`rating-label ${tierClass(rating)}`}>{rating.label}</span>
      )}
      {showGem && rating.hidden_gem && <HiddenGemTag size={size} />}
    </span>
  );
}
