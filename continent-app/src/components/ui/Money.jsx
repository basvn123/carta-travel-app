/*
 * Money (T423): a euro figure on screen.
 *
 *   <Money value={87.4} />                      €87         (whole: cards, lists, pins)
 *   <Money value={87.4} precision="cents" />    €87.40      (receipts, totals)
 *   <Money value={87.4} est />                  €87, drawn like any figure (plan rule 2)
 *   <Money low={40} high={60} />                €40 to €60
 *   <Money value={null} />                      Price on request
 *
 * Formatting is src/lib/money.js; this adds the missing-value words from
 * i18n and the .money class (tabular figures, no wrap inside the figure).
 *
 * Price plan rule 2 (owner, 2026-10-24, replacing T590's tilde): the
 * traveller sees one amount and its unit. `est` is still accepted, so its
 * callers keep saying which figures are estimates, but it draws nothing:
 * whether a price is measured, live or estimated lives in the price
 * engine's lines (lib/price/) and the internal view.
 */
import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney, formatMoneyRange } from '../../lib/money.js';

// eslint-disable-next-line no-unused-vars
export function Money({ value, low, high, precision = 'whole', est = false, className = '' }) {
  const { t } = useI18n();
  const range = low != null || high != null;
  const finite = range ? Number.isFinite(low) || Number.isFinite(high) : Number.isFinite(value);
  const cls = ['money', !finite && 'is-missing', className].filter(Boolean).join(' ');
  if (!finite) return <span className={cls}>{t('money.onRequest')}</span>;
  const plain = range ? formatMoneyRange(low, high, { precision }) : formatMoney(value, { precision });
  return <span className={cls}>{plain}</span>;
}
