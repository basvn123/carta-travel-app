/**
 * The four facts a thing-to-do tile carries (T632): subcategory, entry
 * price, visit duration and the town it belongs to. Each comes back with its
 * label and either a value or null; the tile shows the shared placeholder
 * for a null, so the slot is always there.
 *
 * Subcategory: the POI's own kind when the dossier carries it (awaiting a
 * rebuild with derive_do.py), else the type label for the 18% of items whose
 * type says more than "activity", else null.
 */
import { doPriceOf } from './price/doPrice.js';
import { formatMoney } from './money.js';

const DO_TYPE_LABEL = {
  trail: 'dest.doType.trail', festival: 'dest.doType.festival', swim: 'dest.doType.swim',
  experience: 'dest.doType.experience',
};

export const kindSlug = (k) => String(k ?? '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function doFacts(item, t) {
  let kind = null;
  if (item?.kind) {
    const key = `dest.doKind.${kindSlug(item.kind)}`;
    const label = t(key);
    kind = label && label !== key ? label : String(item.kind);
  } else if (DO_TYPE_LABEL[item?.type]) {
    kind = t(DO_TYPE_LABEL[item.type]);
  }

  // The price record first (T701, plan section 5), the older fee_eur figure
  // next; a zero is "Free" (an entry is a category where paying also occurs).
  let fee = null;
  const price = doPriceOf(item?.price, 'activity')
    || doPriceOf(isNum(item?.fee_eur) ? { value: item.fee_eur, currency: 'EUR' } : null, 'activity');
  if (price) {
    fee = price.kind === 'free' ? t('dest.doFree')
      : formatMoney(price.eur, { precision: Number.isInteger(price.eur) ? 'whole' : 'cents' });
  } else if (item?.fee === 'no') fee = t('dest.doFree');
  else if (item?.fee === 'yes') fee = t('dest.doPaid');

  let duration = null;
  if (isNum(item?.duration_min) && item.duration_min > 0) {
    const m = Math.round(item.duration_min);
    duration = m >= 90 ? t('dest.doHours', { n: Math.round(m / 6) / 10 }) : t('dest.doMin', { n: m });
  }

  const town = item?.town ? String(item.town) : null;
  return [
    { k: 'kind', label: t('dest.doLabel.kind'), value: kind },
    { k: 'fee', label: t('dest.doLabel.fee'), value: fee },
    { k: 'duration', label: t('dest.doLabel.duration'), value: duration },
    { k: 'town', label: t('dest.doLabel.town'), value: town },
  ];
}
