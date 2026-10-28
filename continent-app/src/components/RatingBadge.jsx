import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { bandOf, inkStep, ratingWords } from '../lib/rating.js';
import NotYet from './NotYet.jsx';

/**
 * The Score (T437, the kit's rating; replaces the filled ochre chip), in
 * rating v5's words (T763).
 *
 * A drawn star, the figure in ink with one decimal and the band word next to
 * it ("8.9 Exceptional"), tabular, on no fill. The word comes from
 * lib/rating.js, the only module that turns a score into words, so a card, a
 * page, the map and the planner read the same word for the same score. The
 * star is always filled (owner, 2026-10-14, T447); with no band (under 6.0)
 * it is grey rather than brown (19-guide-ratings.css, `rt-0`).
 *
 *   <ScoreChip rating={dest.rating} size="sm" />                cards and rows
 *   <ScoreChip rating={dest.rating} size="sm" band={false} />   a pin label with no room
 *   <ScoreChip rating={natureRating(row)} />                    a nature row
 *
 * A nature row listed without a score (natureRating gives { unscored })
 * shows the NotYet placeholder in the badge's slot, never a number.
 */

/** The `rt-n` class the star colour reads: the band's ink step, 0 to 3. */
export function tierClass(rating) {
  return `rt-${inkStep(bandOf(rating))}`;
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

export function ScoreChip({ rating, size = 'sm', band = true }) {
  const { t } = useI18n();
  if (rating?.unscored) return <NotYet className={`score-chip-none ${size}`} />;
  const w = ratingWords(rating, t);
  if (!w) return null;
  const word = band ? w.word : '';
  const aria = w.word ? `${t('score.aria', { n: w.shown })}, ${w.word}` : t('score.aria', { n: w.shown });
  return (
    <span className={`score-chip ${tierClass(rating)} ${size}`} role="img" aria-label={aria} title={aria}
      data-band={w.band || ''} data-score={w.figure}>
      <Star filled />
      <span className="score-chip-n" aria-hidden="true">{w.shown}</span>
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

/** The Score with its band word, and the hidden-gem mark. */
export function RatingBadge({ rating, size = 'sm', showGem = true, showLabel = true }) {
  if (!rating || (rating.score == null && !rating.unscored)) return null;
  return (
    <span className={`rating-badge ${size}`}>
      <ScoreChip rating={rating} size={size} band={showLabel} />
      {showGem && rating.hidden_gem && <HiddenGemTag size={size} />}
    </span>
  );
}
