import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { LockIcon, PersonIcon } from '../components/Icons.jsx';

// Account & preferences. Saved trips deliberately do NOT live here - they have
// their own panel (SavedTripsPanel, opened from the nav) so this stays a clean
// account-management surface: who is signed in, password, sign out.
export function AccountPanel({ onClose, onOpenAuth }) {
  const { user, signOut, updatePassword, configured } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwNotice, setPwNotice] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

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

  const fullName = user?.user_metadata?.full_name?.trim();

  return (
    <div className="panel open account-panel">
      <button className="panel-close" onClick={onClose} aria-label="Close">x</button>

      <div className="panel-header">
        <div className="panel-tag">Account</div>
        <h2 className="panel-city account-heading">{user ? (fullName || user.email) : 'Preferences'}</h2>
        {user && fullName && <div className="account-heading-sub">{user.email}</div>}
      </div>

      {user ? (
        <>
          <div className="panel-section">
            <div className="section-title section-title-iconed"><PersonIcon size={12} /> Signed in as</div>
            <div className="account-identity">
              <span className="account-identity-avatar">{(fullName || user.email || '?')[0].toUpperCase()}</span>
              <span className="account-identity-text">
                <b>{fullName || user.email}</b>
                {fullName && <small>{user.email}</small>}
              </span>
            </div>
          </div>

          <div className="panel-section">
            <div className="section-title section-title-iconed"><LockIcon size={12} /> Change password</div>
            <form className="auth-form auth-form-inline" onSubmit={handlePasswordChange}>
              <label className="auth-field">
                <span className="auth-label">New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">Confirm new password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat the new password"
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
          <button className="account-signin-btn account-signin-spaced" onClick={onOpenAuth}>Sign in</button>
        </div>
      ) : null}
    </div>
  );
}
