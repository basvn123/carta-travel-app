import React from 'react';
import { MapPinIcon, ClockIcon } from '../components/Icons.jsx';
import { safeUrl } from '../lib/format.js';

/**
 * The villages inside an area (PLAN.md D7), consuming B1's members[].
 * Amalfi Coast shows Positano, Amalfi, Ravello and Praiano as a real
 * section: one line each from Wikidata where it exists, the visit-hours
 * prior, and a Wikipedia link. A search for a member name lands on this
 * parent page with `?dm=<member>` in the URL; that member scrolls into
 * view and holds a highlight, so the reader sees why the search brought
 * them HERE.
 */
export function MemberPlaces({ members, focusName, t }) {
  const listRef = React.useRef(null);
  React.useEffect(() => {
    if (!focusName || !listRef.current) return;
    const el = listRef.current.querySelector('[data-focus="1"]');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusName, members]);

  if (!members?.length) return null;
  const foldEq = (a, b) => (a || '').toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') === (b || '').toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

  return (
    <ul className="destp-members" ref={listRef}>
      {members.map((m) => {
        const focused = focusName && foldEq(m.name, focusName);
        return (
          <li key={m.name} data-focus={focused ? '1' : undefined}
            className={`destp-member ${focused ? 'is-focus' : ''}`}>
            <span className="destp-member-head">
              <MapPinIcon size={13} />
              <span className="destp-member-name">{m.name}</span>
              {m.visit_h != null && (
                <span className="destp-member-h mono">
                  <ClockIcon size={11} /> {t('card.hours', { n: Math.round(m.visit_h) })}
                </span>
              )}
            </span>
            {m.desc && <span className="destp-member-desc">{m.desc}</span>}
            {safeUrl(m.wiki) && (
              <a className="destp-member-link" href={safeUrl(m.wiki)}
                target="_blank" rel="noreferrer">{t('dest.memberRead')}</a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
