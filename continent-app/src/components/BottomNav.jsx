import React from 'react';
import { MapPinIcon, RouteIcon, ListDayIcon, BookmarkIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

const ITEMS = [
  { key: 'map', labelKey: 'nav.map', Icon: MapPinIcon },
  { key: 'trip', labelKey: 'nav.trip', Icon: RouteIcon },
  { key: 'day', labelKey: 'nav.day', Icon: ListDayIcon },
];

// Bottom navigation (Strava-style icon + label tabs), the Map/Trip planner/
// Day planner switch on MOBILE, on desktop it's hidden by CSS and the same
// tabs render in the AppHeader instead (.header-nav). Includes a Saved trips
// button that opens the saved-trips panel over the current tab.
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
        >
          <Icon size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t(labelKey)}</span>
        </button>
      ))}
      <button
        className={`bottom-nav-item ${savedOpen ? 'active' : ''}`}
        aria-pressed={savedOpen}
        onClick={onToggleSaved}
      >
        <BookmarkIcon size={20} className="bottom-nav-icon" />
        <span className="bottom-nav-label">{t('nav.saved')}</span>
      </button>
    </nav>
  );
}
