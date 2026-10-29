import React from 'react';
import { DateField } from '../../components/DateField.jsx';
import { Stepper } from '../../components/FilterControls.jsx';
import { CalendarIcon } from '../../components/Icons.jsx';
import { Button, Segmented, Chip, ChipGroup } from '../../components/ui/index.js';
import { MAX_TRIP_NIGHTS } from '../../lib/tripDates.js';
import { fmtDate } from '../../lib/dates.js';
import { nightsText } from './wizardSteps.js';
import { useI18n } from '../../i18n/index.jsx';

/**
 * When: exact dates on one inline two-month calendar, or a number of nights
 * in a month. Every date control sits on one card: floating single-line
 * inputs across a wide screen read as unrelated fragments. T815: the kit's
 * quiet buttons for Clear and Change dates, and the flow's night limit (60,
 * not 21, so a 30-night trip from the When question opens in range).
 */
export function StepWhen({
  titleTag, dateMode, setDateMode, startDate, setStartDate, endDate, setEndDate, calOpen, setCalOpen,
  windowNights, dateMin, dateMax, pickTripDate, flexNights, setFlexNights, flexMonth, setFlexMonth, months,
}) {
  const { t } = useI18n();
  const StepTitle = titleTag;
  return (
    <>
      <StepTitle className="guide-title">{t('wizard.whenLabel')}</StepTitle>
      <div className="guide-card guide-when-card">
        <Segmented
          block
          className="wwhen-mode"
          label={t('wizard.whenLabel')}
          value={dateMode}
          onChange={setDateMode}
          options={[
            { value: 'exact', label: t('wizard.knowDates') },
            { value: 'flex', label: t('wizard.imFlexible') },
          ]}
        />

        {dateMode === 'exact' ? (
          // One click sets the start, the next closes the range, and the
          // nights count updates as you go.
          <div className="guide-card-row">
            <div className="guide-range-head">
              <span className={`guide-range-end ${!startDate ? 'empty' : ''} ${!endDate ? 'next' : ''}`}>
                <span className="trip-field-label">{t('wizard.start')}</span>
                <b>{startDate ? fmtDate(startDate, true) : t('wizard.departureDate')}</b>
              </span>
              <span className="trip-dates-arrow" aria-hidden="true">→</span>
              <span className={`guide-range-end ${!endDate ? 'empty' : ''} ${startDate && !endDate ? 'next' : ''}`}>
                <span className="trip-field-label">{t('wizard.end')}</span>
                <b>{endDate ? fmtDate(endDate, true) : t('wizard.returnDate')}</b>
              </span>
              {windowNights > 0 && (
                <span className="guide-when-nights">{nightsText(t, windowNights)}</span>
              )}
              {(startDate || endDate) && (
                <Button
                  variant="quiet"
                  size="sm"
                  className="guide-stay-filter-clear"
                  onClick={() => { setStartDate(''); setEndDate(''); setCalOpen(true); }}
                >{t('wizard.stayFilterClear')}</Button>
              )}
            </div>
            {/* Two months of calendar is 600px of screen saying what the
                line above already says once the span is set. It folds, and
                the dates themselves reopen it. */}
            {calOpen ? (
              <DateField
                inline
                panes={2}
                value={startDate}
                rangeStart={startDate}
                rangeEnd={endDate}
                min={dateMin}
                max={dateMax}
                onChange={pickTripDate}
              />
            ) : (
              <Button variant="quiet" size="sm" className="guide-when-reopen" iconStart={<CalendarIcon size={16} />} onClick={() => setCalOpen(true)}>
                {t('wizard.changeDates')}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="guide-card-row">
              <span className="trip-field-label">{t('wizard.howLong')}</span>
              <div className="wwhen-nights">
                <Stepper
                  value={flexNights}
                  min={1}
                  max={MAX_TRIP_NIGHTS}
                  onChange={setFlexNights}
                  ariaLabel={t('wizard.howLong')}
                  decLabel={t('wizard.fewerNights')}
                  incLabel={t('wizard.moreNights')}
                />
                {/* The unit beside the stepper's own figure, hidden from
                    screen readers: the stepper's name already says it. */}
                <span aria-hidden="true">{flexNights === 1 ? t('wizard.night') : t('wizard.nights')}</span>
              </div>
            </div>
            <div className="guide-card-row">
              <span className="trip-field-label">{t('wizard.whichMonth')}</span>
              <ChipGroup label={t('wizard.whichMonth')} className="guide-months guide-month-grid">
                <Chip kind="choice" className="guide-chip" selected={flexMonth === ''} onClick={() => setFlexMonth('')}>{t('wizard.anyMonth')}</Chip>
                {months.map((m) => (
                  <Chip key={m.key} kind="choice" className="guide-chip" selected={flexMonth === m.key} onClick={() => setFlexMonth(m.key)}>
                    {m.label}
                  </Chip>
                ))}
              </ChipGroup>
            </div>
          </>
        )}
      </div>
    </>
  );
}
