import React, { useRef, useState } from 'react';
import { GlobeIcon, CompassIcon, BookmarkIcon, PlusIcon, PersonIcon, ChevronRightIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { SectionLink, NavCount } from './AppHeader.jsx';
import { IconButton } from './ui/index.js';
import { usePresence, useNavMarker } from '../lib/motion.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

// Bottom navigation, MOBILE only (hidden by CSS on desktop, where the same
// sections live in the AppHeader). Five slots around a raised central plus:
// Destinations (the catalogue + published trips, where every visit starts),
// Explore (the map), the plus that opens the Trip planner / Day planner
// chooser, My trips (the saved-trips panel) and Account (the account panel,
// which left the top bar on mobile so the row over the map keeps its width
// for the filters). The section doors are links (T381, the navigation rule);
// My trips and Account are pages laid over a tab, so they stay toggles.

/* The chooser's two drawings (T465): line work in ink on the tile's white,
   the shape of what each planner makes. Decorative, so hidden from assistive
   tech; the planner's name is the label. They are drawings, not icons in a
   tinted tile (carta-design "Icons"). */
function TripDrawing() {
  return (
    <svg className="plan-chooser-art" viewBox="0 0 132 64" aria-hidden="true" focusable="false">
      <path className="pca-line" d="M18 46 C 38 46, 40 20, 64 24 S 96 46, 114 18" />
      <circle className="pca-stop" cx="18" cy="46" r="5" />
      <circle className="pca-stop" cx="64" cy="24" r="5" />
      <circle className="pca-stop pca-stop-end" cx="114" cy="18" r="5" />
    </svg>
  );
}
function DayDrawing() {
  return (
    <svg className="plan-chooser-art" viewBox="0 0 132 64" aria-hidden="true" focusable="false">
      <path className="pca-line" d="M24 12 V 52" />
      <circle className="pca-stop" cx="24" cy="12" r="4.5" />
      <circle className="pca-stop" cx="24" cy="32" r="4.5" />
      <circle className="pca-stop pca-stop-end" cx="24" cy="52" r="4.5" />
      <rect className="pca-bar" x="38" y="8" width="58" height="8" rx="4" />
      <rect className="pca-bar" x="38" y="28" width="76" height="8" rx="4" />
      <rect className="pca-bar" x="38" y="48" width="44" height="8" rx="4" />
    </svg>
  );
}

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
  const chooserRef = useRef(null);

  // The chooser is a takeover, however small (T401): focus moves into it, Tab
  // stays inside, Escape closes it and focus goes back to the plus. It stays a
  // dialog of two links, not a menu: both items navigate, and a menu role
  // would promise arrow-key behaviour links do not have.
  useFocusTrap(chooserRef, () => setPlanOpen(false), { enabled: planOpen });

  const goTab = (key) => { setPlanOpen(false); onChangeTab(key); };
  // A slide-over (saved trips, account) on top of a tab claims the active
  // state: the bar highlights what is actually on screen.
  const overlayOpen = savedOpen || accountOpen;
  const planActive = (activeTab === 'trip' || activeTab === 'day') && !overlayOpen;
  // The active section is one --select-bg pill behind its icon, sliding
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
          {/* Two tiles side by side (T465, owner 2026-10-17: the rows' sub
              lines went, a more modern chooser came). Each is a drawing of
              what you make and the planner's own name: a route through three
              stops, a day down a timeline. One thumb reaches both. */}
          <div className={`plan-chooser${chooser.leaving ? ' is-leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="plan-chooser-h" ref={chooserRef}>
            <h2 className="plan-chooser-h" id="plan-chooser-h">{t('nav.planNew')}</h2>
            <div className="plan-chooser-tiles">
              <SectionLink tab="trip" className="plan-chooser-item" onNavigate={goTab}>
                <TripDrawing />
                <span className="plan-chooser-title">
                  {t('nav.trip')}
                  {planInProgress && <span className="nav-dot" aria-hidden="true" />}
                  {planInProgress && <span className="sr-only">, {t('nav.planInProgress')}</span>}
                  <ChevronRightIcon size={16} className="plan-chooser-chev" />
                </span>
              </SectionLink>
              <SectionLink tab="day" className="plan-chooser-item" onNavigate={goTab}>
                <DayDrawing />
                <span className="plan-chooser-title">
                  {t('nav.day')}
                  <ChevronRightIcon size={16} className="plan-chooser-chev" />
                </span>
              </SectionLink>
            </div>
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
        {/* A kit IconButton on the surface tone (T426): white, one --border
            edge, never a brown or tinted disc at rest (T360, T422-c). The
            dot is drawn inside the glyph, so its words ride in the label. */}
        <IconButton
          tone="surface"
          className={`bottom-nav-plus${planOpen ? ' open' : ''}${planActive ? ' active' : ''}`}
          aria-expanded={planOpen}
          aria-current={planActive ? 'page' : undefined}
          label={planInProgress ? `${t('nav.planNew')}, ${t('nav.planInProgress')}` : t('nav.planNew')}
          onClick={() => setPlanOpen((v) => !v)}
        >
          <PlusIcon size={24} className="bottom-nav-plus-icon" />
          {planInProgress && <span className="nav-dot" />}
        </IconButton>

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
