import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { LockIcon, PersonIcon, SparkIcon } from '../components/Icons.jsx';
import { PrivacyPolicy } from '../components/PrivacyPolicy.jsx';
import { PassModal } from '../components/PassModal.jsx';
import { useEntitlement } from '../hooks/useEntitlement.js';
import { TIERS, daysLeft, canUpgrade } from '../lib/pricing.js';
import { useI18n } from '../i18n/index.jsx';

// Account & preferences. Saved trips deliberately do NOT live here, they have
// their own panel (SavedTripsPanel, opened from the nav) so this stays a clean
// account-management surface: who is signed in, password, privacy, sign out,
// and (App Store guideline 5.1.1(v)) deleting the account entirely.
export function AccountPanel({ onClose, onOpenAuth }) {
  const { user, signOut, updatePassword, deleteAccount, configured } = useAuth();
  const { t } = useI18n();
  const entitlement = useEntitlement();
  const [passOpen, setPassOpen] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwNotice, setPwNotice] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    setDeleteError('');
    setDeleteBusy(true);
    try {
      await deleteAccount();
      onClose();
    } catch (err) {
      // Most likely the delete_user() RPC isn't installed yet; keep the user
      // informed rather than failing silently on a compliance-critical path.
      setDeleteError(err.message || t('account.errGeneric'));
      setDeleteBusy(false);
    }
  };

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

          {/* What they hold today. A pass is a finite thing that runs out, so
              this states the expiry rather than a status word: "Trip Pass"
              alone tells somebody nothing about whether it still works. */}
          <div className="panel-section">
            <div className="section-title section-title-iconed"><SparkIcon size={12} /> {t('pass.sectionTitle')}</div>
            <div className="account-pass">
              <b>{t(TIERS[entitlement.tier]?.labelKey || TIERS.free.labelKey)}</b>
              {entitlement.known && (
                <small>
                  {entitlement.tier === 'free'
                    ? t('pass.statusFree', { left: entitlement.plansLeft, cap: entitlement.plansCap })
                    : t('pass.statusPaid', {
                      days: daysLeft(entitlement.expiresAt) ?? 0,
                      left: entitlement.plansLeft,
                    })}
                </small>
              )}
            </div>
            {canUpgrade(entitlement.tier) && (
              <button className="account-signin-btn account-signin-spaced" onClick={() => setPassOpen(true)}>
                {t(entitlement.tier === 'free' ? 'pass.seePasses' : 'pass.extend')}
              </button>
            )}
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

          <div className="panel-section">
            <div className="section-title">{t('account.deleteTitle')}</div>
            {!deleteArmed ? (
              <>
                <div className="footnote">{t('account.deleteHint')}</div>
                <button className="auth-link account-delete-link" onClick={() => setDeleteArmed(true)}>
                  {t('account.deleteBtn')}
                </button>
              </>
            ) : (
              <>
                <div className="footnote">{t('account.deleteConfirmHint')}</div>
                {deleteError && <div className="auth-error">{deleteError}</div>}
                <div className="account-delete-actions">
                  <button className="book-btn secondary" onClick={() => { setDeleteArmed(false); setDeleteError(''); }}>
                    {t('account.deleteKeep')}
                  </button>
                  <button className="book-btn account-delete-btn" onClick={handleDeleteAccount} disabled={deleteBusy}>
                    {deleteBusy ? t('account.pleaseWait') : t('account.deleteForever')}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : configured ? (
        <div className="panel-section">
          <div className="section-title">{t('account.tag')}</div>
          <div className="footnote">{t('account.signInPrompt')}</div>
          <button className="account-signin-btn account-signin-spaced" onClick={onOpenAuth}>{t('account.signIn')}</button>
        </div>
      ) : null}

      <div className="panel-section">
        <button className="auth-link" onClick={() => setPrivacyOpen(true)}>
          {t('account.privacyPolicy')}
        </button>
      </div>
      {privacyOpen && <PrivacyPolicy onClose={() => setPrivacyOpen(false)} />}
      {passOpen && (
        <PassModal
          entitlement={entitlement}
          reason="browse"
          signedIn={!!user}
          onClose={() => { setPassOpen(false); entitlement.refresh(); }}
          onSignIn={() => { setPassOpen(false); onOpenAuth?.(); }}
        />
      )}
    </div>
  );
}
