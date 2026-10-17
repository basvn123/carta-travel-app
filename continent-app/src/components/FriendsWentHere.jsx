import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';
import { ChevronDownIcon } from './Icons.jsx';
import { Button } from './ui/index.js';
import { useFriendTrips, tripsAt, ownersOf } from '../auth/useFriendTrips.js';
import { FaceStack } from '../auth/FriendFaces.jsx';
import { fmtWindow } from '../auth/friendFacts.js';
import { FriendTripPanel } from '../auth/FriendTripPanel.jsx';

/**
 * Friends on a destination page (T466, owner 2026-10-17: friends should show
 * up in the rest of the app, not only on the Friends page).
 *
 * One line under the price: the faces of the friends showing you a trip that
 * stops here, and "Ana has a trip here" (or "Ana and 2 more friends have
 * trips here"). It opens in place into those trips, each one read-only in
 * the same FriendTripPanel the Friends page uses, so the traveller never
 * leaves the place they were reading about.
 *
 * Only trips a friend set to 'My friends' are in the list (list_friend_trips
 * returns nothing else), so this shows nobody a thing they did not choose
 * to show. Signed out, or with no friend trip here, it renders nothing: no
 * empty state, because an empty "your friends" line on a place page is an
 * advert for a feature, not information.
 *
 * Props
 *   destId        the destination id
 *   destinations  the catalogue, for the trip panel's map and stops
 */
export function FriendsWentHere({ destId, destinations }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { trips } = useFriendTrips(user?.id || null);
  const [open, setOpen] = useState(false);
  const [openTrip, setOpenTrip] = useState('');

  const here = tripsAt(trips, destId);
  if (!user || !here.length) return null;
  const owners = ownersOf(here);
  const who = owners[0].name;
  const line = owners.length === 1
    ? t('friends.hereOne', { who })
    : t('friends.hereMany', { who, n: owners.length - 1 });
  const listId = `frn-here-${destId}`;

  return (
    <section className="frn-here" aria-label={t('friends.title')}>
      <Button
        variant="quiet"
        block
        className="frn-here-head"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <FaceStack people={owners} />
        <span className="frn-here-line">{line}</span>
        <ChevronDownIcon size={16} className={`frn-here-chev${open ? ' is-open' : ''}`} />
      </Button>
      {open && (
        <ul className="frn-here-list" id={listId}>
          {here.map((ft) => {
            const showing = openTrip === ft.tripPlanId;
            const when = fmtWindow(ft.startDate, ft.endDate, lang, t('friends.dateJoin'));
            return (
              <li key={ft.tripPlanId} className="frn-trip">
                <Button
                  variant="quiet"
                  block
                  className={`frn-here-trip${showing ? ' on' : ''}`}
                  aria-expanded={showing}
                  onClick={() => setOpenTrip(showing ? '' : ft.tripPlanId)}
                >
                  <b>{ft.label || (ft.cities || []).join(', ')}</b>
                  <span className="frn-here-meta">
                    {t('friends.byWhom', { who: ft.ownerName || `@${ft.ownerHandle}` })}
                    {when && <span className="frn-trip-dates">{when}</span>}
                  </span>
                </Button>
                {showing && <FriendTripPanel planId={ft.tripPlanId} destinations={destinations} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
