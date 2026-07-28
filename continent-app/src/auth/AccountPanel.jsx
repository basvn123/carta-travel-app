import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import {
  CheckIcon, EyeIcon, EyeOffIcon, LockIcon, PersonIcon,
  ShieldIcon, SignOutIcon, SparkIcon, TrashIcon,
} from '../components/Icons.jsx';
import { PrivacyPolicy } from '../components/PrivacyPolicy.jsx';
import { PassModal } from '../components/PassModal.jsx';
import { useEntitlement } from '../hooks/useEntitlement.js';
import { TIERS, daysLeft, canUpgrade, formatPrice } from '../lib/pricing.js';
import { MIN_PASSWORD_LENGTH, passwordStrength } from '../lib/passwordStrength.js';
import { useI18n } from '../i18n/index.jsx';

// Account & preferences. Saved trips deliberately do NOT live here, they have
// their own panel (SavedTripsPanel, opened from the nav) so this stays a clean
// account-management surface.
//
// The panel reads top to bottom as who you are, what you hold, how you get in,
// how you leave, and how you erase yourself. Each of those is a section with
// its own heading, because a settings screen that is one undifferentiated
// scroll makes somebody read everything to find one thing. The order is also a
// safety order: the destructive action is last, behind its own confirmation,
// as far from "Sign out" as the panel allows.
//
// Two rules worth keeping if this file is edited again:
//   - Anything that could lock the real owner out (changing the password,
//     deleting the account) verifies the current password first. Holding a
//     session is not proof of identity, an unlocked phone is enough for that.
//   - Accounts created with Google have no password. Every password control
//     here is behind `hasPassword` and offers the email route instead.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Password input with a reveal toggle. Typing a long passphrase blind on a
 *  phone is how people end up locked out of accounts they still own. */
function PasswordField({ id, label, value, onChange, autoComplete, placeholder }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="auth-field">
      <label className="auth-label" htmlFor={id}>{label}</label>
      <div className="pw-input-wrap">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="pw-reveal"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={t(shown ? 'account.hidePassword' : 'account.showPassword')}
        >
          {shown ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </button>
      </div>
    </div>
  );
}

/** Entropy meter plus the two things that actually block submission. Both are
 *  live, so nobody presses the button to find out what the rules were. */
function PasswordMeter({ password, confirm }) {
  const { t } = useI18n();
  const strength = useMemo(() => passwordStrength(password), [password]);
  if (!password) return null;
  const reqs = [
    { key: 'len', met: password.length >= MIN_PASSWORD_LENGTH, label: t('account.reqLength', { n: MIN_PASSWORD_LENGTH }) },
    { key: 'match', met: !!confirm && password === confirm, label: t('account.reqMatch') },
  ];
  return (
    <div className="pw-gauge">
      <div className={`pw-strength ${strength.level}`}>
        <div className="pw-strength-track" aria-hidden="true">
          {[1, 2, 3].map((seg) => (
            <span key={seg} className={`pw-strength-seg${strength.score >= seg ? ' on' : ''}`} />
          ))}
        </div>
        <span className="pw-strength-label">
          {t(`account.strength.${strength.level}`)}
          <b>{t('account.strengthBits', { n: strength.bits })}</b>
        </span>
      </div>
      <ul className="pw-reqs">
        {reqs.map((r) => (
          <li key={r.key} className={`pw-req${r.met ? ' met' : ''}`}>
            {r.met ? <CheckIcon size={13} /> : <span className="pw-req-dot" />}
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AccountPanel({ onClose, onOpenAuth }) {
  const {
    user, hasPassword, signOut, updatePassword, reauthenticate,
    updateProfile, sendPasswordReset, deleteAccount, configured,
  } = useAuth();
  const { t, lang } = useI18n();
  const entitlement = useEntitlement();
  const [passOpen, setPassOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const storedName = user?.user_metadata?.full_name?.trim() || '';
  const storedEmail = user?.email || '';

  const [name, setName] = useState(storedName);
  const [email, setEmail] = useState(storedEmail);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwNotice, setPwNotice] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Re-seed the form when the account itself changes (sign out and back in as
  // somebody else). Keyed on the values rather than the user object, so an
  // ordinary token refresh does not wipe what is half typed.
  useEffect(() => {
    setName(storedName);
    setEmail(storedEmail);
    setProfileError('');
    setProfileNotice('');
  }, [storedName, storedEmail]);

  const emailChanged = email.trim().toLowerCase() !== storedEmail.toLowerCase();
  const profileDirty = name.trim() !== storedName || emailChanged;

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileNotice('');
    const nextName = name.trim();
    const nextEmail = email.trim();
    if (!nextName) { setProfileError(t('account.errNameEmpty')); return; }
    if (!EMAIL_RE.test(nextEmail)) { setProfileError(t('account.errEmailInvalid')); return; }
    setProfileBusy(true);
    try {
      const { emailPending } = await updateProfile({
        fullName: nextName !== storedName ? nextName : undefined,
        email: emailChanged ? nextEmail : undefined,
      });
      setProfileNotice(emailPending
        ? t('account.emailPending', { email: nextEmail })
        : t('account.profileSaved'));
    } catch (err) {
      setProfileError(err.message || t('account.errGeneric'));
    } finally {
      setProfileBusy(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwNotice('');
    if (hasPassword && !currentPassword) { setPwError(t('account.errCurrentPasswordMissing')); return; }
    if (newPassword.length < MIN_PASSWORD_LENGTH) { setPwError(t('account.errPasswordShort', { n: MIN_PASSWORD_LENGTH })); return; }
    if (newPassword !== confirmPassword) { setPwError(t('account.errPasswordMismatch')); return; }
    if (hasPassword && newPassword === currentPassword) { setPwError(t('account.errPasswordSame')); return; }
    setPwLoading(true);
    try {
      // Prove ownership before changing the credential, so a borrowed session
      // cannot lock the real owner out of their own trips.
      if (hasPassword) {
        try {
          await reauthenticate(currentPassword);
        } catch {
          setPwError(t('account.errCurrentPassword'));
          setPwLoading(false);
          return;
        }
      }
      await updatePassword(newPassword);
      setPwNotice(t('account.passwordUpdated'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError(err.message || t('account.errGeneric'));
    } finally {
      setPwLoading(false);
    }
  };

  // Same link the sign-in screen sends, aimed at the address already on file:
  // the way out for somebody who cannot supply the current password, and the
  // way in for a Google-only account that wants a password of its own.
  const handleSendReset = async () => {
    setPwError('');
    setPwNotice('');
    setPwLoading(true);
    try {
      await sendPasswordReset(storedEmail);
      setPwNotice(t('account.resetSent', { email: storedEmail }));
    } catch (err) {
      setPwError(err.message || t('account.errGeneric'));
    } finally {
      setPwLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    if (hasPassword && !deletePassword) { setDeleteError(t('account.errCurrentPasswordMissing')); return; }
    // A Google-only account has no password to check, so the friction is
    // typing the address instead. Not proof of identity the way re-auth is,
    // but it is deliberate enough that nobody deletes a trip archive by
    // pressing a button twice.
    if (!hasPassword && deleteEmail.trim().toLowerCase() !== storedEmail.toLowerCase()) {
      setDeleteError(t('account.errDeleteEmail'));
      return;
    }
    setDeleteBusy(true);
    try {
      if (hasPassword) {
        try {
          await reauthenticate(deletePassword);
        } catch {
          setDeleteError(t('account.errCurrentPassword'));
          setDeleteBusy(false);
          return;
        }
      }
      await deleteAccount();
      onClose();
    } catch (err) {
      // Most likely the delete_user() RPC isn't installed yet; keep the user
      // informed rather than failing silently on a compliance-critical path.
      setDeleteError(err.message || t('account.errGeneric'));
      setDeleteBusy(false);
    }
  };

  const disarmDelete = () => {
    setDeleteArmed(false);
    setDeletePassword('');
    setDeleteEmail('');
    setDeleteError('');
  };

  const tier = TIERS[entitlement.tier] || TIERS.free;
  const upgrade = TIERS.trip;
  const locale = { en: 'en-GB', nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT' }[lang] || 'en-GB';

  return (
    <div className="panel open account-panel">
      {/* The close button lives INSIDE the sticky header. As a child of the
          scrolling panel it was positioned against the content box, so it slid
          out of sight the moment anybody scrolled and the panel had no visible
          way out at the bottom, which is where the delete section is. */}
      <div className="panel-header">
        <button className="panel-close" onClick={onClose} aria-label={t('account.close')}>x</button>
        <div className="panel-tag">{t('account.tag')}</div>
        <h2 className="panel-city account-heading">
          {user ? (storedName || storedEmail) : t('account.preferences')}
        </h2>
      </div>

      {user ? (
        <>
          {/* Who you are, and the only place in the panel that says it. The
              old layout printed the name and email twice, once in the header
              and again in a "Signed in as" card, and neither copy could be
              edited. */}
          <div className="panel-section">
            <div className="section-title section-title-iconed"><PersonIcon size={12} /> {t('account.profileTitle')}</div>
            <form className="auth-form auth-form-inline" onSubmit={handleProfileSave}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="acct-name">{t('account.name')}</label>
                <input
                  id="acct-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="acct-email">{t('account.email')}</label>
                <input
                  id="acct-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {emailChanged && <div className="auth-hint">{t('account.emailChangeHint')}</div>}
              </div>
              {profileError && <div className="auth-error">{profileError}</div>}
              {profileNotice && <div className="auth-notice auth-notice-inline">{profileNotice}</div>}
              <button type="submit" className="auth-submit auth-submit-quiet" disabled={!profileDirty || profileBusy}>
                {profileBusy ? t('account.pleaseWait') : t('account.saveProfile')}
              </button>
            </form>
          </div>

          {/* What they hold today. A pass is a finite thing that runs out, so
              this states the expiry rather than a status word: "Trip Pass"
              alone tells somebody nothing about whether it still works. Below
              it, what the next pass would add, in the same plain numbers the
              pricing table uses. */}
          <div className="panel-section">
            <div className="section-title section-title-iconed"><SparkIcon size={12} /> {t('pass.sectionTitle')}</div>
            <div className="account-pass-card">
              <div className="account-pass-head">
                <b className="account-pass-tier">{t(tier.labelKey)}</b>
                {entitlement.known && (
                  <span className="account-pass-status">
                    {entitlement.tier === 'free'
                      ? t('pass.statusFree', { left: entitlement.plansLeft, cap: entitlement.plansCap })
                      : t('pass.statusPaid', {
                        days: daysLeft(entitlement.expiresAt) ?? 0,
                        left: entitlement.plansLeft,
                      })}
                  </span>
                )}
              </div>

              {canUpgrade(entitlement.tier) && (
                <div className="account-pass-upsell">
                  <div className="account-pass-upsell-title">
                    {t('account.passAdds', { name: t(upgrade.labelKey) })}
                  </div>
                  <ul className="account-pass-feats">
                    <li className="account-pass-feat">
                      <CheckIcon size={13} />{t('pass.featPlansPaid', { n: upgrade.aiPlans })}
                    </li>
                    <li className="account-pass-feat">
                      <CheckIcon size={13} />{t('pass.featSearchOn', { n: upgrade.grounded })}
                    </li>
                    <li className="account-pass-feat">
                      <CheckIcon size={13} />{t('pass.featOneOff')}
                    </li>
                  </ul>
                  <div className="account-pass-price">
                    {formatPrice(upgrade.priceCents, locale)} <span>{t('pass.perTrip')}</span>
                  </div>
                  <button className="auth-submit account-pass-cta" onClick={() => setPassOpen(true)}>
                    {t(entitlement.tier === 'free' ? 'pass.seePasses' : 'pass.extend')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="panel-section">
            <div className="section-title section-title-iconed">
              <LockIcon size={12} /> {t(hasPassword ? 'account.changePassword' : 'account.passwordTitle')}
            </div>
            {hasPassword ? (
              <form className="auth-form auth-form-inline" onSubmit={handlePasswordChange}>
                <PasswordField
                  id="acct-current-pw"
                  label={t('account.currentPassword')}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                  placeholder={t('account.currentPasswordPlaceholder')}
                />
                <button type="button" className="auth-link auth-forgot-inline" onClick={handleSendReset} disabled={pwLoading}>
                  {t('account.forgotPassword')}
                </button>
                <PasswordField
                  id="acct-new-pw"
                  label={t('account.newPassword')}
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  placeholder={t('account.newPasswordPlaceholder', { n: MIN_PASSWORD_LENGTH })}
                />
                <PasswordMeter password={newPassword} confirm={confirmPassword} />
                <PasswordField
                  id="acct-confirm-pw"
                  label={t('account.confirmNewPassword')}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  placeholder={t('account.confirmNewPasswordPlaceholder')}
                />
                {pwError && <div className="auth-error">{pwError}</div>}
                {pwNotice && <div className="auth-notice auth-notice-inline">{pwNotice}</div>}
                <button type="submit" className="auth-submit" disabled={pwLoading}>
                  {pwLoading ? t('account.pleaseWait') : t('account.updatePassword')}
                </button>
              </form>
            ) : (
              <>
                <p className="account-section-hint">{t('account.noPasswordHint')}</p>
                {pwError && <div className="auth-error">{pwError}</div>}
                {pwNotice && <div className="auth-notice auth-notice-inline">{pwNotice}</div>}
                <button className="book-btn secondary account-wide-btn" onClick={handleSendReset} disabled={pwLoading}>
                  {pwLoading ? t('account.pleaseWait') : t('account.sendSetPassword')}
                </button>
              </>
            )}
          </div>

          {/* Sign out lives in its own section rather than pressed between the
              password form and the delete link, where a mis-tap on a moving
              train hit one of the two things nobody meant to press. */}
          <div className="panel-section">
            <div className="section-title section-title-iconed"><SignOutIcon size={12} /> {t('account.sessionTitle')}</div>
            <p className="account-section-hint">{t('account.sessionHint')}</p>
            <button className="book-btn secondary account-signout account-wide-btn" onClick={signOut}>
              {t('account.signOut')}
            </button>
          </div>
        </>
      ) : configured ? (
        <div className="panel-section">
          <div className="section-title section-title-iconed"><PersonIcon size={12} /> {t('account.tag')}</div>
          <p className="account-section-hint">{t('account.signInPrompt')}</p>
          <button className="auth-submit account-wide-btn" onClick={onOpenAuth}>{t('account.signIn')}</button>
        </div>
      ) : null}

      <div className="panel-section">
        <div className="section-title section-title-iconed"><ShieldIcon size={12} /> {t('account.privacyTitle')}</div>
        <button className="auth-link account-privacy-link" onClick={() => setPrivacyOpen(true)}>
          {t('account.privacyPolicy')}
        </button>
      </div>

      {user && (
        <div className="panel-section">
          <div className="section-title section-title-iconed account-danger-title"><TrashIcon size={12} /> {t('account.deleteTitle')}</div>
          <div className="account-danger">
            {!deleteArmed ? (
              <>
                <p className="account-danger-text">{t('account.deleteHint')}</p>
                <button className="book-btn account-delete-arm account-wide-btn" onClick={() => setDeleteArmed(true)}>
                  {t('account.deleteBtn')}
                </button>
              </>
            ) : (
              <>
                <p className="account-danger-text">{t('account.deleteConfirmHint')}</p>
                {hasPassword ? (
                  <PasswordField
                    id="acct-delete-pw"
                    label={t('account.deleteConfirmPassword')}
                    value={deletePassword}
                    onChange={setDeletePassword}
                    autoComplete="current-password"
                    placeholder={t('account.currentPasswordPlaceholder')}
                  />
                ) : (
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="acct-delete-email">
                      {t('account.deleteConfirmEmail', { email: storedEmail })}
                    </label>
                    <input
                      id="acct-delete-email"
                      type="text"
                      autoComplete="off"
                      value={deleteEmail}
                      onChange={(e) => setDeleteEmail(e.target.value)}
                    />
                  </div>
                )}
                {deleteError && <div className="auth-error">{deleteError}</div>}
                <div className="account-delete-actions">
                  <button className="book-btn secondary" onClick={disarmDelete}>
                    {t('account.deleteKeep')}
                  </button>
                  <button className="book-btn account-delete-btn" onClick={handleDeleteAccount} disabled={deleteBusy}>
                    {deleteBusy ? t('account.pleaseWait') : t('account.deleteForever')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
