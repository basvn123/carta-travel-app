import React from 'react';
import Logo from './Logo.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import {
  PersonIcon, CompassIcon, GlobeIcon, RouteIcon, ListDayIcon, BookmarkIcon,
  TicketIcon, FriendsIcon,
} from './Icons.jsx';

const NAV_ITEMS = [
  { key: 'places', labelKey: 'nav.places', Icon: GlobeIcon },
  // The tab is still keyed 'map' (state, share links, deep links all use it),
  // but it reads Explore here exactly as it does in the phone bar: one name
  // for one section, whatever the window width.
  { key: 'map', labelKey: 'nav.explore', Icon: CompassIcon },
  { key: 'trip', labelKey: 'nav.trip', Icon: RouteIcon },
  { key: 'day', labelKey: 'nav.day', Icon: ListDayIcon },
];

function AccountButton({ user, onOpenAccount, accountOpen }) {
  const { t } = useI18n();
  const fullName = user?.user_metadata?.full_name?.trim();
  const initial = (fullName || user?.email || '?')[0].toUpperCase();
  // Pressed state, and a second press closes: on desktop the account page has
  // no cross of its own (see .account-panel .panel-close), so this button is
  // its only door, both ways.
  return (
    <button
      className={`account-avatar-btn${accountOpen ? ' on' : ''}`}
      aria-pressed={accountOpen}
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
// a separate header stacked above the filter bar. The brand mark is a
// shortcut back to Destinations, where every visit starts. The tabs are
// desktop-only; on mobile they collapse (CSS) and BottomNav takes over as the
// Destinations/Explore/Trip planner/Day planner switch. `children` is the
// FilterBar, injected only on the Explore tab.
//
// The "travelling from" picker used to live in this row's right edge. It now
// floats over the map itself, level with the Destinations pill (see
// .map-toolrow in App), where it has room to state the question it is asking.
export function AppHeader({
  user, onOpenAccount, accountOpen, onSeePricing, onOpenFriends, friendsOpen,
  onBrandClick,
  activeTab, onChangeTab,
  savedOpen, onToggleSaved,
  children,
}) {
  const { t } = useI18n();
  // The pass chip is chrome, not a gate, so it goes straight to the price
  // table. A caller may still override where it points; nothing does today.
  const paywall = usePaywall();
  const seePricing = onSeePricing || paywall.openPrices;
  return (
    <div className={`app-header ${children ? 'has-filters' : ''}`}>
      <button
        className="app-header-brand"
        onClick={onBrandClick}
        title={t('nav.brandTitle')}
      >
        <Logo size={46} className="brand-mark" />
        <div className="brand-text">
          <span className="brand-name">Carta</span>
          <span className="brand-sub">{t('brand.sub')}</span>
        </div>
        <div className="brand-divider" aria-hidden="true" />
      </button>

      {/* Desktop-only section switch (BottomNav covers this below 768px).
          A page laid over a tab (My trips, Account) takes the active state
          away from it: the bar marks what is actually on screen, which is the
          same rule BottomNav follows. */}
      <nav className="header-nav" aria-label="Sections">
        {NAV_ITEMS.map(({ key, labelKey, Icon }) => (
          <button
            key={key}
            className={`header-nav-item ${activeTab === key && !savedOpen && !accountOpen ? 'active' : ''}`}
            aria-current={activeTab === key && !savedOpen && !accountOpen ? 'page' : undefined}
            onClick={() => onChangeTab(key)}
            title={t(labelKey)}
          >
            <Icon size={15} className="header-nav-icon" />
            <span className="header-nav-label">{t(labelKey)}</span>
          </button>
        ))}
        <button
          className={`header-nav-item ${savedOpen && !accountOpen ? 'active' : ''}`}
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
        {/* Passes entry: the "Get a pass" chip everywhere now, filled on
            desktop where it is the bar's one call to action. The language
            picker left this row for the Account panel: switching languages is
            rare, the row over the map is not the place to spend width on it. */}
        {seePricing && (
          <button
            className="header-pricing-btn"
            onClick={seePricing}
            title={t('header.seePricing')}
          >
            <TicketIcon size={14} />
            <span className="header-pricing-label">{t('header.seePricing')}</span>
            <span className="header-pricing-label-short">{t('header.passes')}</span>
          </button>
        )}
        {/* Desktop only (CSS hides it below 769px), and Explore's alone:
            that tab portals its search field in here. Destinations used to
            as well and no longer does; its field now heads its own column,
            under this bar and over the results it searches. The slot
            collapses when empty (:empty), so the planner tabs and
            Destinations leave no hole in the row. */}
        <div className="header-search-slot" id="header-search-slot" />
        {/* Friends is its own door, not a row buried in the account panel:
            seeing who you travel with is a place you go, not a setting you
            change. It lives in this group rather than with the section tabs
            because those collapse on a phone and this must not. */}
        {onOpenFriends && user && (
          <button
            className={`header-friends-btn${friendsOpen ? ' on' : ''}`}
            onClick={onOpenFriends}
            aria-pressed={friendsOpen}
            title={t('friends.title')}
          >
            <FriendsIcon size={15} />
            <span className="header-friends-label">{t('friends.title')}</span>
          </button>
        )}
        <AccountButton user={user} onOpenAccount={onOpenAccount} accountOpen={accountOpen} />
      </div>
    </div>
  );
}
