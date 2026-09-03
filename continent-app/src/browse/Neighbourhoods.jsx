import React from 'react';
import { BedIcon } from '../components/Icons.jsx';
import { MONTHS_SHORT } from './ClimateStrip.jsx';

/**
 * Where to sleep (PLAN.md D3): the neighbourhood prices the wire always
 * carried and no renderer ever spent. Cheapest to dearest with a bar per
 * neighbourhood, the stay tiers underneath, and the 12-month price curve so
 * "when is it cheap" sits beside "where is it cheap". Data is the dossier's
 * `sleep` section (Inside Airbnb city anchors); absent entirely when the
 * destination has no neighbourhood rows - never an empty shell.
 */
export function Neighbourhoods({ sleep, t }) {
  const hoods = sleep?.neighbourhoods || [];
  // 397 destinations carry neighbourhood rows (the Inside Airbnb anchor
  // cities); the tiers and the price curve reach further. Render whatever
  // exists, nothing when nothing does.
  if (!hoods.length && !sleep?.tiers && !sleep?.seasonality) return null;
  const max = Math.max(...hoods.map((n) => n.night_eur || 0), 1);
  const seasonality = sleep.seasonality || null;
  const sMin = seasonality ? Math.min(...seasonality) : 0;
  const sMax = seasonality ? Math.max(...seasonality) : 1;
  const cheapMonth = seasonality ? seasonality.indexOf(sMin) : -1;

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
              {n.night_eur != null ? `€${n.night_eur}` : ''}
            </span>
          </li>
        ))}
      </ul>
      )}
      {hoods.length > 0 && <p className="destp-sleep-note">{t('dest.sleepNote')}</p>}
      {sleep.tiers && (
        <p className="destp-sleep-tiers">
          <BedIcon size={13} />
          {[
            sleep.tiers.dorm_pp_night_eur != null
              && t('dest.tierDorm', { eur: Math.round(sleep.tiers.dorm_pp_night_eur) }),
            sleep.tiers.private_room_night_eur != null
              && t('dest.tierPrivate', { eur: Math.round(sleep.tiers.private_room_night_eur) }),
            sleep.tiers.hotel_night_eur != null
              && t('dest.tierHotel', { eur: Math.round(sleep.tiers.hotel_night_eur) }),
          ].filter(Boolean).join(' · ')}
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
                title={`${MONTHS_SHORT[i]}`}
              />
            ))}
          </div>
          {cheapMonth >= 0 && (
            <p className="destp-season-note">
              {t('dest.cheapestMonth', { month: MONTHS_SHORT[cheapMonth] })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
