import React, { useRef } from 'react';
import { PersonIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { SectionLink, NavCount, PLACE_ITEMS, accountInitial } from './AppHeader.jsx';
import { useNavMarker } from '../lib/motion.js';

// Bottom navigation, PHONE only (hidden by CSS from 769 px, where the same
// places live in AppHeader). Four equal slots of --tap-main (T496, roadmap
// 1.3a T1 and 1.15): Explore, Plan, My trips and Account. No plus and no
// chooser: Plan is the way in, and with nothing in progress it opens its own
// "Plan something new" page. Every slot is a link to its place's address.
export function BottomNav({
  user,
  // The place on screen; it carries the selected pill and aria-current.
  place,
  onNavigate,
  // The shortlist's size (count chip on My trips) and whether an unsaved
  // trip plan is in progress (the state dot on Plan).
  savedCount = 0, planInProgress = false,
}) {
  const { t, lang } = useI18n();
  const navRef = useRef(null);
  const markerRef = useRef(null);
  // The place showing is one --select-bg pill behind its icon, sliding
  // between the slots (T391, rule R5).
  useNavMarker(navRef, markerRef, `${place}:${lang}:${savedCount}:${planInProgress}`, {
    itemSelector: '.bottom-nav-item.active', fit: 'icon', iconSelector: '.bottom-nav-icon',
  });

  return (
    <nav className="bottom-nav" ref={navRef} aria-label={t('nav.sectionsLabel')}>
      <span className="nav-marker" ref={markerRef} aria-hidden="true" />
      {PLACE_ITEMS.map(({ key, labelKey, Icon }) => {
        const on = place === key;
        return (
          <SectionLink
            key={key}
            tab={key}
            className={`bottom-nav-item ${on ? 'active' : ''}`}
            current={on}
            onNavigate={onNavigate}
          >
            <span className="bottom-nav-icon">
              <Icon size={22} />
              {key === 'plan' && planInProgress && <span className="nav-dot" aria-hidden="true" />}
            </span>
            <span className="bottom-nav-label">{t(labelKey)}</span>
            {key === 'plan' && planInProgress && <span className="sr-only">{`, ${t('nav.planInProgress')}`}</span>}
            {key === 'trips' && <NavCount n={savedCount} />}
          </SectionLink>
        );
      })}
      <SectionLink
        tab="account"
        className={`bottom-nav-item ${place === 'account' ? 'active' : ''}`}
        current={place === 'account'}
        onNavigate={onNavigate}
      >
        <span className="bottom-nav-icon">
          {/* Signed in, the initial in a 24 px disc; a guest, the person
              glyph. No extra mark for signed out: saving works without an
              account (T473). */}
          {user
            ? <span className="bottom-nav-initial" aria-hidden="true">{accountInitial(user)}</span>
            : <PersonIcon size={22} />}
        </span>
        <span className="bottom-nav-label">{t('nav.account')}</span>
      </SectionLink>
    </nav>
  );
}

