import React, { useEffect, useRef, useState } from 'react';
import { GlobeIcon, CompassIcon, RouteIcon, ListDayIcon, BookmarkIcon, PlusIcon, PersonIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { SectionLink, NavCount, NavDot } from './AppHeader.jsx';
import { usePresence, useNavMarker } from '../lib/motion.js';

// Bottom navigation, MOBILE only (hidden by CSS on desktop, where the same
// sections live in the AppHeader). Five slots around a raised central plus:
// Destinations (the catalogue + published trips, where every visit starts),
// Explore (the map), the plus that opens the Trip planner / Day planner
// chooser, My trips (the saved-trips panel) and Account (the account panel,
// which left the top bar on mobile so the row over the map keeps its width
// for the filters). The section doors are links (T381, the navigation rule);
// My trips and Account are pages laid over a tab, so they stay toggles.
export function BottomNav({
  activeTab, onChangeTab,
  savedOpen, onToggleSaved,
  accountOpen, onToggleAccount,
  // The shortlist's size (count chip on My trips) and whether a trip plan is
  // in progress (the state dot on the plus).
  savedCount = 0, planInProgress = false,
}) {
  const { t, lang } = useI18n();
  const [planOpen, setPlanOpen] = useState(false);
  // The chooser leaves in --dur-2 rather than vanishing (T391): it stays
  // mounted, with a leaving class, until its exit has run.
  const chooser = usePresence(planOpen);
  const navRef = useRef(null);
  const markerRef = useRef(null);

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
  // The active section is one --ink-fill pill behind its icon, sliding
  // between the items (T391, rule R5). On a planner tab the plus itself is
  // the filled item, so the pill has no item to sit behind and hides.
  const markerKey = accountOpen ? 'account' : savedOpen ? 'saved' : activeTab;
  useNavMarker(navRef, markerRef, `${markerKey}:${lang}:${savedCount}`, {
    itemSelector: '.bottom-nav-item.active', fit: 'icon', iconSelector: '.bottom-nav-icon',
  });

  return (
    <>
      {chooser.mounted && (
        <>
          <div className={`plan-chooser-backdrop${chooser.leaving ? ' is-leaving' : ''}`} onClick={() => setPlanOpen(false)} />
          <div className={`plan-chooser${chooser.leaving ? ' is-leaving' : ''}`} role="dialog" aria-label={t('nav.planNew')}>
            <SectionLink tab="trip" className="plan-chooser-item" onNavigate={goTab}>
              <RouteIcon size={22} className="plan-chooser-icon" />
              <span className="plan-chooser-text">
                <span className="plan-chooser-title">{t('nav.trip')}</span>
                <span className="plan-chooser-sub">{t('nav.planTripSub')}</span>
              </span>
            </SectionLink>
            <SectionLink tab="day" className="plan-chooser-item" onNavigate={goTab}>
              <ListDayIcon size={22} className="plan-chooser-icon" />
              <span className="plan-chooser-text">
                <span className="plan-chooser-title">{t('nav.day')}</span>
                <span className="plan-chooser-sub">{t('nav.planDaySub')}</span>
              </span>
            </SectionLink>
          </div>
        </>
      )}

      <nav className="bottom-nav" ref={navRef} aria-label={t('nav.sectionsLabel')}>
        <span className="nav-marker" ref={markerRef} aria-hidden="true" />
        <SectionLink
          tab="places"
          className={`bottom-nav-item ${activeTab === 'places' && !overlayOpen ? 'active' : ''}`}
          current={activeTab === 'places' && !overlayOpen}
          onNavigate={goTab}
          title={t('nav.places')}
        >
          <GlobeIcon size={22} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('nav.places')}</span>
        </SectionLink>

        <SectionLink
          tab="map"
          className={`bottom-nav-item ${activeTab === 'map' && !overlayOpen ? 'active' : ''}`}
          current={activeTab === 'map' && !overlayOpen}
          onNavigate={goTab}
          title={t('nav.explore')}
        >
          <CompassIcon size={22} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('nav.explore')}</span>
        </SectionLink>

        {/* The plus opens a chooser, an action, so it stays a button. It
            announces aria-current while a planner is the page on screen. */}
        <button
          type="button"
          className={`bottom-nav-plus ${planOpen ? 'open' : ''} ${planActive ? 'active' : ''}`}
          aria-expanded={planOpen}
          aria-current={planActive ? 'page' : undefined}
          title={t('nav.planNew')}
          onClick={() => setPlanOpen((v) => !v)}
        >
          <PlusIcon size={24} className="bottom-nav-plus-icon" />
          <span className="sr-only">{t('nav.planNew')}</span>
          <NavDot on={planInProgress} />
        </button>

        <button
          type="button"
          className={`bottom-nav-item ${savedOpen ? 'active' : ''}`}
          aria-current={savedOpen && !accountOpen ? 'page' : undefined}
          onClick={() => { setPlanOpen(false); onToggleSaved(); }}
          title={t('nav.myTrips')}
        >
          <BookmarkIcon size={22} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('nav.myTrips')}</span>
          <NavCount n={savedCount} />
        </button>

        <button
          type="button"
          className={`bottom-nav-item ${accountOpen ? 'active' : ''}`}
          aria-current={accountOpen ? 'page' : undefined}
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
