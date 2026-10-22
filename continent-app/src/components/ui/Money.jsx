/*
 * Money (T423): a euro figure on screen.
 *
 *   <Money value={87.4} />                      €87         (whole: cards, lists, pins)
 *   <Money value={87.4} precision="cents" />    €87.40      (receipts, totals)
 *   <Money value={87.4} est />                  the tilde before the whole figure (an estimate)
 *   <Money low={40} high={60} />                €40 to €60
 *   <Money value={null} />                      Price on request
 *
 * Formatting is src/lib/money.js; this adds the missing-value words from
 * i18n and the .money class (tabular figures, no wrap inside the figure).
 *
 * T590 (owner decision 4, 2026-10-22): the estimate word is gone from the
 * screen; an estimate shows the tilde only. A screen reader does not say a
 * tilde, so the figure is drawn for the eye (aria-hidden) and spoken as
 * money.estSpoken ("about {price}") in visually hidden text.
 */
import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney, formatApprox, formatMoneyRange } from '../../lib/money.js';

export function Money({ value, low, high, precision = 'whole', est = false, className = '' }) {
  const { t } = useI18n();
  const range = low != null || high != null;
  const finite = range ? Number.isFinite(low) || Number.isFinite(high) : Number.isFinite(value);
  const cls = ['money', est && 'is-est', !finite && 'is-missing', className].filter(Boolean).join(' ');
  if (!finite) return <span className={cls}>{t('money.onRequest')}</span>;
  if (!est) {
    const plain = range ? formatMoneyRange(low, high, { precision }) : formatMoney(value, { precision });
    return <span className={cls}>{plain}</span>;
  }
  const exact = range ? formatMoneyRange(low, high, { precision }) : formatMoney(value, { precision });
  const figure = range ? `~${exact}` : formatApprox(value, { precision });
  return (
    <span className={cls}>
      <span aria-hidden="true">{figure}</span>
      <span className="sr-only">{t('money.estSpoken', { price: exact })}</span>
    </span>
  );
}
