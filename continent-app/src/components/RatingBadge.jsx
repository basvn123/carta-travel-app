import React from 'react';
import { GemIcon } from './GemRating.jsx';

/**
 * Traveller rating (schema v14 dest.rating), the one visual language for
 * "how strong is this destination":
 *
 *   score  0-10 chip, colour-coded by tier (the tier shows only as colour;
 *          no separate diamond glyphs, the number is the rating)
 *   hidden_gem  a separate "Hidden gem" tag, highly rated, hardly famous
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

export function HiddenGemTag({ size = 'sm' }) {
  return (
    <span className={`hidden-gem-tag ${size}`} title="Highly rated, still under the radar">
      <GemIcon filled size={size === 'lg' ? 11 : 9} />
      Hidden gem
    </span>
  );
}

/** Compact inline badge: score chip (+ optional gem tag). */
export function RatingBadge({ rating, size = 'sm', showGem = true, showLabel = false }) {
  if (!rating || rating.score == null) return null;
  return (
    <span className={`rating-badge ${size}`}>
      <ScoreChip rating={rating} size={size} />
      {showLabel && rating.label && (
        <span className={`rating-label ${tierClass(rating)}`}>{rating.label}</span>
      )}
      {showGem && rating.hidden_gem && <HiddenGemTag size={size} />}
    </span>
  );
}
