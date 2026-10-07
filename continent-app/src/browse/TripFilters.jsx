import React from 'react';
import { BANDS } from '../lib/tripFilters.js';
import { SHORT, WEEK } from '../lib/tripLength.js';
import { tagLabel } from '../lib/tripTags.js';

/**
 * The curated trip list's two filters (T188): the length the list is read at
 * and the cost band. Two rows of toggle buttons in the house button style
 * (styles/43-trip-length.css), a pressed one filled with --ink-fill.
 *
 * Length is two buttons and always one of them is pressed, because every trip
 * exists at both lengths and a length cannot drop a trip; it sets the days and
 * the total each card shows and the total the band tests. Cost is four
 * buttons: Any cost, then three bands whose edges come from the library
 * (lib/tripFilters.js costEdges), each carrying how many trips it would show.
 * Pressing the pressed band clears it. With no edges (a library too small to
 * split) the cost row is not drawn.
 *
 * The tag row (T089, styles/44-tags.css) is the third filter: Any tag, then the
 * tags common in the open style, each with how many trips it would show. One
 * tag at a time; pressing the pressed one clears it. With no tags on the wire
 * the row is not drawn.
 */
export function TripFilters({
  length, onLength, band, onBand, edges, counts,
  tag = null, onTag, tags = [], tagCounts = {},
  onClear, active, t, lang,
}) {
  const eur = (n) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  const label = {
    low: edges ? t('journey.fltUnder', { eur: eur(edges.low) }) : '',
    mid: edges ? t('journey.fltBetween', { lo: eur(edges.low), hi: eur(edges.high) }) : '',
    high: edges ? t('journey.fltOver', { eur: eur(edges.high) }) : '',
  };
  return (
    <div className="tf-bar" role="group" aria-label={t('journey.fltAria')}>
      <div className="tf-group">
        <span className="tf-label">{t('journey.lenLabel')}</span>
        <div className="tf-row">
          {[[WEEK, t('journey.lenWeek', { n: 7 })], [SHORT, t('journey.fltShort')]].map(([key, text]) => (
            <button key={key} type="button" className={`tl-btn${length === key ? ' tl-on' : ''}`}
              aria-pressed={length === key} onClick={() => onLength(key)}>
              {text}
            </button>
          ))}
        </div>
      </div>
      {edges && (
        <div className="tf-group">
          <span className="tf-label">{t('journey.fltCost')}</span>
          <div className="tf-row">
            <button type="button" className={`tl-btn${band == null ? ' tl-on' : ''}`}
              aria-pressed={band == null} onClick={() => onBand(null)}>
              {t('journey.fltAnyCost')}
            </button>
            {BANDS.map((key) => (
              <button key={key} type="button" className={`tl-btn${band === key ? ' tl-on' : ''}`}
                aria-pressed={band === key} onClick={() => onBand(band === key ? null : key)}>
                <span className="mono">{label[key]}</span>
                <span className="tf-n mono">{counts?.[key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {tags.length > 0 && (
        <div className="tf-group">
          <span className="tf-label">{t('journey.fltTag')}</span>
          <div className="tf-row tf-tags">
            <button type="button" className={`tl-btn${tag == null ? ' tl-on' : ''}`}
              aria-pressed={tag == null} onClick={() => onTag(null)}>
              {t('journey.fltAnyTag')}
            </button>
            {tags.map((key) => (
              <button key={key} type="button" className={`tl-btn${tag === key ? ' tl-on' : ''}`}
                aria-pressed={tag === key} onClick={() => onTag(tag === key ? null : key)}>
                <span>{tagLabel(key)}</span>
                <span className="tf-n mono">{tagCounts[key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="tf-note">
        {t('journey.fltNote')}
        {active && (
          <button type="button" className="tf-clear" onClick={onClear}>{t('journey.fltClear')}</button>
        )}
      </p>
    </div>
  );
}
