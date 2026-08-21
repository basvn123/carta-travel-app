import React from 'react';
import { tierCutoffs } from '../lib/rating.js';
import { tierClass } from '../components/RatingBadge.jsx';

/**
 * Why this place scores what it scores.
 *
 * The catalogue's ratings are tightly packed by design: half of the 3,038
 * destinations sit somewhere in the sixes, because half of Europe genuinely is
 * "good, not remarkable". That is honest and it is also unreadable, because a
 * bare 6.4 on a card tells a reader nothing about what 6.4 means or where it
 * came from. Two things fix that without touching the model.
 *
 *   The scale. A 0-10 axis with the three tier cutoffs marked, and this place
 *   standing on it. A score is only information next to the thresholds it is
 *   being measured against, and those thresholds ship in the wire
 *   (meta.rating_model.tier_cutoffs) rather than being invented here.
 *
 *   The parts. rating_v3 is four measurements at published weights, and every
 *   destination carries its four values. Showing them turns the number from a
 *   verdict into an argument: a village that scores 7.4 on a perfect old town
 *   and no famous sights reads completely differently from a city that scores
 *   7.4 the other way round, and a reader deciding between them needs exactly
 *   that difference.
 *
 * Nothing here is computed. Every value and every weight is read from the
 * wire, so the panel cannot drift from the model that produced the score.
 */

const ORDER = ['appeal', 'beauty', 'highlights', 'acclaim'];

export function RatingBreakdown({ rating, meta, t }) {
  if (!rating || rating.score == null) return null;

  const cuts = tierCutoffs(meta);
  const model = meta?.rating_model || {};
  const weights = model.weights || {};
  const comps = rating.components || {};
  const rows = ORDER.filter((k) => comps[k] != null && weights[k] != null);
  const pos = Math.max(0, Math.min(100, (rating.score / 10) * 100));

  return (
    <div className="rate-break">
      {/* Where this score stands, against the thresholds it is judged by. */}
      <div className="rate-scale">
        <div className="rate-scale-track">
          {[1, 2, 3].map((tier) => (
            <span
              key={tier}
              className={`rate-scale-tick rt-${tier}`}
              style={{ left: `${(cuts[tier] / 10) * 100}%` }}
              title={model.tier_labels?.[String(tier)] || ''}
            />
          ))}
          <span
            className={`rate-scale-me ${tierClass(rating)}`}
            style={{ left: `${pos}%` }}
          >
            <span className="rate-scale-me-val mono">{rating.score.toFixed(1)}</span>
          </span>
        </div>
        <div className="rate-scale-legend">
          {[1, 2, 3].map((tier) => (
            <span key={tier} className={`rate-scale-leg rt-${tier}`}>
              <span className="mono">{cuts[tier].toFixed(1)}</span>
              {' '}
              {model.tier_labels?.[String(tier)] || t(`rating.tier${tier}`)}
            </span>
          ))}
        </div>
      </div>

      {/* The four measurements behind it, at the weights the model used. */}
      {rows.length > 0 && (
        <ul className="rate-parts">
          {rows.map((k) => (
            <li key={k} className="rate-part">
              <span className="rate-part-name">
                {t(`rating.part.${k}`)}
                <span className="rate-part-weight mono">{Math.round(weights[k] * 100)}%</span>
              </span>
              <span className="rate-part-track" aria-hidden="true">
                <span className="rate-part-fill" style={{ width: `${Math.max(2, comps[k] * 100)}%` }} />
              </span>
              <span className="rate-part-val mono">{(comps[k] * 10).toFixed(1)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="rate-break-note">
        {t('rating.method')}
        {rating.hidden_gem && ` ${t('rating.gemWhy')}`}
      </p>
    </div>
  );
}
