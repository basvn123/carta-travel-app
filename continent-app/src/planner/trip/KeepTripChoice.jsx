import { fmtDate } from '../../lib/dates.js';
import { useI18n } from '../../i18n/index.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { Button } from '../../components/Button.jsx';

/** "Sat 14 Nov to Sat 21 Nov, 3 stops" for a trip in the keep-which choice. */
function keptTripLine(t, label, start, end, stops) {
  return [
    start && end ? t('plan.dateRange', { a: fmtDate(start, true), b: fmtDate(end, true) }) : '',
    stops ? t(stops === 1 ? 'trip.stopsOne' : 'trip.stopsMany', { n: stops }) : '',
  ].filter(Boolean).join(', ') || label;
}

/**
 * A trip kept on this device meets an account that already holds a trip on
 * the free plan (T490-f): the traveller chooses which one to keep. Two equal
 * cards, one sentence, no default: nothing happens until one is chosen, and
 * closing keeps both where they are.
 */
export function KeepTripChoice({ device, account, onKeepDevice, onKeepAccount, onClose }) {
  const { t } = useI18n();
  const d = device?.trip || {};
  const rows = [
    {
      key: 'device', name: d.planLabel || t('trip.keepDeviceName'), where: t('trip.keepOnDevice'),
      line: keptTripLine(t, '', d.tripStart, d.tripEnd, d.stops?.length || 0), onKeep: onKeepDevice,
    },
    {
      key: 'account', name: account?.label || t('trip.keepAccountName'), where: t('trip.keepInAccount'),
      line: keptTripLine(t, '', account?.start_date, account?.end_date, account?.cities?.length || 0), onKeep: onKeepAccount,
    },
  ];
  return (
    <SheetShell title={t('trip.keepTitle')} onClose={onClose} className="trip-keep-sheet" labelId="trip-keep-title">
      <p className="trip-keep-lead">{t('trip.keepLead')}</p>
      <ul className="trip-keep-list" role="list">
        {rows.map((r) => (
          <li key={r.key} className="trip-keep-card">
            <span className="trip-keep-where">{r.where}</span>
            <span className="trip-keep-name">{r.name}</span>
            {r.line && <span className="trip-keep-line">{r.line}</span>}
            <Button variant="secondary" className="trip-keep-btn" onClick={r.onKeep}>{t('trip.keepThis')}</Button>
          </li>
        ))}
      </ul>
    </SheetShell>
  );
}
