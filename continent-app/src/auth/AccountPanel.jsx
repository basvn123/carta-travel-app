import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { LockIcon, PersonIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

// Account & preferences. Saved trips deliberately do NOT live here, they have
// their own panel (SavedTripsPanel, opened from the nav) so this stays a clean
// account-management surface: who is signed in, password, sign out.
export function AccountPanel({ onClose, onOpenAuth }) {
  const { user, signOut, updatePassword, configured } = useAuth();
  const { t } = useI18n();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwNotice, setPwNotice] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwNotice('');
    if (newPassword.length < 6) { setPwError(t('account.errPasswordShort')); return; }
    if (newPassword !== confirmPassword) { setPwError(t('account.errPasswordMismatch')); return; }
    setPwLoading(true);
    try {
      await updatePassword(newPassword);
      setPwNotice(t('account.passwordUpdated'));
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError(err.message || t('account.errGeneric'));
    } finally {
      setPwLoading(false);
    }
  };

  const fullName = user?.user_metadata?.full_name?.trim();

  return (
    <div className="panel open account-panel">
      <button className="panel-close" onClick={onClose} aria-label={t('account.close')}>x</button>

      <div className="panel-header">
        <div className="panel-tag">{t('account.tag')}</div>
        <h2 className="panel-city account-heading">{user ? (fullName || user.email) : t('account.preferences')}</h2>
        {user && fullName && <div className="account-heading-sub">{user.email}</div>}
      </div>

      {user ? (
        <>
          <div className="panel-section">
            <div className="section-title section-title-iconed"><PersonIcon size={12} /> {t('account.signedInAs')}</div>
            <div className="account-identity">
              <span className="account-identity-avatar">{(fullName || user.email || '?')[0].toUpperCase()}</span>
              <span className="account-identity-text">
                <b>{fullName || user.email}</b>
                {fullName && <small>{user.email}</small>}
              </span>
            </div>
          </div>

          <div className="panel-section">
            <div className="section-title section-title-iconed"><LockIcon size={12} /> {t('account.changePassword')}</div>
            <form className="auth-form auth-form-inline" onSubmit={handlePasswordChange}>
              <label className="auth-field">
                <span className="auth-label">{t('account.newPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('account.newPasswordPlaceholder')}
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">{t('account.confirmNewPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('account.confirmNewPasswordPlaceholder')}
                />
              </label>
              {pwError && <div className="auth-error">{pwError}</div>}
              {pwNotice && <div className="auth-notice auth-notice-inline">{pwNotice}</div>}
              <button type="submit" className="auth-submit" disabled={pwLoading}>
                {pwLoading ? t('account.pleaseWait') : t('account.updatePassword')}
              </button>
            </form>
          </div>

          <div className="panel-section">
            <button className="book-btn secondary account-signout" onClick={signOut}>
              {t('account.signOut')}
            </button>
          </div>
        </>
      ) : configured ? (
        <div className="panel-section">
          <div className="section-title">{t('account.tag')}</div>
          <div className="footnote">{t('account.signInPrompt')}</div>
          <button className="account-signin-btn account-signin-spaced" onClick={onOpenAuth}>{t('account.signIn')}</button>
        </div>
      ) : null}
    </div>
  );
}
