import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';

export function AccountPanel({ onClose, onLoadTrip, onOpenLifestyle, onOpenAuth }) {
  const { user, signOut, updatePassword, configured } = useAuth();

  const [trips, setTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(!!user);
  const [tripsError, setTripsError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwNotice, setPwNotice] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const loadTrips = () => {
    setTripsLoading(true);
    fetchSavedTrips(user.id)
      .then(setTrips)
      .catch((e) => setTripsError(e.message || 'Could not load saved trips.'))
      .finally(() => setTripsLoading(false));
  };

  useEffect(() => {
    if (!user) { setTripsLoading(false); return; }
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

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwNotice('');
    if (newPassword.length < 6) { setPwError('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwError("Passwords don't match."); return; }
    setPwLoading(true);
    try {
      await updatePassword(newPassword);
      setPwNotice('Password updated.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError(err.message || 'Something went wrong. Try again.');
    } finally {
      setPwLoading(false);
    }
  };

  const fmtDate = (s) => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  const fullName = user?.user_metadata?.full_name?.trim();

  return (
    <div className="panel open account-panel">
      <button className="panel-close" onClick={onClose} aria-label="Close">x</button>

      <div className="panel-header">
        <div className="panel-tag">Account</div>
        <h2 className="panel-city account-heading">{user ? (fullName || user.email) : 'Preferences'}</h2>
        {user && fullName && <div className="account-heading-sub">{user.email}</div>}
      </div>

      <div className="panel-section">
        <div className="section-title">Lifestyle</div>
        <button className="more-btn account-lifestyle-btn" onClick={onOpenLifestyle}>
          <span>Eating &amp; drinking</span>
          <span className="chev">›</span>
        </button>
        <div className="footnote">Dinners, drinks, coffees and self-catered days, priced at real local rates.</div>
      </div>

      {user ? (
        <>
          <div className="panel-section">
            <div className="section-title">Saved trips</div>
            {tripsLoading && <div className="footnote">Loading…</div>}
            {tripsError && <div className="auth-error">{tripsError}</div>}
            {!tripsLoading && !tripsError && trips.length === 0 && (
              <div className="footnote">
                No saved trips yet. Open a destination and use "Save trip" to keep it here.
              </div>
            )}
            {!tripsLoading && trips.length > 0 && (
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
                        {t.country}{t.depart_date && ` — ${fmtDate(t.depart_date)} - ${fmtDate(t.return_date)}`}
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

          <div className="panel-section">
            <div className="section-title">Change password</div>
            <form className="auth-form auth-form-inline" onSubmit={handlePasswordChange}>
              <label className="auth-field">
                <span className="auth-label">New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">Confirm new password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
              {pwError && <div className="auth-error">{pwError}</div>}
              {pwNotice && <div className="auth-notice auth-notice-inline">{pwNotice}</div>}
              <button type="submit" className="auth-submit" disabled={pwLoading}>
                {pwLoading ? 'Please wait…' : 'Update password'}
              </button>
            </form>
          </div>

          <div className="panel-section">
            <button className="book-btn secondary account-signout" onClick={signOut}>
              Sign out
            </button>
          </div>
        </>
      ) : configured ? (
        <div className="panel-section">
          <div className="section-title">Account</div>
          <div className="footnote">Sign in to save trips and sync your settings across devices.</div>
          <button className="account-signin-btn" onClick={onOpenAuth}>Sign in</button>
        </div>
      ) : null}
    </div>
  );
}
