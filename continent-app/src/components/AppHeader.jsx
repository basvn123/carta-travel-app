import React, { useRef } from 'react';
import { useNavMarker } from '../lib/motion.js';
import { BrandMark, BrandWordmark } from './BrandMarks.jsx';
import { HouseIcon } from './HouseIcons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { tabHref } from '../lib/urlState.js';
import { PersonIcon } from './Icons.jsx';
import { Button } from './ui/index.js';
import { useTogether, waitingCount } from '../together/useTogether.js';

/* The three places (T496, roadmap 1.3a and 1.15; owner T485-b): Explore,
   Plan and My trips, in this order on both widths. Home is the logo and
   Account the icon at the far right; neither is a tab, and the pass is not in
   the bar (T473). BottomNav draws the same list with Account as a fourth
   slot. */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export const PLACE_ITEMS = [
  // House icons (house style 2026-11): the signpost, the route, the ticket.
  { key: 'explore', labelKey: 'nav.explore', Icon: HouseIcon.signpost },
  { key: 'plan', labelKey: 'nav.plan', Icon: HouseIcon.route },
  { key: 'trips', labelKey: 'nav.myTrips', Icon: HouseIcon.ticket },
];

/**
 * One door into a place, as a real link (T381, the navigation rule): the
 * href is the place's own address, so a middle click opens it in a new tab
 * and a long press copies it; a plain click stays in the app and goes through
 * the one door, App's goTo, which also writes the history entry. The address
 * is re-read from the bar whenever the link is about to be used, because the
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
 * the shortlist's size, stars only (owner T488-f); the dot says a plan is in
 * progress and not saved. Both are drawn for the eye only: the words ride
 * along for screen readers, so the item's name stays its label followed by
 * one plain sentence.
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

/** Who is signed in, as the one letter the avatar disc carries. */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function accountInitial(user) {
  const fullName = user?.user_metadata?.full_name?.trim();
  return (fullName || user?.email || '?')[0].toUpperCase();
}

/**
 * The account icon (1.3a D1, item 6): a 44 px round door with a 32 px disc,
 * the person glyph for a guest and the initial when signed in. A link to the
 * Account place; on Account it carries the selected tint.
 */
function AccountLink({ user, current, onNavigate, onSignIn = null }) {
  const { t } = useI18n();
  // G12 (decision.md step 10): signed out, a "Sign in" pill opens the
  // sign-in dialog at once (one requestAuth path in App.jsx), and the person
  // icon beside it still opens Account: a guest's language and "How Viantra
  // works" live there, and a redesign removes no feature (orchestrator,
  // fixes round 1). Signed in, the avatar alone, a link to Account.
  const name = user ? (user.user_metadata?.full_name?.trim() || user.email) : t('header.accountTitle');
  const door = (
    <SectionLink
      tab="account"
      className={`account-door${current ? ' on' : ''}`}
      current={current}
      onNavigate={onNavigate}
      title={name}
      aria-label={name}
    >
      <span className={`account-door-disc${user ? ' has-initial' : ''}`} aria-hidden="true">
        {user ? accountInitial(user) : <PersonIcon size={18} />}
      </span>
    </SectionLink>
  );
  if (user || !onSignIn) return door;
  // Explore rails (owner 2026-11-18, "optimise the account button"): the two
  // guest controls read as one object, a split pill: the person face on
  // the left (Account) and "Sign in" on the right (the dialog). Two real
  // targets, each 44 px, one outline, so the header shows two shapes, not
  // three.
  return (
    <span className="acct-split">
      {door}
      <Button variant="secondary" className="hdr-pill signin-pill" onClick={() => onSignIn('signin')}>
        {t('auth.signIn')}
      </Button>
    </span>
  );
}

/**
 * The Together door (T928, owner-approved spec v2): a people icon beside the
 * account on every device, a link to the Together page. Its badge counts
 * only what is waiting on you (friend requests, co-plan and group
 * invitations, votes you owe), never anything a friend merely did.
 */
function TogetherDoor({ current, onNavigate }) {
  const { t } = useI18n();
  const s = useTogether();
  const n = s.signedIn ? waitingCount(s) : 0;
  const label = n ? t('tg.doorWaiting', { n }) : t('tg.title');
  return (
    <SectionLink
      tab="together"
      className={`hdr-pill tg-door${current ? ' on' : ''}`}
      current={current}
      onNavigate={onNavigate}
      title={t('tg.doorAria')}
      aria-label={n ? label : t('tg.doorAria')}
    >
      {/* G12: the people glyph and the word, so the door says what it is;
          from 769 to 1099 px CSS leaves the glyph alone, with the title. */}
      <HouseIcon.people size={20} />
      <span className="tg-door-word" aria-hidden="true">{t('tg.title')}</span>
      {n > 0 && <span className="tg-door-n" aria-hidden="true">{n > 9 ? '9+' : n}</span>}
    </SectionLink>
  );
}

// The desktop header (CSS hides it below 769 px, where BottomNav and the
// settings band take over): the logo, the three places after it, Explore's
// search slot and the account icon at the far right. One row, 64 px.
export function AppHeader({
  user,
  // The place on screen ('explore' | 'plan' | 'trips' | 'account' | 'home'
  // | 'pricing'): the bar marks what is actually showing.
  place,
  onNavigate,
  // The shortlist's size for the count chip after My trips, and whether an
  // unsaved trip plan is in progress (the state dot on Plan).
  savedCount = 0, planInProgress = false,
  // G12: the Sign in pill's one door, App's requestAuth.
  onSignIn = null,
}) {
  const { t, lang } = useI18n();
  const navRef = useRef(null);
  const markerRef = useRef(null);
  useNavMarker(navRef, markerRef, `${place}:${lang}:${savedCount}:${planInProgress}`, {
    itemSelector: '.header-nav-item.active',
  });
  return (
    <div className="app-header">
      <SectionLink
        tab="home"
        className="app-header-brand"
        onNavigate={onNavigate}
        current={place === 'home'}
        title={t('nav.brandTitle')}
        aria-label={t('nav.brandTitle')}
      >
        {/* The wordmark slot (house style): a blaze and the name in the
            plate face. It takes any name; nothing else depends on it. */}
        <BrandMark className="brand-mark" />
        <span className="brand-name"><BrandWordmark /></span>
      </SectionLink>

      <nav className="header-nav" ref={navRef} aria-label={t('nav.sectionsLabel')}>
        <span className="nav-marker" ref={markerRef} aria-hidden="true" />
        {PLACE_ITEMS.map(({ key, labelKey, Icon }) => {
          const on = place === key;
          return (
            <SectionLink
              key={key}
              tab={key}
              data-nav={key}
              className={`header-nav-item ${on ? 'active' : ''}`}
              current={on}
              onNavigate={onNavigate}
            >
              <Icon size={16} className="header-nav-icon" />
              <span className="header-nav-label">{t(labelKey)}</span>
              {key === 'plan' && <NavDot on={planInProgress} />}
              {key === 'trips' && <NavCount n={savedCount} />}
            </SectionLink>
          );
        })}
      </nav>

      <div className="app-header-account">
        {/* Explore's alone: that place portals its search field in here.
            The slot collapses when empty (:empty), so every other place
            leaves no hole in the row. */}
        <div className="header-search-slot" id="header-search-slot" />
        {/* The travel style moved to the Style dock in the bottom-left
            corner (G12, components/dock/StyleDock.jsx). */}
        <TogetherDoor current={place === 'together'} onNavigate={onNavigate} />
        <AccountLink user={user} current={place === 'account'} onNavigate={onNavigate} onSignIn={onSignIn} />
      </div>
    </div>
  );
}
