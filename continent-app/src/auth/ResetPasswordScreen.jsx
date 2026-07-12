import React, { useState } from 'react';
import Logo from '../components/Logo.jsx';
import { useAuth } from './AuthContext.jsx';

/**
 * Full-screen takeover shown when the app loads from a password-recovery
 * email link (AuthContext.recoveryMode). Replaces the normal app until the
 * user sets a new password or bails out.
 */
export function ResetPasswordScreen() {
  const { updatePassword, exitRecoveryMode } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }

    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay auth-overlay-solid">
      <div className="auth-modal">
        <div className="auth-brand">
          <Logo size={26} />
          <span className="auth-brand-name">Carta</span>
        </div>

        {done ? (
          <>
            <h2 className="auth-title">Password updated</h2>
            <p className="auth-sub">You're all set - continue into the app.</p>
            <button className="auth-submit" onClick={exitRecoveryMode}>Continue</button>
          </>
        ) : (
          <>
            <h2 className="auth-title">Set a new password</h2>
            <p className="auth-sub">Choose a new password for your account.</p>
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-field">
                <span className="auth-label">New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
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
              {error && <div className="auth-error">{error}</div>}
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Please wait…' : 'Update password'}
              </button>
              <button type="button" className="auth-link auth-back" onClick={exitRecoveryMode}>
                Cancel
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
