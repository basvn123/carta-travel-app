import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';

// Standalone Saved trips panel, opened from the bottom nav (the same list also
// lives inside AccountPanel; this gives it a one-tap home of its own).
export function SavedTripsPanel({ onClose, onLoadTrip, onOpenAuth }) {
  const { user, configured } = useAuth();

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(!!user);
  const [error, setError] = useState('');

  const loadTrips = () => {
    setLoading(true);
    setError('');
    fetchSavedTrips(user.id)
      .then(setTrips)
      .catch((e) => setError(e.message || 'Could not load saved trips.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadTrips();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTrip(id);
    } catch {
      loadTrips(); // roll back the optimistic removal on failure
    }
  };

  const fmtDate = (s) => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  return (
    <div className="panel open account-panel">
      <button className="panel-close" onClick={onClose} aria-label="Close">x</button>

      <div className="panel-header">
        <div className="panel-tag">Your shortlist</div>
        <h2 className="panel-city account-heading">Saved trips</h2>
      </div>

      {user ? (
        <div className="panel-section">
          {loading && <div className="footnote">Loading…</div>}
          {error && <div className="auth-error">{error}</div>}
          {!loading && !error && trips.length === 0 && (
            <div className="footnote">
              No saved trips yet. Open a destination and use "Save trip" to keep it here.
            </div>
          )}
          {!loading && trips.length > 0 && (
            <div className="saved-trip-list">
              {trips.map((t) => (
                <div className="saved-trip-item" key={t.id}>
                  <button
                    className="saved-trip-main"
                    onClick={() => onLoadTrip(t)}
                    title="Open this trip"
                  >
                    <span className="saved-trip-city">{t.city}</span>
                    <span className="saved-trip-meta">
                      {t.country}{t.depart_date && `, ${fmtDate(t.depart_date)} - ${fmtDate(t.return_date)}`}
                    </span>
                  </button>
                  <button
                    className="saved-trip-delete"
                    onClick={() => handleDelete(t.id)}
                    aria-label={`Remove ${t.city}`}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : configured ? (
        <div className="panel-section">
          <div className="footnote">Sign in to save trips and find them back here on any device.</div>
          <button className="account-signin-btn" onClick={onOpenAuth}>Sign in</button>
        </div>
      ) : (
        <div className="panel-section">
          <div className="footnote">Accounts aren't set up for this deployment, so trips can't be saved yet.</div>
        </div>
      )}
    </div>
  );
}
