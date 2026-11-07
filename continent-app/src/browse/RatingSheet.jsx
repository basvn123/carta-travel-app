import React from 'react';
import { PART_REACH, PART_WEIGHTS, classRank, ratingPart, ratingWhy } from '../lib/rating.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { DialogSheet } from '../components/ui/index.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * Why a place rates what it rates (T1029, owner: "behind the rating label
 * ... super clear, but insightful"). Opened from the Score in the place
 * page's head: a bottom sheet on a phone, a centred panel from 600 px (the
 * flight sheet's frame, 38-first-run.css .frr-*).
 *
 *   the Score and its band, then the one reason sentence in the reader's
 *   language (the lazy why files, English standing in)
 *   where it stands: in its country (its rank as a share of the places
 *   there) and in Europe (its class: big cities, towns...), in plain words
 *   what goes into it: the four parts in the model's weight order, each a
 *   plain name with its value out of ten and a bar (owner: no sublines, no
 *   weights line)
 *
 * No "Measured": every rated place is a hand or rubric judgement, and the
 * word claimed more than that.
 */

const ORDER = ['appeal', 'depth', 'beauty', 'recognition'];

function useRatingWhy(id, rating, lang) {
  const [why, setWhy] = React.useState(rating?.why || '');
  React.useEffect(() => {
    let live = true;
    ratingWhy(id, rating, lang).then((w) => { if (live) setWhy(w); });
    return () => { live = false; };
  }, [id, lang, rating]);
  return why;
}

export function RatingSheet({ rating, destination, city, country, fmtScore, onClose }) {
  const { t, lang } = useI18n();
  const why = useRatingWhy(destination?.id, rating, lang);
  if (!rating || rating.score == null) return null;

  const rank = classRank(rating);
  const cls = rank ? t(`rating.class.${rank.cls}`) : '';
  const europe = !rank ? '' : rank.top ? t('rs.top', { pct: rank.top, cls }) : t('rs.above', { pct: rank.pct, cls });
  // Owner 2026-11-03: the standing in words a traveller reads at once, the
  // country rank as a share of its places, never "#176 of 300".
  const cRank = Number(rating.country_rank);
  const cN = Number(rating.country_n);
  const share = cRank > 0 && cN > 0 ? cRank / cN : null;
  const inCountry = share == null ? ''
    : cRank === 1 ? t('rs.cBest')
    : share <= 0.1 ? t('rs.cTop', { pct: Math.max(1, Math.round(share * 100)) })
    : t('rs.cAbove', { pct: Math.round((1 - share) * 100) });
  const parts = ORDER
    .map((k) => ({ k, v: ratingPart(rating, k) }))
    .filter((r) => r.v != null && PART_WEIGHTS[r.k] != null);
  const title = t('rs.title', { city, score: fmtScore(rating.score) });

  return (
    <DialogSheet titleId="rs-h" title={title} className="rs-sheet" onClose={onClose} closeLabel={t('receipt.sheetClose')}>
      <div className="rs-body">
        <div className="rs-hero">
          <ScoreChip rating={rating} size="lg" band />
          {why && <p className="rs-why">{why}</p>}
        </div>

        {(inCountry || europe) && (
          <dl className="rs-stand">
            {inCountry && <div><dt>{t('rs.inCountry', { country })}</dt><dd>{inCountry}</dd></div>}
            {europe && <div><dt>{t('rs.inEurope')}</dt><dd>{europe}</dd></div>}
          </dl>
        )}

        {parts.length > 0 && (
          <section className="rs-parts" aria-labelledby="rs-parts-h">
            <h3 id="rs-parts-h" className="rs-h">{t('rs.parts')}</h3>
            <ul>
              {parts.map(({ k, v }) => (
                <li key={k} className="rs-part">
                  <span className="rs-part-top">
                    <span className="rs-part-name">{t(`rs.part.${k}`, PART_REACH)}</span>
                    <span className="rs-part-val">{fmtScore(Math.round(v * 100) / 10)}</span>
                  </span>
                  <span className="rs-track" aria-hidden="true"><span style={{ width: `${Math.max(2, v * 100)}%` }} /></span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rating.hidden_gem && <p className="rs-gem">{t('rating.gemWhy')}</p>}
      </div>
    </DialogSheet>
  );
}
