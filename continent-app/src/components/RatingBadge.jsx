import React from 'react';
import { useI18n } from '../i18n/index.jsx';

/**
 * The Score (T437, the kit's rating; replaces the filled ochre chip).
 *
 * A drawn star and the figure in ink, tabular, on no fill: the form a
 * traveller already reads from every travel app, and one that can never be
 * mistaken for a button. The star is always filled (owner, 2026-10-14, T447:
 * an outlined star below the second tier read as "not rated"); below the
 * first band it is grey rather than brown (19-guide-ratings.css). Where
 * a page has room (the destination head, a preview), `band` adds the band's
 * word through i18n, never the English label the data carries.
 *
 *   <ScoreChip rating={dest.rating} size="sm" />        cards and rows
 *   <ScoreChip rating={dest.rating} size="lg" band />   a page head
 *
 * The exports and props of the old chip are kept (ScoreChip, RatingBadge,
 * HiddenGemTag, tierClass), so its twenty-odd callers did not change. Beach,
 * lake and mountain scores pass through the same component; only
 * destinations ask for the band word, because only their tiers map onto it.
 */

export function tierClass(rating) {
  return `rt-${rating?.tier ?? 0}`;
}

/** The i18n key for a destination tier's band word, or null below tier 1. */
export function bandKey(tier) {
  return tier >= 1 && tier <= 3 ? `score.band${tier}` : null;
}

function Star({ filled }) {
  return (
    <svg className="score-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3.4l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.8l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3.4z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScoreChip({ rating, size = 'sm', band = false }) {
  const { t } = useI18n();
  if (!rating || rating.score == null) return null;
  const tier = rating.tier ?? 0;
  const key = band ? bandKey(tier) : null;
  const word = key ? t(key) : '';
  const figure = Number(rating.score).toFixed(1);
  const aria = word ? `${t('score.aria', { n: figure })}, ${word}` : t('score.aria', { n: figure });
  return (
    <span className={`score-chip ${tierClass(rating)} ${size}`} role="img" aria-label={aria} title={aria}>
      <Star filled />
      <span className="score-chip-n" aria-hidden="true">{figure}</span>
      {word && <span className="score-chip-band" aria-hidden="true">{word}</span>}
    </span>
  );
}

function Diamond() {
  return (
    <svg className="gem-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3l8 9-8 9-8-9z" fill="currentColor" />
    </svg>
  );
}

export function HiddenGemTag({ size = 'sm' }) {
  const { t } = useI18n();
  return (
    <span className={`hidden-gem-tag ${size}`} title={t('common.hiddenGemTip')}>
      <Diamond />
      {t('common.hiddenGem')}
    </span>
  );
}

/** The Score, optionally with its band word and the hidden-gem mark. */
export function RatingBadge({ rating, size = 'sm', showGem = true, showLabel = false }) {
  if (!rating || rating.score == null) return null;
  return (
    <span className={`rating-badge ${size}`}>
      <ScoreChip rating={rating} size={size} band={showLabel} />
      {showGem && rating.hidden_gem && <HiddenGemTag size={size} />}
    </span>
  );
}
