import React, { useEffect, useState } from 'react';
import { GlobeIcon, CompassIcon, RouteIcon, ListDayIcon, BookmarkIcon, PlusIcon, PersonIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

// Bottom navigation, MOBILE only (hidden by CSS on desktop, where the same
// sections live in the AppHeader). Five slots around a raised central plus:
// Destinations (the catalogue + published trips), Explore (the map), the plus
// that opens the Trip planner / Day planner chooser, My trips (the saved-trips
// panel) and Account (the account panel, which left the top bar on mobile so
// the row over the map keeps its width for the filters). Home has no tab here
// on purpose: the front page is a desktop entrance, and on a phone every bar
// item already leads somewhere more useful. The homepage overlay sits BELOW
// this bar (z-index), so tapping any item leaves it like any other tab switch.
export function BottomNav({
  activeTab, onChangeTab,
  savedOpen, onToggleSaved,
  accountOpen, onToggleAccount,
}) {
  const { t } = useI18n();
  const [planOpen, setPlanOpen] = useState(false);

  // The chooser is a takeover, however small: Escape must close it.
  useEffect(() => {
    if (!planOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setPlanOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [planOpen]);

  const goTab = (key) => { setPlanOpen(false); onChangeTab(key); };
  // A slide-over (saved trips, account) on top of a tab claims the active
  // state: the bar highlights what is actually on screen.
  const overlayOpen = savedOpen || accountOpen;
  const planActive = (activeTab === 'trip' || activeTab === 'day') && !overlayOpen;

  return (
    <>
      {planOpen && (
        <>
          <div className="plan-chooser-backdrop" onClick={() => setPlanOpen(false)} />
          <div className="plan-chooser" role="dialog" aria-label={t('nav.planNew')}>
            <button className="plan-chooser-item" onClick={() => goTab('trip')}>
              <RouteIcon size={22} className="plan-chooser-icon" />
              <span className="plan-chooser-text">
                <span className="plan-chooser-title">{t('nav.trip')}</span>
                <span className="plan-chooser-sub">{t('nav.planTripSub')}</span>
              </span>
            </button>
            <button className="plan-chooser-item" onClick={() => goTab('day')}>
              <ListDayIcon size={22} className="plan-chooser-icon" />
              <span className="plan-chooser-text">
                <span className="plan-chooser-title">{t('nav.day')}</span>
                <span className="plan-chooser-sub">{t('nav.planDaySub')}</span>
              </span>
            </button>
          </div>
        </>
      )}

      <nav className="bottom-nav" aria-label="Sections">
        <button
          className={`bottom-nav-item ${activeTab === 'places' && !overlayOpen ? 'active' : ''}`}
          aria-current={activeTab === 'places' && !overlayOpen ? 'page' : undefined}
          onClick={() => goTab('places')}
          title={t('nav.places')}
        >
          <GlobeIcon size={22} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('nav.places')}</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === 'map' && !overlayOpen ? 'active' : ''}`}
          aria-current={activeTab === 'map' && !overlayOpen ? 'page' : undefined}
          onClick={() => goTab('map')}
          title={t('nav.map')}
        >
          <CompassIcon size={22} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('nav.explore')}</span>
        </button>

        <button
          className={`bottom-nav-plus ${planOpen ? 'open' : ''} ${planActive ? 'active' : ''}`}
          aria-expanded={planOpen}
          aria-label={t('nav.planNew')}
          title={t('nav.planNew')}
          onClick={() => setPlanOpen((v) => !v)}
        >
          <PlusIcon size={24} className="bottom-nav-plus-icon" />
        </button>

        <button
          className={`bottom-nav-item ${savedOpen ? 'active' : ''}`}
          aria-pressed={savedOpen}
          onClick={() => { setPlanOpen(false); onToggleSaved(); }}
          title={t('nav.saved')}
        >
          <BookmarkIcon size={22} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('nav.myTrips')}</span>
        </button>

        <button
          className={`bottom-nav-item ${accountOpen ? 'active' : ''}`}
          aria-pressed={accountOpen}
          onClick={() => { setPlanOpen(false); onToggleAccount(); }}
          title={t('header.accountTitle')}
        >
          <PersonIcon size={22} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('nav.account')}</span>
        </button>
      </nav>
    </>
  );
}
