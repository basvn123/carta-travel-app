import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { MapPinIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { TripMemoryView } from './TripMemoryView.jsx';
import { foreignMemory, foreignTripPoints } from './foreignTrip.js';
import { getFriendTrip } from './friends.js';

// Same code-split chunk as the big map: opening a friend's trip must not
// stall on maplibre, so it streams in behind a quiet placeholder.
const ForeignTripMap = lazy(() => import('../map/TripMap.jsx').then((m) => ({ default: m.TripMap })));

/** The pins, or nothing at all. An itinerary opened before the reader's
 *  catalogue has loaded has names but no coordinates yet, and an empty map
 *  frame is worse than no map: it reads as broken rather than as pending. */
export function ForeignTripPins({ stops, memory, destinations }) {
  const points = useMemo(
    () => foreignTripPoints(stops, memory, destinations),
    [stops, memory, destinations],
  );
  if (points.length === 0) return null;
  return (
    <div className="ftrip-map">
      <Suspense fallback={<div className="saved-map-loading" aria-hidden="true" />}>
        <ForeignTripMap
          stops={points}
          showRoute={points.length > 1}
          scrollZoom={false}
          cooperativeGestures
          zoomControls
          easeToSelected={false}
          padBottom={0}
          fitMaxZoom={7}
          fitPadding={{ top: 26, left: 26, right: 26, bottom: 26 }}
        />
      </Suspense>
    </div>
  );
}

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
 *
 * A trip somebody took is a shape on a map before it is a list of names, so
 * the pins lead and the stops read underneath them. The coordinates come from
 * the reader's own catalogue (see foreignTrip.js), never from the payload, so
 * drawing the map tells them nothing the city names had not already.
 */
export function FriendTripPanel({ planId, destinations }) {
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
  const memory = foreignMemory(payload);

  const fmt = (iso) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(iso));
    } catch { return iso; }
  };

  return (
    <div className="ftrip">
      <ForeignTripPins stops={stops} memory={memory} destinations={destinations} />
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
