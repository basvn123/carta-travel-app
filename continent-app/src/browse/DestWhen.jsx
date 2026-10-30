import React from 'react';
import { safeUrl } from '../lib/format.js';
import { monthName } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import { ClimateStrip } from './ClimateStrip.jsx';
import { PSection } from './PageTemplate.jsx';

/**
 * The place page's When to go (T912, the owner's approved one-page spec,
 * 2026-10-30; was a tab, T499): the twelve months with their highs and rain,
 * the best months marked and the traveller's month outlined (ClimateStrip),
 * then the cells a traveller decides on: what a day costs by month (the
 * cheapest, the dearest and the traveller's own month, from the measured
 * bed curve and the same cost row as the price card), the crowds, the events
 * in the traveller's month (d.festivals) and the swimming water. Then every
 * dated festival as a list.
 *
 * A cell without data is not drawn; with nothing at all the section is not
 * either. No "Not available yet" lines.
 */

/** The day a person by month: { cheap, dear, yours } or null. `curve` is the
 *  bed's month shape (stayPrice.seasonCurve), `row` the cost row the card
 *  prices (its bed is at `pricedMonth`), `ownMonth` the traveller's month. */
export function monthDayCosts(curve, row, pricedMonth, ownMonth) {
  if (!Array.isArray(curve) || curve.length !== 12 || !pricedMonth) return null;
  const stay = Number(row?.stayEur);
  const food = Number(row?.foodEur);
  if (!Number.isFinite(stay) || !Number.isFinite(food)) return null;
  const base = curve[pricedMonth - 1];
  if (!(base > 0)) return null;
  const day = curve.map((f) => Math.round(stay * (f / base) + food));
  const lo = Math.min(...day);
  const hi = Math.max(...day);
  if (hi <= lo) return null;
  const at = (v) => day.map((x, i) => (x === v ? i + 1 : 0)).filter(Boolean);
  return {
    cheap: { months: at(lo), eur: lo },
    dear: { months: at(hi), eur: hi },
    yours: ownMonth ? { month: ownMonth, eur: day[ownMonth - 1] } : null,
  };
}

export function DestWhen({ p }) {
  const { t, lang, destination, water, monthPick, festivals, monthList, crowdText, monthCosts, view } = p;
  const climate = destination.climate?.m ? destination.climate : null;
  const mName = (m) => monthName(m, lang, true);
  const money = (eur) => formatMoney(view.day(eur), { precision: 'whole' });
  const monthFests = monthPick ? festivals.filter((f) => f.months?.includes(monthPick)) : [];
  const swim = water?.n_sites > 0 && Number.isFinite(water?.excellent_pct) ? water : null;

  const cells = [
    crowdText && { key: 'crowds', label: t('dest.keyCrowds'), value: crowdText },
    monthFests.length > 0 && {
      key: 'events',
      label: t('destx.eventsIn', { month: mName(monthPick) }),
      value: monthFests.slice(0, 2).map((f) => f.name).join(', '),
      note: monthFests[0]?.what && lang === 'en' ? monthFests[0].what : null,
    },
    swim && {
      key: 'swim',
      label: t('destx.swim'),
      value: t('destx.swimValue', { n: swim.n_sites, pct: Math.round(swim.excellent_pct) }),
      note: swim.nearest?.name && Number.isFinite(swim.nearest.dist_km)
        ? t('destx.swimNearest', { km: Math.round(swim.nearest.dist_km) }) : null,
    },
  ].filter(Boolean);

  const dated = festivals.filter((f) => f.months?.length);
  if (!climate && !monthCosts && !cells.length && !dated.length) return null;

  return (
    <PSection id="pt-when" title={t('dest.whenTitle')}>
      {climate && (
        <div className="pt-months">
          <ClimateStrip climate={climate} month={monthPick} figures />
        </div>
      )}
      {monthCosts && (
        <div className="pt-cell is-wide">
          <small className="pt-cell-label">{t('destx.byMonth')}</small>
          <b>{t('destx.byMonthCheap', { months: monthList(monthCosts.cheap.months), price: money(monthCosts.cheap.eur) })}</b>
          <span className="pt-cell-text">
            {t('destx.byMonthDear', { months: monthList(monthCosts.dear.months), price: money(monthCosts.dear.eur) })}
            {monthCosts.yours && (
              <>{' '}{t('destx.byMonthYours', { month: mName(monthCosts.yours.month), price: money(monthCosts.yours.eur) })}</>
            )}
          </span>
        </div>
      )}
      {cells.length > 0 && (
        <div className="pt-cells">
          {cells.map((c) => (
            <div className="pt-cell" key={c.key}>
              <small className="pt-cell-label">{c.label}</small>
              <b>{c.value}</b>
              {c.note && <span className="pt-cell-text">{c.note}</span>}
            </div>
          ))}
        </div>
      )}
      {dated.length > 0 && (
        <ul className="pt-fests" aria-label={t('dest.festivalsTitle')}>
          {dated.map((f) => (
            <li key={f.name}>
              <span className="pt-fest-when">{monthList(f.months)}</span>
              <span className="pt-fest-name">
                {safeUrl(f.url) ? <a href={safeUrl(f.url)} target="_blank" rel="noreferrer">{f.name}</a> : f.name}
                {f.what && lang === 'en' && <small>{f.what}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PSection>
  );
}
