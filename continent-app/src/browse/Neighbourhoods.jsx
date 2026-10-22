import React from 'react';
import { BedIcon } from '../components/Icons.jsx';
import { MONTHS_SHORT } from './ClimateStrip.jsx';
import { monthName } from '../lib/dates.js';
import { eurExact } from '../lib/format.js';
import { formatEst } from '../lib/money.js';

/**
 * Where to sleep (PLAN.md D3): the neighbourhood prices the wire always
 * carried and no renderer ever spent. Cheapest to dearest with a bar per
 * neighbourhood, the stay tiers underneath, and the 12-month price curve so
 * "when is it cheap" sits beside "where is it cheap". Data (schema v18):
 * `sleep.beds` (annual bed prices), `sleep.curve` (the measured 12-month
 * shape, lib/stayPrice.js seasonCurve) and `sleep.neighbourhoods` (Inside
 * Airbnb medians); absent entirely when there is none of it, never an empty
 * shell.
 */
export function Neighbourhoods({ sleep, t }) {
  const hoods = sleep?.neighbourhoods || [];
  // 397 destinations carry neighbourhood rows (the Inside Airbnb anchor
  // cities); the tiers and the price curve reach further. Render whatever
  // exists, nothing when nothing does.
  if (!hoods.length && !sleep?.beds && !sleep?.curve) return null;
  const max = Math.max(...hoods.map((n) => n.night_eur || 0), 1);
  const seasonality = sleep.curve || null;
  const beds = sleep.beds || null;
  // A bed not measured in this town is a stand-in: the tilde and the word.
  const bedEur = (v) => (sleep.q === 'measured' ? eurExact(v)
    : formatEst(v, t('money.est'), { precision: 'cents' }));
  const sMin = seasonality ? Math.min(...seasonality) : 0;
  const sMax = seasonality ? Math.max(...seasonality) : 1;
  const cheapMonth = seasonality ? seasonality.indexOf(sMin) : -1;
  const mShort = (i) => monthName(i + 1, t.lang || 'en', false) || MONTHS_SHORT[i];

  return (
    <div className="destp-sleep">
      {hoods.length > 0 && (
      <ul className="destp-hoods">
        {hoods.map((n) => (
          <li key={n.name} className="destp-hood">
            <span className="destp-hood-name">{n.name}</span>
            <span className="destp-hood-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(6, ((n.night_eur || 0) / max) * 100)}%` }} />
            </span>
            <span className="destp-hood-eur mono">
              {n.night_eur != null ? bedEur(n.night_eur) : ''}
            </span>
          </li>
        ))}
      </ul>
      )}
      {beds && (
        <p className="destp-sleep-tiers">
          <BedIcon size={13} />
          {[
            beds.dorm != null && t('dest.tierDorm', { eur: bedEur(beds.dorm) }),
            beds.private != null && t('dest.tierPrivate', { eur: bedEur(beds.private) }),
            beds.bnb_home?.['2'] != null && t('dest.tierHome', { eur: bedEur(beds.bnb_home['2']) }),
            beds.hotel3 != null && t('dest.tierHotel', { eur: bedEur(beds.hotel3) }),
          ].filter(Boolean).map((s, i) => (
            <span key={s} className="destp-sleep-tier">{i > 0 && <span className="destp-sleep-sep" aria-hidden="true" />}{s}</span>
          ))}
        </p>
      )}
      {seasonality && sMax > sMin && (
        <div className="destp-season">
          <div className="destp-season-bars" aria-hidden="true">
            {seasonality.map((v, i) => (
              <span
                key={MONTHS_SHORT[i]}
                className={i === cheapMonth ? 'is-low' : ''}
                style={{ height: `${20 + ((v - sMin) / (sMax - sMin)) * 80}%` }}
                title={mShort(i)}
              />
            ))}
          </div>
          {cheapMonth >= 0 && (
            <p className="destp-season-note">
              {t('dest.cheapestMonth', { month: mShort(cheapMonth) })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
