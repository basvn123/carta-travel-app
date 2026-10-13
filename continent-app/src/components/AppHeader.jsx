import React, { useRef } from 'react';
import { useNavMarker } from '../lib/motion.js';
import Logo from './Logo.jsx';
import { Button } from './ui/index.js';
import { useI18n } from '../i18n/index.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { tabHref } from '../lib/urlState.js';
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

/**
 * One door into a section, as a real link (T381, the navigation rule): the
 * href is the section's own address, so a middle click opens it in a new tab
 * and a long press copies it; a plain click stays in the app and goes through
 * the one door, goToTab, which also writes the history entry. The address is
 * re-read from the bar whenever the link is about to be used, because the
 * query moves under it (useUrlSync rewrites it 300 ms after every change).
 */
export function SectionLink({ tab, onNavigate, className, current, title, children, ...rest }) {
  const refresh = (e) => { e.currentTarget.setAttribute('href', tabHref(tab)); };
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(tab);
  };
  return (
    <a
      href={tabHref(tab)}
      className={className}
      aria-current={current ? 'page' : undefined}
      title={title}
      onClick={onClick}
      onPointerDown={refresh}
      onFocus={refresh}
      onContextMenu={refresh}
      {...rest}
    >
      {children}
    </a>
  );
}

/**
 * The count chip and the state dot (carta-design, count chip). The chip is
 * the shortlist's size in mono; the dot says a plan is in progress. Both are
 * drawn for the eye only: the words ride along for screen readers, so the
 * item's name stays its label followed by one plain sentence.
 */
export function NavCount({ n }) {
  const { t } = useI18n();
  if (!n) return null;
  return (
    <>
      <span className="nav-count" aria-hidden="true">{n}</span>
      <span className="sr-only">{`, ${t('nav.myTripsCount', { n })}`}</span>
    </>
  );
}
export function NavDot({ on }) {
  const { t } = useI18n();
  if (!on) return null;
  return (
    <>
      <span className="nav-dot" aria-hidden="true" />
      <span className="sr-only">{`, ${t('nav.planInProgress')}`}</span>
    </>
  );
}

function AccountButton({ user, onOpenAccount, accountOpen }) {
  const { t } = useI18n();
  const fullName = user?.user_metadata?.full_name?.trim();
  const initial = (fullName || user?.email || '?')[0].toUpperCase();
  // Pressed state, and a second press closes: on desktop the account page has
  // no cross of its own (see .account-panel .panel-close), so this button is
  // its only door, both ways.
  return (
    <button
      type="button"
      className={`account-avatar-btn${accountOpen ? ' on' : ''}`}
      aria-current={accountOpen ? 'page' : undefined}
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
// a separate header stacked above the filter bar. The brand mark is a link
// to the landing page, the app's home (T381, rule R1). The tabs are
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
  // The shortlist's size for the count chip after My trips, and whether a
  // trip plan is in progress (the state dot on the Trip planner tab).
  savedCount = 0, planInProgress = false,
  children,
}) {
  const { t, lang } = useI18n();
  const navRef = useRef(null);
  const markerRef = useRef(null);
  const activeKey = savedOpen && !accountOpen ? 'saved' : (accountOpen ? '' : activeTab);
  useNavMarker(navRef, markerRef, `${activeKey}:${lang}:${savedCount}:${planInProgress}`, {
    itemSelector: '.header-nav-item.active',
  });
  // The pass chip is chrome, not a gate, so it goes straight to the price
  // table. A caller may still override where it points; nothing does today.
  const paywall = usePaywall();
  const seePricing = onSeePricing || paywall.openPrices;
  return (
    <div className={`app-header ${children ? 'has-filters' : ''}`}>
      <SectionLink
        tab="home"
        className="app-header-brand"
        onNavigate={onBrandClick}
        current={activeTab === 'home' && !savedOpen && !accountOpen}
        title={t('nav.brandTitle')}
        aria-label={t('nav.brandTitle')}
      >
        <Logo size={46} className="brand-mark" />
        <span className="brand-text">
          <span className="brand-name">Carta</span>
          <span className="brand-sub">{t('brand.sub')}</span>
        </span>
        <span className="brand-divider" aria-hidden="true" />
      </SectionLink>

      {/* Desktop-only section switch (BottomNav covers this below 768px).
          A page laid over a tab (My trips, Account) takes the active state
          away from it: the bar marks what is actually on screen, which is the
          same rule BottomNav follows. */}
      <nav className="header-nav" ref={navRef} aria-label={t('nav.sectionsLabel')}>
        <span className="nav-marker" ref={markerRef} aria-hidden="true" />
        {NAV_ITEMS.map(({ key, labelKey, Icon }) => {
          const on = activeTab === key && !savedOpen && !accountOpen;
          return (
            <SectionLink
              key={key}
              tab={key}
              className={`header-nav-item ${on ? 'active' : ''}`}
              current={on}
              onNavigate={onChangeTab}
              title={t(labelKey)}
            >
              <Icon size={15} className="header-nav-icon" />
              <span className="header-nav-label">{t(labelKey)}</span>
              {key === 'trip' && <NavDot on={planInProgress} />}
            </SectionLink>
          );
        })}
        {/* My trips is a page laid over the tab, not a section of its own:
            a toggle, so a button, announcing aria-current while it is the
            page on screen. One name for it on both widths (T381). */}
        <button
          type="button"
          className={`header-nav-item ${savedOpen && !accountOpen ? 'active' : ''}`}
          aria-current={savedOpen && !accountOpen ? 'page' : undefined}
          onClick={onToggleSaved}
          title={t('nav.myTrips')}
        >
          <BookmarkIcon size={15} className="header-nav-icon" />
          <span className="header-nav-label">{t('nav.myTrips')}</span>
          <NavCount n={savedCount} />
        </button>
      </nav>

      {children && <div className="app-header-filters">{children}</div>}

      <div className="app-header-account">
        {/* Passes entry: "Get a pass", a kit secondary on every width (T426;
            secondary chrome is never filled in teal). The language
            picker left this row for the Account panel: switching languages is
            rare, the row over the map is not the place to spend width on it. */}
        {seePricing && (
          <Button
            variant="secondary"
            size="sm"
            className="shell-pass-btn"
            iconStart={<TicketIcon size={16} />}
            onClick={seePricing}
            title={t('header.seePricing')}
            aria-label={t('header.passes')}
          >
            {t('header.passes')}
          </Button>
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
          <Button
            variant="secondary"
            size="sm"
            className="shell-friends-btn"
            iconStart={<FriendsIcon size={16} />}
            onClick={onOpenFriends}
            aria-pressed={!!friendsOpen}
            aria-label={t('friends.title')}
            title={t('friends.title')}
          >
            {t('friends.title')}
          </Button>
        )}
        <AccountButton user={user} onOpenAccount={onOpenAccount} accountOpen={accountOpen} />
      </div>
    </div>
  );
}
