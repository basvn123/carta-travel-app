import React, { useMemo } from 'react';
import { SheetShell } from '../browse/SheetShell.jsx';
import { useI18n } from '../i18n/index.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { Button, Chip } from '../components/ui/index.js';
import { formatEst, formatMoney } from '../lib/money.js';
import { compareCountries } from '../lib/countryCompare.js';

/**
 * Compare (T670): two or three picked countries side by side, the figures
 * that decide between them (lib/countryCompare.js). Countries are columns,
 * one row per figure, the header row sticky, and two columns fit a phone
 * (carta-design, the comparison table). The cheapest day carries the one
 * best-value mark; an estimate carries its tilde, a flight price does not
 * (it is Google Flights'). A figure there is too little for says so.
 */
export function CompareSheet({
  names, destinations, dayCosts, flightFile, month, yearMonth, insights, onClose, onRemove,
}) {
  const { t, lang } = useI18n();
  const rows = useMemo(
    () => compareCountries({ names, destinations, dayCosts, flightFile, month, yearMonth, insights }),
    [names, destinations, dayCosts, flightFile, month, yearMonth, insights],
  );
  const est = (v) => (v == null ? t('cmp.none') : formatEst(v, t('money.est'), { precision: 'whole', locale: lang }));
  const monthName = (m) => new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2026, m - 1, 1));
  const figures = [
    { key: 'day', label: t('cmp.day'), cell: (r) => (
      <>
        <span className="cmp-fig">{est(r.day)}</span>
        {r.dayMin != null && <span className="cmp-sub">{t('cmp.from', { price: est(r.dayMin) })}</span>}
        {r.bestValue && <Chip kind="status" tone="best" className="cmp-best">{t('cmp.bestValue')}</Chip>}
      </>
    ) },
    { key: 'night', label: t('cmp.night'), cell: (r) => <span className="cmp-fig">{est(r.night)}</span> },
    { key: 'food', label: t('cmp.food'), cell: (r) => <span className="cmp-fig">{est(r.food)}</span> },
    { key: 'flight', label: t('cmp.flight'), cell: (r) => (r.flight ? (
      <>
        <span className="cmp-fig">{t('cmp.return', { price: formatMoney(r.flight.perSeat, { locale: lang }) })}</span>
        <span className="cmp-sub">{r.flight.airport}</span>
      </>
    ) : <span className="cmp-none">{t('cmp.noFlight')}</span>) },
    { key: 'weather', label: month ? t('cmp.weatherIn', { month: monthName(month) }) : t('cmp.weather'), cell: (r) => (r.weather ? (
      <>
        {r.weather.high != null && <span className="cmp-fig">{t('cmp.high', { n: Math.round(r.weather.high) })}</span>}
        {r.weather.rain != null && <span className="cmp-sub">{t('cmp.rain', { n: Math.round(r.weather.rain) })}</span>}
      </>
    ) : <span className="cmp-none">{month ? t('cmp.none') : t('cmp.pickMonth')}</span>) },
    { key: 'crowds', label: t('cmp.crowds'), cell: (r) => <span className={r.crowds ? 'cmp-fig' : 'cmp-none'}>{r.crowds ? t(`cmp.crowd.${r.crowds}`) : t('cmp.none')}</span> },
    { key: 'best', label: t('cmp.best'), cell: (r) => <span className={r.best.length ? 'cmp-fig is-text' : 'cmp-none'}>{r.best.length ? r.best.map(monthName).join(', ') : t('cmp.none')}</span> },
  ];

  return (
    <SheetShell title={t('cmp.title')} onClose={onClose} className="cmp-sheet" labelId="cmp-title" width={760}>
      <p className="cmp-lead">{t('cmp.lead')}</p>
      <div className="cmp-scroll" role="region" aria-labelledby="cmp-title" tabIndex={0}>
        <table className="cmp-table">
          <thead>
            <tr>
              <th scope="col" className="cmp-rowhead"><span className="sr-only">{t('cmp.figure')}</span></th>
              {rows.map((r) => (
                <th scope="col" key={r.country}>
                  <span className="cmp-country"><CountryFlag country={r.iso2} size={14} /> {r.country}</span>
                  {onRemove && rows.length > 2 && (
                    <Button variant="quiet" size="sm" className="cmp-remove" onClick={() => onRemove(r.country)}>{t('cmp.remove')}</Button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {figures.map((f) => (
              <tr key={f.key}>
                <th scope="row" className="cmp-rowhead">{f.label}</th>
                {rows.map((r) => <td key={r.country}>{f.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cmp-note">{t('cmp.note')}</p>
    </SheetShell>
  );
}
