import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { ChoiceRows } from '../../components/ui/index.js';
import { fmtDate } from '../../lib/dates.js';
import { formatMoney } from '../../lib/money.js';
import { cityLabel } from '../../lib/placeName.js';

/**
 * Where a difference in nights goes (T836, T837; owner board panels 1 and
 * 5): one radio row per choice from lib/tripBalance.js, each with what it
 * does to the trip's total. The caller applies the picked one.
 *
 *   question   the sentence above the rows
 *   options    datesOptions() or nightsOptions()
 *   more       true when nights are added (a stop's "Take them from"), false
 *              when they are freed ("Give them to")
 *   stops      the trip's stopDetails, for the towns' names
 *   delta(o)   the total's change for a choice, or null
 */
export function Balance({ question, options, more, stops, value, onPick, delta }) {
  const { t, lang } = useI18n();
  const city = (i) => cityLabel(stops[i]?.dest?.city || '') || t('itin.unknown');
  const priceLine = (o) => {
    const d = delta ? delta(o) : null;
    if (!Number.isFinite(d)) return '';
    const v = formatMoney(Math.abs(d), { precision: 'cents', locale: lang });
    if (Math.abs(d) < 0.005) return t('tp.bal.same');
    return t(d > 0 ? 'tp.bal.more' : 'tp.bal.less', { price: v });
  };
  const label = (o) => {
    if (o.kind === 'end') return t('tp.bal.moveEnd', { date: fmtDate(o.end, true) });
    if (o.kind === 'keep') return t('tp.bal.keep', { date: fmtDate(o.end, true) });
    return t(more ? 'tp.bal.fromCity' : 'tp.bal.toCity', { city: city(o.index) });
  };
  return (
    <div className="tpb">
      <p className="tpb-q">{question}</p>
      <ChoiceRows
        label={question}
        options={options.map((o, i) => ({ value: String(i), icon: null, label: label(o), sub: priceLine(o) }))}
        value={[String(value)]}
        onPick={(v) => onPick(Number(v))}
      />
    </div>
  );
}
