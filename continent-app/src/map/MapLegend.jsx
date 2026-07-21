import React, { useState } from 'react';
import { PlaneIcon, CarIcon } from '../components/TransportIcons.jsx';
import { PLANE_REACH_KM } from '../lib/runtime_pricing.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * What the markers on the browse map mean. The rows change with the travel mode,
 * because the mode changes what a marker can be:
 *
 *   plane, only destinations you can actually fly to are labelled with a price.
 *           Ones you'd have to drive to drop to a hollow dot, so a drive price is
 *           never mistaken for a flight price.
 *   car   - every road-reachable destination is labelled; islands keep a flight
 *           price, since driving there isn't a thing.
 */
export function MapLegend({ transportMode = 'plane', counts = {} }) {
  const { t } = useI18n();
  // Open on a desktop map, folded away on a phone where it would cover it.
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 880,
  );
  const plane = transportMode === 'plane';

  return (
    <div className={`map-legend ${open ? '' : 'is-collapsed'}`}>
      <button
        className="legend-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? t('legend.hide') : t('legend.show')}
      >
        <span>{t('legend.title')}</span>
        <span className="legend-chev">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="legend-body">
          <div className="legend-row">
            <span className="legend-pill"><PlaneIcon size={13} /><i>€000</i></span>
            <span className="legend-text">
              <b>{t('legend.flight')}</b>
              <em>{t('legend.flightDesc', { km: PLANE_REACH_KM })}</em>
            </span>
          </div>

          {plane ? (
            <div className="legend-row">
              <span className="legend-swatch"><i className="pin-dot is-caronly" /></span>
              <span className="legend-text">
                <b>{t('legend.noFlight')}{counts.carOnly ? ` (${counts.carOnly})` : ''}</b>
                <em>{t('legend.noFlightDesc')}</em>
              </span>
            </div>
          ) : (
            <div className="legend-row">
              <span className="legend-pill"><CarIcon size={13} /><i>€000</i></span>
              <span className="legend-text">
                <b>{t('legend.drive')}</b>
                <em>{t('legend.driveDesc')}</em>
              </span>
            </div>
          )}

          <div className="legend-row">
            <span className="legend-swatch"><i className="pin-dot is-unreach" /></span>
            <span className="legend-text">
              <b>{t('legend.unreachable')}{counts.unreachable ? ` (${counts.unreachable})` : ''}</b>
              <em>{t('legend.unreachableDesc')}</em>
            </span>
          </div>

          <div className="legend-sep" />

          <div className="legend-row">
            <span className="legend-pill is-deal"><i>€000</i></span>
            <span className="legend-text"><b>{t('legend.deal')}</b><em>{t('legend.dealDesc')}</em></span>
          </div>
          <div className="legend-row">
            <span className="legend-pill is-gem"><i>€000</i></span>
            <span className="legend-text"><b>{t('legend.gem')}</b><em>{t('legend.gemDesc')}</em></span>
          </div>
        </div>
      )}
    </div>
  );
}
