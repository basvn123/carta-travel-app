import React from 'react';
import Logo from './Logo.jsx';
import { useI18n } from '../i18n/index.jsx';
import { PersonIcon, HomeIcon, MapPinIcon, RouteIcon, ListDayIcon, BookmarkIcon, TicketIcon } from './Icons.jsx';

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
//
// The "travelling from" picker used to live in this row's right edge. It now
// floats over the map itself, level with the Destinations pill (see
// .map-toolrow in App), where it has room to state the question it is asking.
export function AppHeader({
  user, onOpenAccount, onSeePricing,
  isHome, onGoHome,
  activeTab, onChangeTab,
  savedOpen, onToggleSaved,
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
        {/* Passes entry: full "See pricing" wording on desktop, a compact
            labelled chip on mobile. The language picker left this row for the
            Account panel: switching languages is rare, the row over the map
            is not the place to spend width on it. */}
        {onSeePricing && (
          <button
            className="header-pricing-btn"
            onClick={onSeePricing}
            title={t('header.seePricing')}
          >
            <TicketIcon size={14} />
            <span className="header-pricing-label">{t('header.seePricing')}</span>
            <span className="header-pricing-label-short">{t('header.passes')}</span>
          </button>
        )}
        <AccountButton user={user} onOpenAccount={onOpenAccount} />
      </div>
    </div>
  );
}
