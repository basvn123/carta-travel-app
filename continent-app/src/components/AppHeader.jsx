import React from 'react';
import Logo from './Logo.jsx';
import { OriginPicker } from './OriginPicker.jsx';
import { PersonIcon, HomeIcon, MapPinIcon, RouteIcon, ListDayIcon, BookmarkIcon } from './Icons.jsx';

const NAV_ITEMS = [
  { key: 'map', label: 'Map', Icon: MapPinIcon },
  { key: 'trip', label: 'Trip planner', Icon: RouteIcon },
  { key: 'day', label: 'Day planner', Icon: ListDayIcon },
];

function AccountButton({ user, onOpenAccount }) {
  const fullName = user?.user_metadata?.full_name?.trim();
  const initial = (fullName || user?.email || '?')[0].toUpperCase();
  return (
    <button
      className="account-avatar-btn"
      onClick={onOpenAccount}
      title={user ? (fullName || user.email) : 'Account & preferences'}
    >
      <span className="account-avatar">
        {user ? initial : <PersonIcon size={14} />}
      </span>
      <span className="account-avatar-label">Account</span>
    </button>
  );
}

// Always-mounted top panel: brand + section tabs on the left, the Map tab's
// filters in the middle, and account access on the right - a single row, not
// a separate header stacked above the filter bar. The tabs here are
// desktop-only; on mobile they collapse (CSS) and BottomNav takes over as the
// Map/Trip planner/Day planner switch, with a Home icon shortcut remaining in
// this row. `children` is the FilterBar, injected only on the Map tab.
export function AppHeader({
  user, onOpenAccount,
  isHome, onGoHome,
  activeTab, onChangeTab,
  savedOpen, onToggleSaved,
  data, origin, onChangeOrigin,
  children,
}) {
  return (
    <div className={`app-header ${children ? 'has-filters' : ''}`}>
      <div className="app-header-brand">
        <Logo size={46} className="brand-mark" />
        <div className="brand-text">
          <span className="brand-name">Carta</span>
          <span className="brand-sub">Europe Travel</span>
        </div>
        <div className="brand-divider" aria-hidden="true" />
      </div>

      {/* Desktop-only section switch (BottomNav covers this below 768px). */}
      <nav className="header-nav" aria-label="Sections">
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`header-nav-item ${activeTab === key && !savedOpen ? 'active' : ''}`}
            aria-current={activeTab === key && !savedOpen ? 'page' : undefined}
            onClick={() => onChangeTab(key)}
            title={label}
          >
            <Icon size={15} className="header-nav-icon" />
            <span className="header-nav-label">{label}</span>
          </button>
        ))}
        <button
          className={`header-nav-item ${savedOpen ? 'active' : ''}`}
          aria-pressed={savedOpen}
          onClick={onToggleSaved}
          title="Saved trips"
        >
          <BookmarkIcon size={15} className="header-nav-icon" />
          <span className="header-nav-label">Saved trips</span>
        </button>
      </nav>

      {/* Mobile-only Home shortcut: jumps back to the first page (the map). */}
      <button
        className={`header-home-btn ${isHome ? 'active' : ''}`}
        onClick={onGoHome}
        aria-current={isHome ? 'page' : undefined}
        title="Home - explore the map"
      >
        <HomeIcon size={18} className="header-home-icon" />
        <span className="header-home-label">Home</span>
      </button>

      {children && <div className="app-header-filters">{children}</div>}

      <div className="app-header-account">
        <OriginPicker data={data} origin={origin} onChangeOrigin={onChangeOrigin} />
        <AccountButton user={user} onOpenAccount={onOpenAccount} />
      </div>
    </div>
  );
}
