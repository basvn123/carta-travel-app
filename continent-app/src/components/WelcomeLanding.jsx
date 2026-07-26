import React from 'react';
import Logo from './Logo.jsx';
import { OriginPicker } from './OriginPicker.jsx';
import { DateField } from './DateField.jsx';
import { Dropdown } from './Dropdown.jsx';
import { NumberField } from './FilterControls.jsx';
import { LuggageIcon, ClockIcon, BusIcon } from './Icons.jsx';
import { tripDaysBetween } from '../lib/runtime_pricing.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * First-visit welcome: instead of dropping a new visitor straight onto the
 * dense map view (or, worse, onto someone else's parameter-packed shared URL
 * with no orientation at all), open with a short value statement, an editable
 * preview of the trip the URL/state already describes, and the three things
 * this planner does that generic trip apps don't. Editing the widget writes
 * the real app state, so the map behind it is already re-priced by the time
 * it is dismissed. Shown once; the fare-source note it absorbs used to be its
 * own modal (carta.fareNoticeSeen), which it supersedes.
 */
export function WelcomeLanding({
  data, choices, setChoices, onChangeOrigin,
  departDate, setDepartDate, returnDate, setReturnDate, dateBounds,
  reachableCount, totalCount,
  onExplore, onPlanTrip,
}) {
  const { t } = useI18n();
  const baggageOpts = data?.meta?.baggage_options || {};
  const originCity = data?.meta?.origins?.[choices.origin]?.city || choices.origin || '';
  const nights = tripDaysBetween(departDate, returnDate);

  const onDepartChange = (v) => {
    setDepartDate(v);
    if (v && returnDate && returnDate <= v) {
      const d = new Date(v + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 7);
      const next = d.toISOString().slice(0, 10);
      setReturnDate(dateBounds?.max && next > dateBounds.max ? dateBounds.max : next);
    }
  };

  const cards = [
    {
      Icon: LuggageIcon,
      title: t('welcome.cardBagsTitle'),
      body: t('welcome.cardBagsBody'),
    },
    {
      Icon: ClockIcon,
      title: t('welcome.cardTimeTitle'),
      body: t('welcome.cardTimeBody'),
    },
    {
      Icon: BusIcon,
      title: t('welcome.cardHubsTitle'),
      body: t('welcome.cardHubsBody'),
    },
  ];

  return (
    <div className="guide-overlay welcome-overlay" onClick={onExplore}>
      <div className="guide-modal welcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="welcome-brand">
          <Logo size={40} />
          <div>
            <h2 className="guide-title welcome-title">{t('welcome.title')}</h2>
            <p className="welcome-sub">{t('welcome.sub')}</p>
          </div>
        </div>

        <div className="welcome-trip">
          <div className="welcome-trip-head">{t('welcome.tripLabel')}</div>
          <div className="welcome-trip-grid">
            <div className="welcome-field welcome-field-origin">
              <label className="filter-label">{t('origin.from')}</label>
              <OriginPicker data={data} origin={choices.origin} onChangeOrigin={onChangeOrigin} />
            </div>
            <div className="welcome-field">
              <label className="filter-label">{t('filter.depart')}</label>
              <DateField
                value={departDate || ''}
                min={dateBounds?.min}
                max={dateBounds?.max}
                onChange={onDepartChange}
              />
            </div>
            <div className="welcome-field">
              <label className="filter-label">{t('filter.return')}</label>
              <DateField
                value={returnDate || ''}
                min={departDate || dateBounds?.min}
                max={dateBounds?.max}
                onChange={(v) => setReturnDate(v)}
              />
            </div>
            <div className="welcome-field">
              <label className="filter-label">{t('filter.people')}</label>
              <NumberField
                value={choices.group_size}
                min={1}
                max={20}
                onCommit={(v) => setChoices({ ...choices, group_size: v })}
                ariaLabel={t('filter.people')}
              />
            </div>
            <div className="welcome-field">
              <label className="filter-label">{t('filter.baggage')}</label>
              <Dropdown
                value={choices.baggage_key}
                onChange={(key) => {
                  const opt = baggageOpts[key];
                  setChoices({
                    ...choices,
                    baggage_key: key,
                    baggage_per_direction_eur: opt?.per_direction_eur || 0,
                  });
                }}
                options={Object.entries(baggageOpts).map(([k, v]) => ({
                  value: k,
                  label: v.label,
                }))}
              />
            </div>
          </div>
          {/* Live proof that the widget drives the real app: this count comes
              from the same pricing pass the map behind the modal renders. */}
          <p className="welcome-live">
            {nights > 0 && <span className="welcome-live-nights">{t('welcome.nights', { n: nights })}</span>}
            {t('welcome.reachable', { n: reachableCount, total: totalCount, city: originCity })}
          </p>
        </div>

        <div className="welcome-cards">
          {cards.map(({ Icon, title, body }) => (
            <div className="welcome-card" key={title}>
              <span className="welcome-card-icon"><Icon size={17} /></span>
              <div>
                <b>{title}</b>
                <p>{body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="welcome-fares">{t('fareNotice.body1')}</p>

        <div className="welcome-actions">
          <button className="guide-next welcome-cta" onClick={onExplore}>{t('welcome.explore')}</button>
          <button className="welcome-secondary" onClick={onPlanTrip}>{t('welcome.planTrip')}</button>
        </div>
      </div>
    </div>
  );
}
