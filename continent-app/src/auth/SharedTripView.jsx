import React, { useEffect, useState } from 'react';
import Logo from '../components/Logo.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { MapPinIcon, CalendarIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { TripMemoryView } from './TripMemoryView.jsx';
import { readCrew } from './tripCrew.js';
import { fetchSharedTrip } from './tripShares.js';

/**
 * SharedTripView, somebody else's trip, opened from a link.
 *
 * A takeover rather than a tab, for one reason: this is not the reader's trip
 * and never becomes it. There is no edit control anywhere on this screen, and
 * there is nothing to gate, because the whole point of a share is that it
 * opens without an account.
 *
 * Everything shown arrives already whitelisted by get_shared_trip (migration
 * 009), so this component does no filtering of its own. That is deliberate: if
 * the decision about what leaves an account lived partly here, a second
 * surface rendering the same payload could quietly disagree with it.
 *
 * The memory is rendered by the same TripMemoryView the owner sees, whose edit
 * button is already conditional on an onEdit handler. Not passing one is what
 * makes this read only, and it means the two views can never drift apart.
 */
export function SharedTripView({ token, onDismiss }) {
  const { t } = useI18n();
  const [state, setState] = useState({ loading: true, trip: null });

  useEffect(() => {
    let live = true;
    fetchSharedTrip(token)
      .then((trip) => { if (live) setState({ loading: false, trip }); })
      // An unknown, revoked or expired token and a network failure land in the
      // same place on purpose. Distinguishing them would tell a visitor
      // something about the owner that the owner did not agree to.
      .catch(() => { if (live) setState({ loading: false, trip: null }); });
    return () => { live = false; };
  }, [token]);

  const trip = state.trip;
  const stops = trip?.stops || [];
  const extras = trip?.payload?.extras || {};
  // The crew arrives as extras.people, names only, exactly as loadMemory
  // hydrates it for the owner's own copy.
  const memory = extras.memory
    ? { ...extras.memory, crew: readCrew(extras) }
    : null;

  const fmt = (iso) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(iso));
    } catch { return iso; }
  };
  const first = stops[0]?.arrive_date;
  const last = stops[stops.length - 1]?.depart_date;

  return (
    <div className="auth-overlay auth-overlay-solid stview-overlay">
      <div className="stview">
        <div className="stview-brand">
          <Logo size={26} />
          <span className="stview-brand-name">Carta</span>
        </div>

        {state.loading ? (
          <p className="stview-loading">{t('share.loading')}</p>
        ) : !trip ? (
          <div className="stview-gone">
            <h2 className="stview-title">{t('share.gone')}</h2>
            <p className="stview-sub">{t('share.goneSub')}</p>
            <button type="button" className="auth-submit" onClick={onDismiss}>
              {t('share.exploreCta')}
            </button>
          </div>
        ) : (
          <>
            <span className="stview-kicker">{t('share.viewTitle')}</span>
            <h2 className="stview-title">
              {trip.label || stops.map((s) => s.city).filter(Boolean).join(', ')}
            </h2>
            {first && (
              <p className="stview-dates">
                <CalendarIcon size={13} />
                <span>{fmt(first)} to {fmt(last)}</span>
              </p>
            )}

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

            <div className="stview-foot">
              <span className="stview-from">{t('share.viewBy')}</span>
              <button type="button" className="auth-submit" onClick={onDismiss}>
                {t('share.exploreCta')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
