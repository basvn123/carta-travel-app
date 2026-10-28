import React from 'react';
import {
  PART_WEIGHTS, classRankLine, confidenceKind, loadRatingWhy, ratingPart,
} from '../lib/rating.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * Why this place scores what it scores (rating v5, T763; closes T759-c).
 *
 * The head is the Score with its band word ("8.9 Exceptional"), whether the
 * appeal behind it was measured (a hand or rubric score) or estimated (the
 * model's guess, which also reads "about 8.1"), the class rank when the place
 * is in the top tenth of its class ("Top 2% of villages in Europe") and the
 * one reason sentence in the reader's language.
 *
 * Then the four parts, appeal, beauty, depth and recognition, each with its
 * value and a fill bar. The weights come from config/rating.json through
 * lib/rating.js (PART_WEIGHTS), never from a string. The v4 scale of three
 * tier bands is gone: the band word in the head says where the score stands.
 *
 * The wire names two parts twice over the schema change: v19 ships
 * `highlights` and `acclaim`, the slimmer wire `depth` and `recognition`;
 * ratingPart() reads either.
 */

const ORDER = ['appeal', 'beauty', 'depth', 'recognition'];

/** The reason sentence for `id` in `lang`: the lazy language file through
 *  lib/rating.js, English until (or unless) it has one. */
function useRatingWhy(id, rating, lang) {
  const [why, setWhy] = React.useState(rating?.why || '');
  React.useEffect(() => {
    setWhy(rating?.why || '');
    if (!id) return undefined;
    let live = true;
    // T789: English is a lazy file like the others; the language's own
    // reason wins, English stands in where it has none.
    Promise.all([loadRatingWhy('en'), lang && lang !== 'en' ? loadRatingWhy(lang) : null])
      .then(([en, local]) => { if (live) setWhy(local?.[id] || en?.[id] || rating?.why || ''); });
    return () => { live = false; };
  }, [id, lang, rating?.why]);
  return why;
}

export function RatingBreakdown({ rating, t, countryLine, destId }) {
  const { lang } = useI18n();
  const why = useRatingWhy(destId, rating, lang);
  if (!rating || rating.score == null) return null;

  const rows = ORDER
    .map((k) => ({ k, v: ratingPart(rating, k), w: PART_WEIGHTS[k] }))
    .filter((r) => r.v != null && r.w != null);
  const conf = confidenceKind(rating);
  const rank = classRankLine(rating, t);

  return (
    <div className="rate-break rate-break-v2" data-testid="rating-breakdown">
      <div className="rb-head">
        <ScoreChip rating={rating} size="lg" />
        <span className="rb-head-text">
          {conf && <span className="rb-conf">{t(conf === 'estimated' ? 'rating.estimated' : 'rating.measured')}</span>}
          {rank && <span className="rb-country">{rank}</span>}
          {countryLine && <span className="rb-country">{countryLine}</span>}
        </span>
      </div>

      {why && <p className="rate-break-note rb-why">{why}</p>}

      {/* The four measurements behind it, at the weights the model uses. */}
      {rows.length > 0 && (
        <ul className="rb-parts">
          {rows.map(({ k, v, w }) => (
            <li key={k} className="rb-part">
              <span className="rb-part-top">
                <span className="rb-part-name">{t(`rating.part.${k}`)}</span>
                <span className="rb-part-val mono">{(v * 10).toFixed(1)}</span>
              </span>
              <span className="rb-part-track">
                <span className="rb-part-fill" style={{ width: `${Math.max(2, v * 100)}%` }} />
              </span>
              <span className="rb-part-weight">{t('rating.weight', { pct: Math.round(w * 100) })}</span>
            </li>
          ))}
        </ul>
      )}

      {rating.hidden_gem && <p className="rate-break-note">{t('rating.gemWhy')}</p>}
    </div>
  );
}
