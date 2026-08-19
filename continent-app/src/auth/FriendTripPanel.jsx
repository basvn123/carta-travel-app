import React, { useEffect, useState } from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { MapPinIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { TripMemoryView } from './TripMemoryView.jsx';
import { readCrew } from './tripCrew.js';
import { getFriendTrip } from './friends.js';

/**
 * FriendTripPanel, a friend's trip opened under its card.
 *
 * Everything here arrives already whitelisted by get_friend_trip, which calls
 * the same projection a share link goes through. This component filters
 * nothing of its own, deliberately: a second surface deciding what to show
 * could quietly disagree with the one that decides what to send.
 *
 * That projection is also what strips the account behind each crew member, so
 * a friend's trip tells you Sofie was there without telling you Sofie has an
 * account. You learn about the journey, not about their address book.
 *
 * No edit affordance, by not passing TripMemoryView an onEdit. Same mechanism
 * as the shared-link viewer, so the two cannot drift apart.
 */
export function FriendTripPanel({ planId }) {
  const { t } = useI18n();
  const [state, setState] = useState({ loading: true, trip: null });

  useEffect(() => {
    let live = true;
    getFriendTrip(planId)
      .then((trip) => { if (live) setState({ loading: false, trip }); })
      .catch(() => { if (live) setState({ loading: false, trip: null }); });
    return () => { live = false; };
  }, [planId]);

  if (state.loading) {
    return <div className="ftrip"><p className="ftrip-note">{t('share.loading')}</p></div>;
  }
  // Set back to private, or the friendship ended, between the list and the tap.
  if (!state.trip) {
    return <div className="ftrip"><p className="ftrip-note">{t('friends.tripGone')}</p></div>;
  }

  const { stops, payload } = state.trip;
  const extras = payload?.extras || {};
  const memory = extras.memory ? { ...extras.memory, crew: readCrew(extras) } : null;

  const fmt = (iso) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(iso));
    } catch { return iso; }
  };

  return (
    <div className="ftrip">
      {stops.length > 0 && (
        <ol className="stview-stops">
          {stops.map((s) => (
            <li className="stview-stop" key={`${s.position}${s.destination_id || s.city}`}>
              <span className="stview-stop-mark">
                {s.country ? <CountryFlag country={s.country} size={13} /> : <MapPinIcon size={13} />}
              </span>
              <span className="stview-stop-city">{s.city}</span>
              {s.arrive_date && (
                <span className="stview-stop-dates">{fmt(s.arrive_date)} to {fmt(s.depart_date)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
      {memory && <TripMemoryView memory={memory} />}
    </div>
  );
}
