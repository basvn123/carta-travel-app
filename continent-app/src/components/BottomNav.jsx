import React from 'react';
import { MapPinIcon, RouteIcon, ListDayIcon } from './Icons.jsx';

const ITEMS = [
  { key: 'map', label: 'Map', Icon: MapPinIcon },
  { key: 'trip', label: 'Trip planner', Icon: RouteIcon },
  { key: 'day', label: 'Day planner', Icon: ListDayIcon },
];

// Persistent bottom navigation (Strava-style icon + label tabs), shown on
// every screen size - the app's one and only Map/Trip planner/Day planner
// switch (AppHeader carries just the brand + account button, no tabs).
export function BottomNav({ activeTab, onChangeTab }) {
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          className={`bottom-nav-item ${activeTab === key ? 'active' : ''}`}
          aria-current={activeTab === key ? 'page' : undefined}
          onClick={() => onChangeTab(key)}
        >
          <Icon size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
