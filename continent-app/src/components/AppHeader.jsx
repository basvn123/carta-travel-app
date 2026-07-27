import React from 'react';
import Logo from './Logo.jsx';
import { OriginPicker } from './OriginPicker.jsx';
import { LanguagePicker } from './LanguagePicker.jsx';
import { useI18n } from '../i18n/index.jsx';
import { PersonIcon, HomeIcon, MapPinIcon, RouteIcon, ListDayIcon, BookmarkIcon } from './Icons.jsx';

const NAV_ITEMS = [
  { key: 'home', labelKey: 'nav.home', Icon: HomeIcon },
  { key: 'map', labelKey: 'nav.map', Icon: MapPinIcon },
  { key: 'trip', labelKey: 'nav.trip', Icon: RouteIcon },
  { key: 'day', labelKey: 'nav.day', Icon: ListDayIcon },
];

function AccountButton({ user, onOpenAccount }) {
  const { t } = useI18n();
  const fullName = user?.user_metadata?.full_name?.trim();
  const initial = (fullName || user?.email || '?')[0].toUpperCase();
  return (
    <button
      className="account-avatar-btn"
      onClick={onOpenAccount}
      title={user ? (fullName || user.email) : t('header.accountTitle')}
    >
      <span className="account-avatar">
        {user ? initial : <PersonIcon size={14} />}
      </span>
      <span className="account-avatar-label">{t('header.account')}</span>
    </button>
  );
}

// Always-mounted top panel: brand + section tabs on the left, the Map tab's
// filters in the middle, and account access on the right, a single row, not
// a separate header stacked above the filter bar. Home is a first-class tab
// here (the brand mark still works as a shortcut). The tabs are desktop-only;
// on mobile they collapse (CSS) and BottomNav takes over as the Home/Map/
// Trip planner/Day planner switch. `children` is the FilterBar, injected only
// on the Map tab.
export function AppHeader({
  user, onOpenAccount,
  isHome, onGoHome,
  activeTab, onChangeTab,
  savedOpen, onToggleSaved,
  data, origin, onChangeOrigin,
  children,
}) {
  const { t } = useI18n();
  return (
    <div className={`app-header ${children ? 'has-filters' : ''}`}>
      <button
        className={`app-header-brand ${isHome ? 'is-home' : ''}`}
        onClick={onGoHome}
        title={t('nav.homeTitle')}
        aria-current={isHome ? 'page' : undefined}
      >
        <Logo size={46} className="brand-mark" />
        <div className="brand-text">
          <span className="brand-name">Carta</span>
          <span className="brand-sub">{t('brand.sub')}</span>
        </div>
        <div className="brand-divider" aria-hidden="true" />
      </button>

      {/* Desktop-only section switch (BottomNav covers this below 768px). */}
      <nav className="header-nav" aria-label="Sections">
        {NAV_ITEMS.map(({ key, labelKey, Icon }) => (
          <button
            key={key}
            className={`header-nav-item ${activeTab === key && !savedOpen ? 'active' : ''}`}
            aria-current={activeTab === key && !savedOpen ? 'page' : undefined}
            onClick={() => onChangeTab(key)}
            title={t(labelKey)}
          >
            <Icon size={15} className="header-nav-icon" />
            <span className="header-nav-label">{t(labelKey)}</span>
          </button>
        ))}
        <button
          className={`header-nav-item ${savedOpen ? 'active' : ''}`}
          aria-pressed={savedOpen}
          onClick={onToggleSaved}
          title={t('nav.saved')}
        >
          <BookmarkIcon size={15} className="header-nav-icon" />
          <span className="header-nav-label">{t('nav.saved')}</span>
        </button>
      </nav>

      {children && <div className="app-header-filters">{children}</div>}

      <div className="app-header-account">
        {/* The From picker only belongs on the Map tab: the Trip planner asks
            "where are you travelling from?" inside its own flow, and the Day
            planner doesn't price flights at all. */}
        {activeTab === 'map' && (
          <OriginPicker data={data} origin={origin} onChangeOrigin={onChangeOrigin} />
        )}
        <LanguagePicker />
        <AccountButton user={user} onOpenAccount={onOpenAccount} />
      </div>
    </div>
  );
}
