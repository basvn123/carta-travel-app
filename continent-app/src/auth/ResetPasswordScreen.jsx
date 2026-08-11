import React, { useState } from 'react';
import Logo from '../components/Logo.jsx';
import { useAuth } from './AuthContext.jsx';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordStrength.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * Full-screen takeover shown when the app loads from a password-recovery
 * email link (AuthContext.recoveryMode). Replaces the normal app until the
 * user sets a new password or bails out.
 */
export function ResetPasswordScreen() {
  const { updatePassword, exitRecoveryMode } = useAuth();
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // One floor for the whole app. This screen is where the account panel's
    // "forgot your password" link lands, so a shorter minimum here would just
    // be a way around the one there.
    if (password.length < MIN_PASSWORD_LENGTH) { setError(t('auth.errPasswordShort', { n: MIN_PASSWORD_LENGTH })); return; }
    if (password !== confirmPassword) { setError(t('auth.errPasswordMismatch')); return; }

    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err.message || t('auth.errGeneric'));
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
            <h2 className="auth-title">{t('auth.passwordUpdatedTitle')}</h2>
            <p className="auth-sub">{t('auth.passwordUpdatedSub')}</p>
            <button className="auth-submit" onClick={exitRecoveryMode}>{t('auth.continue')}</button>
          </>
        ) : (
          <>
            <h2 className="auth-title">{t('auth.setNewPasswordTitle')}</h2>
            <p className="auth-sub">{t('auth.setNewPasswordSub')}</p>
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-field">
                <span className="auth-label">{t('auth.newPassword')}</span>
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
                <span className="auth-label">{t('auth.confirmNewPassword')}</span>
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
                {loading ? t('auth.pleaseWait') : t('auth.updatePassword')}
              </button>
              <button type="button" className="auth-link auth-back" onClick={exitRecoveryMode}>
                {t('auth.cancel')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
