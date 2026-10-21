import React, { useEffect, useMemo, useRef } from 'react';
import { ScoreChip } from '../../components/RatingBadge.jsx';
import { Stepper } from '../../components/FilterControls.jsx';
import { cityInsight } from '../../lib/tripGuide.js';
import { cityLabel } from '../../lib/placeName.js';
import { fmtDate, addDays } from '../../lib/dates.js';
import { stayDatesLink } from '../../lib/transportLinks.js';
import { paidEur } from '../../lib/tripTotal.js';
import { BedIcon, CloseIcon } from '../../components/Icons.jsx';
import { PaidField } from '../PlanTotal.jsx';
import { Flag, CityThumb } from '../GuidedTripWizardParts.jsx';
import { useI18n } from '../../i18n/index.jsx';

/**
 * Your stays: the beds are booked, so the traveller types the towns they hold
 * (T458): one card a stay, its nights on the kit stepper, its dates, a place
 * to find a bed and the price paid. The add card sits beside the list on
 * desktop so the step uses the width.
 */
export function StepStays({
  titleTag, stopDates, destinations, nights, setCityNights, ownStays, setOwnStay, bedEstimate,
  adults, kids, stayQuery, setStayQuery, pickedStopId = '',
}) {
  const { t } = useI18n();
  const StepTitle = titleTag;
  // Anywhere in the catalogue, by name, for the traveller who already knows
  // which towns they hold.
  const stayMatches = useMemo(() => {
    const sq = stayQuery.trim().toLowerCase();
    if (!sq) return [];
    return Object.entries(destinations)
      .filter(([id, d]) => d && d.lat != null && d.city.toLowerCase().includes(sq) && !(nights[id] > 0))
      .map(([id, d]) => ({ id, dest: d }))
      .sort((a, b) => (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0))
      .slice(0, 8);
  }, [stayQuery, destinations, nights]);

  // A pin tapped on the stops map picks its row here: highlight and bring it into view.
  const listRef = useRef(null);
  useEffect(() => {
    if (!pickedStopId || !listRef.current) return;
    const row = listRef.current.querySelector('.wstay.is-picked');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pickedStopId]);

  return (
    <>
      <StepTitle className="guide-title">{t('wizard.staysTitle')}</StepTitle>
      <div className={`wstays ${stopDates.length ? '' : 'is-empty'}`}>
        {stopDates.length > 0 && (
          <ol className="wstay-list" ref={listRef}>
            {stopDates.map((row, i) => {
              const dest = destinations[row.id];
              if (!dest) return null;
              const leave = row.arrive ? addDays(row.arrive, row.nights) : '';
              return (
                <li className={`wstay${row.id === pickedStopId ? ' is-picked' : ''}`} key={`${row.id}-${i}`} aria-current={row.id === pickedStopId ? 'true' : undefined}>
                  <span className="wstay-index" aria-hidden="true">{i + 1}</span>
                  <CityThumb dest={dest} className="wstay-thumb" />
                  <div className="wstay-info">
                    <h3 className="wstay-city">{cityLabel(dest.city)} <Flag iso2={dest.iso2} className="guide-flag-img-sm" /></h3>
                    <p className="wstay-sub">
                      {row.arrive
                        ? t('plan.dateRange', { a: fmtDate(row.arrive, true), b: fmtDate(leave, true) })
                        : dest.country}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="wstay-remove"
                    onClick={() => setCityNights(row.id, 0)}
                    aria-label={t('wizard.removeStop', { city: cityLabel(dest.city) })}
                    title={t('wizard.removeStop', { city: cityLabel(dest.city) })}
                  ><CloseIcon size={16} /></button>
                  <div className="wstay-nights">
                    <Stepper
                      value={row.nights}
                      min={1}
                      max={30}
                      onChange={(n) => setCityNights(row.id, n)}
                      ariaLabel={t('wizard.nightsIn', { city: cityLabel(dest.city) })}
                      decLabel={t('wizard.fewerNights')}
                      incLabel={t('wizard.moreNights')}
                    />
                    <span className="wstay-nights-word" aria-hidden="true">{row.nights === 1 ? t('wizard.nightOne') : t('wizard.nightMany')}</span>
                  </div>
                  <div className="wstay-acts">
                    {row.arrive && !(ownStays[row.id] > 0) && (
                      <a
                        className="btn btn-quiet btn-sm wrev-find"
                        href={stayDatesLink({
                          city: dest.city, country: dest.country, checkin: row.arrive, checkout: leave,
                          adults, children: kids,
                        })}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <span className="btn-label">{t('plan.findStay')}</span>
                        <span className="sr-only"> {t('plan.opensNewTab')}</span>
                      </a>
                    )}
                    <PaidField
                      id={`bed-${row.id}`}
                      value={paidEur(ownStays[row.id])}
                      estimate={bedEstimate(row.id)}
                      label={t('plan.bookingPrice')}
                      addLabel={t('plan.addBookingPrice')}
                      onChange={(n) => setOwnStay(row.id, n)}
                      folded
                      hint={false}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="guide-card wstays-add">
          <div className="guide-card-head"><BedIcon size={14} /> {t('wizard.addStop')}</div>
          <input
            className="guide-search"
            type="search"
            value={stayQuery}
            onChange={(e) => setStayQuery(e.target.value)}
            placeholder={t('wizard.searchCities')}
            aria-label={t('wizard.searchCities')}
          />
          {stayMatches.length > 0 && (
            <div className="guide-city-list">
              {stayMatches.map(({ id, dest }) => (
                <button
                  key={id}
                  className="guide-city guide-city-btn"
                  onClick={() => { setCityNights(id, 2); setStayQuery(''); }}
                >
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
          {stayQuery && !stayMatches.length && (
            <p className="guide-empty">{t('wizard.noCityMatches', { q: stayQuery })}</p>
          )}
        </div>
      </div>
    </>
  );
}
