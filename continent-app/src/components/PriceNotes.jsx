import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { hasPriceNotes, priceNotes } from '../lib/price/notes.js';
import '../styles/86-price-items.css';

/**
 * The price notes, drawn once (T1114, D10, owner decision 2 of 2026-11-05):
 * "Few listings measured" for a bed priced from few properties and "Not yet
 * measured" for a part with no figure. The rule is lib/price/notes.js; this
 * file only draws it, so the destination page, the trip page, the Plan
 * receipt and the Ask and Explore cards say the same words.
 *
 * The notes carry their own classes, never `.not-yet`, so the destination
 * page's rule that hides empty slots (owner 2026-10-30) gives way for price
 * parts only. They never touch a figure or a total.
 *
 *   ThinBedNote       the short note under a bed figure (a row's own note)
 *   NotMeasuredValue  the value in a part's row ("Not yet measured")
 *   PriceNotes        a compact block for a card: one caption line, from a
 *                     row, a list of rows, or an already computed `notes`
 */
export function ThinBedNote({ className = '' }) {
  const { t } = useI18n();
  return <small className={`tcard-thin${className ? ` ${className}` : ''}`} data-testid="price-thin">{t('price.bedThin')}</small>;
}

/** REQ-data-2: beside a bed figure that is modelled, not measured; the figure stays. */
export function ModelledBedNote({ className = '' }) {
  const { t } = useI18n();
  return <small className={`tcard-thin${className ? ` ${className}` : ''}`} data-testid="price-modelled">{t('price.noteBedModelled')}</small>;
}

/** E3: a bed priced at another tier because the town lacks the one asked for, the tier named. */
export function BedFallbackNote({ fallback, className = '' }) {
  const { t } = useI18n();
  if (!fallback) return null;
  return <small className={`tcard-thin${className ? ` ${className}` : ''}`} data-testid="price-fallback">{t('price.noteBedFallback', { asked: t(`tf.opt.stay.${fallback.asked}`), tier: t(`tf.opt.stay.${fallback.tier}`) })}</small>;
}

export function NotMeasuredValue({ className = '' }) {
  const { t } = useI18n();
  return (
    <span className={`money is-missing tcard-unmeasured${className ? ` ${className}` : ''}`} data-testid="price-unmeasured">
      {t('price.notMeasured')}
    </span>
  );
}

export function PriceNotes({ row = null, notes = null, className = '' }) {
  const { t } = useI18n();
  const n = notes || priceNotes(row);
  if (!hasPriceNotes(n)) return null;
  return (
    <p className={`pnotes${className ? ` ${className}` : ''}`} data-testid="price-notes">
      {n.thinBed && <span className="pnotes-item" data-note="bed">{t('price.noteBed')}</span>}
      {n.modelledBed && <span className="pnotes-item" data-note="bed-modelled">{t('price.noteBedModelled')}</span>}
      {n.fallback && <span className="pnotes-item" data-note="bed-fallback">{t('price.noteBedFallback', { asked: t(`tf.opt.stay.${n.fallback.asked}`), tier: t(`tf.opt.stay.${n.fallback.tier}`) })}</span>}
      {n.unmeasured.map((key) => (
        <span className="pnotes-item" data-note={key} key={key}>
          {t('price.noteMissing', { part: t(`price.item.${key}`) })}
        </span>
      ))}
    </p>
  );
}
