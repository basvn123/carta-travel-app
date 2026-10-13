/*
 * Money (T423): a euro figure on screen.
 *
 *   <Money value={87.4} />                      €87         (whole: cards, lists, pins)
 *   <Money value={87.4} precision="cents" />    €87.40      (receipts, totals)
 *   <Money value={87.4} est />                  ~€87 est.   (an estimate, always both marks)
 *   <Money low={40} high={60} />                €40 to €60
 *   <Money value={null} />                      Price on request
 *
 * Formatting is src/lib/money.js; this adds the estimate word and the
 * missing-value words from i18n, and the .money class (tabular figures, no
 * wrap between the tilde, the figure and the word).
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
  const figure = range
    ? formatMoneyRange(low, high, { precision })
    : est ? formatApprox(value, { precision }) : formatMoney(value, { precision });
  return (
    <span className={cls}>
      {range && est ? '~' : ''}{figure}
      {est && <span className="money-est"> {t('money.est')}</span>}
    </span>
  );
}
