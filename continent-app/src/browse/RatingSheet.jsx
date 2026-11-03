import React from 'react';
import { createPortal } from 'react-dom';
import { PART_REACH, PART_WEIGHTS, classRank, ratingPart, ratingWhy } from '../lib/rating.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { IconButton } from '../components/ui/index.js';
import { CloseIcon } from '../components/Icons.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * Why a place rates what it rates (T1029, owner: "behind the rating label
 * ... super clear, but insightful"). Opened from the Score in the place
 * page's head: a bottom sheet on a phone, a centred panel from 600 px (the
 * flight sheet's frame, 38-first-run.css .frr-*).
 *
 *   the Score and its band, then the one reason sentence in the reader's
 *   language (the lazy why files, English standing in)
 *   where it stands: in its country (rank of all rated places there) and in
 *   Europe (its class: big cities, towns...), from the wire's ranks
 *   what goes into it: the four parts in the model's weight order, each with
 *   a plain name that says what it measures, its value out of ten and a bar;
 *   recognition names the registers the place is on
 *   one line on how the parts become the score (weights from config through
 *   PART_WEIGHTS, then the class curve), so the bars are never read as a sum
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
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  useFocusTrap(panelRef, onClose, { initialFocusRef: closeRef });
  const why = useRatingWhy(destination?.id, rating, lang);
  if (!rating || rating.score == null) return null;

  const rank = classRank(rating);
  const cls = rank ? t(`rating.class.${rank.cls}`) : '';
  const europe = !rank ? '' : rank.top ? t('rs.top', { pct: rank.top, cls }) : t('rs.above', { pct: rank.pct, cls });
  const inCountry = rating.country_rank && rating.country_n
    ? (rating.country_rank === 1 ? t('rs.bestOf', { n: rating.country_n }) : t('rs.rankOf', { rank: rating.country_rank, n: rating.country_n }))
    : '';
  const registers = [...new Set((destination?.designations || []).map((x) => x?.name).filter(Boolean))];
  const parts = ORDER
    .map((k) => ({ k, v: ratingPart(rating, k), w: PART_WEIGHTS[k] }))
    .filter((r) => r.v != null && r.w != null);
  const weight = Object.fromEntries(parts.map(({ k, w }) => [k, Math.round(w * 100)]));
  const title = t('rs.title', { city, score: fmtScore(rating.score) });

  return createPortal(
    <div className="frr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="frr-sheet rs-sheet" role="dialog" aria-modal="true" aria-labelledby="rs-h" ref={panelRef}>
        <div className="frr-sheet-head">
          <h2 id="rs-h">{title}</h2>
          <IconButton label={t('receipt.sheetClose')} onClick={onClose} ref={closeRef}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
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
                    <span className="rs-part-sub">
                      {k === 'recognition' && registers.length ? registers.join(', ') : t(`rs.sub.${k}`)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="rs-how">
                {t('rs.how', { a: weight.appeal, d: weight.depth, b: weight.beauty, r: weight.recognition, cls: cls || t('rating.class.city') })}
              </p>
            </section>
          )}

          {rating.hidden_gem && <p className="rs-how">{t('rating.gemWhy')}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
