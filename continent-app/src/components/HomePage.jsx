import React from 'react';
import Logo from './Logo.jsx';
import { OriginPicker } from './OriginPicker.jsx';
import { DateField } from './DateField.jsx';
import { Dropdown } from './Dropdown.jsx';
import { NumberField } from './FilterControls.jsx';
import { LanguagePicker } from './LanguagePicker.jsx';
import { LuggageIcon, ClockIcon, BusIcon, ChevronRightIcon } from './Icons.jsx';
import { tripDaysBetween } from '../lib/runtime_pricing.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * The always-on homepage: a full-viewport front page rendered as its own
 * top-level view ('home' in the tab state, no router needed). First-time
 * visitors land here instead of on the raw data view; the brand logo brings
 * anyone back. The hero widget is a real pre-loader: it edits the live app
 * state (origin, dates, travellers, baggage, seeded from any shared URL's
 * params), so the count under it comes from the same pricing pass the map
 * runs, and by the time a CTA hands off into the app, everything is already
 * priced for this trip. Successor of the one-shot WelcomeLanding overlay.
 */
export function HomePage({
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
    <div className="home-page">
      <div className="home-inner">
        <header className="home-top">
          <div className="home-brand">
            <Logo size={44} />
            <div className="brand-text">
              <span className="brand-name">Carta</span>
              <span className="brand-sub">{t('brand.sub')}</span>
            </div>
          </div>
          <div className="home-top-actions">
            <LanguagePicker />
            <button className="home-skip" onClick={onExplore}>
              {t('home.skip')} <ChevronRightIcon size={13} />
            </button>
          </div>
        </header>

        <div className="home-hero">
          <h1 className="home-headline">{t('welcome.title')}</h1>
          <p className="home-sub">{t('welcome.sub')}</p>
        </div>

        <div className="welcome-trip home-trip">
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
              from the same pricing pass the map behind this page renders. */}
          <p className="welcome-live">
            {nights > 0 && <span className="welcome-live-nights">{t('welcome.nights', { n: nights })}</span>}
            {t('welcome.reachable', { n: reachableCount, total: totalCount, city: originCity })}
          </p>
          <div className="welcome-actions home-actions">
            <button className="guide-next welcome-cta" onClick={onExplore}>{t('welcome.explore')}</button>
            <button className="welcome-secondary" onClick={onPlanTrip}>{t('welcome.planTrip')}</button>
          </div>
        </div>

        <div className="welcome-cards home-cards">
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

        <div className="home-how">
          <div className="home-how-title">{t('home.howTitle')}</div>
          <ol className="home-how-steps">
            <li><span className="home-how-num">1</span>{t('home.step1')}</li>
            <li><span className="home-how-num">2</span>{t('home.step2')}</li>
            <li><span className="home-how-num">3</span>{t('home.step3')}</li>
          </ol>
        </div>

        <p className="welcome-fares home-fares">{t('fareNotice.body1')} {t('fareNotice.body2')}</p>
      </div>
    </div>
  );
}
