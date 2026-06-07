import React from 'react';

/**
 * Beauty-index rating, shown as 1-5 gems (diamonds). Deliberately NOT a star -
 * stars already mean "shortlist / favorite" in this app, so a gem keeps the two
 * meanings distinct (and echoes the app's "gem" destination tier).
 *
 * `value` is the 1-5 gem count from dest.beauty.gems; `score` (0-10) is shown as
 * an optional numeric label.
 */

export function GemIcon({ filled = true, size = 11 }) {
  return (
    <svg className={`gem ${filled ? 'on' : ''}`} width={size} height={size} viewBox="0 0 24 24"
      aria-hidden="true" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      {/* faceted diamond */}
      <path d="M12 3 L19 9 L12 21 L5 9 Z" />
      <path d="M5 9 H19 M9.5 9 L12 21 M14.5 9 L12 21 M9.5 9 L12 3 M14.5 9 L12 3" strokeWidth="0.9" />
    </svg>
  );
}

const Gem = GemIcon;

export function GemRating({ value = 0, score = null, showScore = false, size = 'sm', title }) {
  const gems = Math.max(0, Math.min(5, Math.round(value || 0)));
  const label = title || (score != null ? `Beauty index ${score}/10` : `Beauty ${gems}/5`);
  return (
    <span className={`gem-rating ${size}`} title={label} aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => <Gem key={i} filled={i <= gems} />)}
      {showScore && score != null && <span className="gem-score">{score.toFixed(1)}</span>}
    </span>
  );
}
