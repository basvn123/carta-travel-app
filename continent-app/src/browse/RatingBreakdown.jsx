import React from 'react';
import { tierCutoffs } from '../lib/rating.js';
import { tierClass } from '../components/RatingBadge.jsx';

/**
 * Why this place scores what it scores.
 *
 * The catalogue's ratings are tightly packed by design: half of the
 * destinations sit somewhere in the sixes, because half of Europe genuinely
 * is "good, not remarkable". A bare 6.4 tells a reader nothing about what
 * 6.4 means or where it came from, so the panel shows two things:
 *
 *   The scale. One bar in four bands, the three tier thresholds drawn as the
 *   band edges (from meta.rating_model.tier_cutoffs, never invented here),
 *   and this place standing on it with its number.
 *
 *   The parts. rating_v3 is four measurements at published weights; every
 *   destination carries its four values. Four tiles, one per part, each with
 *   the score, its weight and a fill bar, so a village that scores 7.4 on a
 *   perfect old town and no famous sights reads differently from a city that
 *   scores 7.4 the other way round.
 *
 * Nothing here is computed. Every value and weight is read from the wire.
 */

const ORDER = ['appeal', 'beauty', 'highlights', 'acclaim'];

export function RatingBreakdown({ rating, meta, t, countryLine }) {
  if (!rating || rating.score == null) return null;

  const cuts = tierCutoffs(meta);
  const model = meta?.rating_model || {};
  const weights = model.weights || {};
  const comps = rating.components || {};
  const rows = ORDER.filter((k) => comps[k] != null && weights[k] != null);
  const pos = Math.max(0, Math.min(100, (rating.score / 10) * 100));
  const tierName = (tier) => model.tier_labels?.[String(tier)] || t(`rating.tier${tier}`);
  const bands = [
    { from: 0, to: cuts[1], cls: 'rt-0', label: '' },
    { from: cuts[1], to: cuts[2], cls: 'rt-1', label: tierName(1) },
    { from: cuts[2], to: cuts[3], cls: 'rt-2', label: tierName(2) },
    { from: cuts[3], to: 10, cls: 'rt-3', label: tierName(3) },
  ];

  return (
    <div className="rate-break rate-break-v2">
      <div className="rb-head">
        <span className={`rb-score mono ${tierClass(rating)}`}>{rating.score.toFixed(1)}</span>
        <span className="rb-head-text">
          {rating.label && <span className="rb-label">{rating.label}</span>}
          {countryLine && <span className="rb-country">{countryLine}</span>}
        </span>
      </div>

      {/* Where the score stands, against the thresholds it is judged by. */}
      <div className="rb-scale" aria-hidden="true">
        <div className="rb-bands">
          {bands.map((b) => (
            <span
              key={b.cls}
              className={`rb-band ${b.cls}`}
              style={{ width: `${((b.to - b.from) / 10) * 100}%` }}
              title={b.label}
            />
          ))}
          <span className={`rb-me ${tierClass(rating)}`} style={{ left: `${pos}%` }} />
        </div>
        <div className="rb-ticks">
          {[1, 2, 3].map((tier) => (
            <span key={tier} className="rb-tick" style={{ left: `${(cuts[tier] / 10) * 100}%` }}>
              <span className="mono">{cuts[tier].toFixed(1)}</span>
            </span>
          ))}
        </div>
        <div className="rb-legend">
          {[1, 2, 3].map((tier) => (
            <span key={tier} className={`rb-leg rt-${tier}`}><span className="rb-leg-swatch" />{tierName(tier)}</span>
          ))}
        </div>
      </div>

      {/* The four measurements behind it, at the weights the model used. */}
      {rows.length > 0 && (
        <ul className="rb-parts">
          {rows.map((k) => (
            <li key={k} className="rb-part">
              <span className="rb-part-top">
                <span className="rb-part-name">{t(`rating.part.${k}`)}</span>
                <span className="rb-part-val mono">{(comps[k] * 10).toFixed(1)}</span>
              </span>
              <span className="rb-part-track">
                <span className="rb-part-fill" style={{ width: `${Math.max(2, comps[k] * 100)}%` }} />
              </span>
              <span className="rb-part-weight">{t('rating.weight', { pct: Math.round(weights[k] * 100) })}</span>
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
