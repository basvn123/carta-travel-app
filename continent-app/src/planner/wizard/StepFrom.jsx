import React, { useMemo } from 'react';
import { ScoreChip } from '../../components/RatingBadge.jsx';
import { cityInsight } from '../../lib/tripGuide.js';
import { cityLabel } from '../../lib/placeName.js';
import { TRAVEL_MODES, TRAVEL_MODE_LABEL } from '../../lib/transportLinks.js';
import { MapPinIcon, TrainIcon, BusIcon, CarIcon, FerryIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { Flag, CityThumb } from '../GuidedTripWizardParts.jsx';
import { useI18n } from '../../i18n/index.jsx';

// The five ways in, as icons, for the "how did you get there" row. Same five
// the transport section offers, read from the same table.
const TRAVEL_MODE_ICON = {
  fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon,
};

/**
 * From: only on the path where the travel is booked. Where the trip leaves
 * from (the origin card), and where the booked travel puts the traveller
 * down, and how, because that decides the transfer and what the stay
 * suggestions are near.
 */
export function StepFrom({
  titleTag, originCard, booked, destinations, arrivalDest, arrivalQuery, setArrivalQuery, setArrivalId,
  travelValues, setTravelLeg,
}) {
  const { t } = useI18n();
  const StepTitle = titleTag;
  // Arrival-city matches, by name, best rated first.
  const arrivalMatches = useMemo(() => {
    const aq = arrivalQuery.trim().toLowerCase();
    if (!aq) return [];
    return Object.entries(destinations)
      .filter(([, d]) => d && d.lat != null && d.city.toLowerCase().includes(aq))
      .map(([id, d]) => ({ id, dest: d }))
      .sort((a, b) => (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0))
      .slice(0, 8);
  }, [arrivalQuery, destinations]);

  return (
    <>
      <StepTitle className="guide-title">{t('wizard.originLabel')}</StepTitle>

      {originCard}

      {booked.travel && (
        <div className="guide-card">
          <div className="guide-card-head"><MapPinIcon size={14} /> {t('wizard.whereLand')}</div>
          {arrivalDest ? (
            <div className="guide-city guide-arrival-picked on">
              <CityThumb dest={arrivalDest} className="guide-city-thumb" />
              <div className="guide-city-info">
                <div className="guide-city-name">
                  {cityLabel(arrivalDest.city)}
                  <Flag iso2={arrivalDest.iso2} className="guide-flag-img-sm" />
                  {arrivalDest.rating?.score != null && <ScoreChip rating={arrivalDest.rating} size="xs" />}
                </div>
                <div className="guide-city-insight">{cityInsight(arrivalDest)}</div>
              </div>
              <button className="guide-answered-edit" onClick={() => { setArrivalId(''); setArrivalQuery(''); }}>
                {t('wizard.change')}
              </button>
            </div>
          ) : (
            <>
              {/* A visible label over the field (T490-l, rule Field): the
                  placeholder is an example, never the label. */}
              <label className="wfrom-label" htmlFor="wfrom-arrival">{t('wizard.arrivalLabel')}</label>
              <input
                id="wfrom-arrival"
                className="guide-search"
                type="search"
                value={arrivalQuery}
                onChange={(e) => setArrivalQuery(e.target.value)}
                placeholder={t('wizard.searchAirportCity')}
                autoComplete="off"
              />
              {arrivalMatches.length > 0 && (
                <div className="guide-city-list">
                  {arrivalMatches.map(({ id, dest }) => (
                    <button key={id} className="guide-city guide-city-btn" onClick={() => setArrivalId(id)}>
                      <CityThumb dest={dest} className="guide-city-thumb" />
                      <div className="guide-city-info">
                        <div className="guide-city-name">
                          {cityLabel(dest.city)}
                          <Flag iso2={dest.iso2} className="guide-flag-img-sm" />
                          {dest.rating?.score != null && <ScoreChip rating={dest.rating} size="xs" />}
                        </div>
                        <div className="guide-city-insight">{cityInsight(dest)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {arrivalQuery && !arrivalMatches.length && (
                <p className="guide-empty">{t('wizard.noCityMatches', { q: arrivalQuery })}</p>
              )}
            </>
          )}
          {/* How they travel, asked once. The transport section on the
              last screen asks what it cost, and reads this back. */}
          <div className="guide-card-row">
            <span className="trip-field-label">{t('travel.howLabel')}</span>
            <div className="tleg-modes">
              {TRAVEL_MODES.map((m) => {
                const Icon = TRAVEL_MODE_ICON[m];
                const on = travelValues.out?.mode === m;
                return (
                  <button
                    key={m}
                    className={`tleg-mode ${on ? 'on' : ''}`}
                    onClick={() => setTravelLeg('out', { mode: on ? '' : m })}
                    aria-pressed={on}
                  >
                    <Icon size={14} />
                    <span>{t(TRAVEL_MODE_LABEL[m])}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
