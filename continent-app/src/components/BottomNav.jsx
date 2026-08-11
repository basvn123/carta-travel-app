import React from 'react';
import { HomeIcon, MapPinIcon, RouteIcon, ListDayIcon, BookmarkIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

// Short labels, not the full section names: five tabs at 390px cannot fit
// "Trip planner" and "Saved trips" without wrapping into each other. The
// full names still label the desktop header tabs and the buttons' titles.
const ITEMS = [
  { key: 'home', labelKey: 'nav.homeShort', Icon: HomeIcon },
  { key: 'map', labelKey: 'nav.mapShort', Icon: MapPinIcon },
  { key: 'trip', labelKey: 'nav.tripShort', Icon: RouteIcon },
  { key: 'day', labelKey: 'nav.dayShort', Icon: ListDayIcon },
];

// Bottom navigation (Strava-style icon + label tabs), the Home/Map/Trip
// planner/Day planner switch on MOBILE, on desktop it's hidden by CSS and the
// same tabs render in the AppHeader instead (.header-nav). Includes a Saved
// trips button that opens the saved-trips panel over the current tab. The
// homepage overlay sits BELOW this bar (z-index), so Home behaves like any
// other tab rather than trapping the visitor on the front page.
export function BottomNav({ activeTab, onChangeTab, savedOpen, onToggleSaved }) {
  const { t } = useI18n();
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {ITEMS.map(({ key, labelKey, Icon }) => (
        <button
          key={key}
          className={`bottom-nav-item ${activeTab === key && !savedOpen ? 'active' : ''}`}
          aria-current={activeTab === key && !savedOpen ? 'page' : undefined}
          onClick={() => onChangeTab(key)}
          title={t(`nav.${key}`)}
        >
          <Icon size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t(labelKey)}</span>
        </button>
      ))}
      <button
        className={`bottom-nav-item ${savedOpen ? 'active' : ''}`}
        aria-pressed={savedOpen}
        onClick={onToggleSaved}
        title={t('nav.saved')}
      >
        <BookmarkIcon size={20} className="bottom-nav-icon" />
        <span className="bottom-nav-label">{t('nav.savedShort')}</span>
      </button>
    </nav>
  );
}
