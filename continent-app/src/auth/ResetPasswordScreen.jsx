import React, { useState } from 'react';
import Logo from '../components/Logo.jsx';
import { useAuth } from './AuthContext.jsx';
import { authErrorText } from './authErrors.js';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordStrength.js';
import { useI18n } from '../i18n/index.jsx';
import { PasswordField } from './PasswordField.jsx';

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
      setError(authErrorText(err, t, 'auth.errGeneric'));
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
            <h1 className="auth-title">{t('auth.passwordUpdatedTitle')}</h1>
            <p className="auth-sub">{t('auth.passwordUpdatedSub')}</p>
            <button className="auth-submit" onClick={exitRecoveryMode}>{t('auth.continue')}</button>
          </>
        ) : (
          <>
            <h1 className="auth-title">{t('auth.setNewPasswordTitle')}</h1>
            <p className="auth-sub">{t('auth.setNewPasswordSub')}</p>
            {/* The account's password field (T390, brief V3-11): reveal
                toggle, no eight-dot placeholder that reads as filled in. */}
            <form className="auth-form" onSubmit={handleSubmit}>
              <PasswordField
                id="reset-password"
                label={t('auth.newPassword')}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <PasswordField
                id="reset-password-confirm"
                label={t('auth.confirmNewPassword')}
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
              {error && <div className="auth-error" role="alert">{error}</div>}
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
