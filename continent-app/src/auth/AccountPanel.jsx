import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import {
  ArrowLeftIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, EyeIcon,
  EyeOffIcon, FeedbackIcon, InfoIcon, LockIcon, PersonIcon, QuestionIcon,
  ShareIcon, ShieldIcon, SignOutIcon, SparkIcon, TrashIcon,
} from '../components/Icons.jsx';
import { PrivacyPolicy } from '../components/PrivacyPolicy.jsx';
import { ATTRIBUTIONS } from '../data/attribution.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { PassModal } from '../components/PassModal.jsx';
import { useEntitlement } from '../hooks/useEntitlement.js';
import { TIERS, daysLeft, canUpgrade, formatPrice } from '../lib/pricing.js';
import { MIN_PASSWORD_LENGTH, passwordStrength } from '../lib/passwordStrength.js';
import { useI18n } from '../i18n/index.jsx';

// Account hub. The panel is a hub with four spokes rather than one long
// scroll: the hub answers "who am I, what do I hold, where do I get help",
// and everything longer than a row (profile, FAQ, feedback, data sources) is
// a subview behind its own back button. A settings screen earns that structure the
// moment it holds both a password form and a feedback box, because the person
// who came to report a bug should never scroll past "Delete account" to do it.
//
// Saved trips deliberately do NOT live here, they have their own panel
// (SavedTripsPanel, opened from the nav) so this stays a clean
// account-management surface.
//
// Two rules worth keeping if this file is edited again:
//   - Anything that could lock the real owner out (changing the password,
//     deleting the account) verifies the current password first. Holding a
//     session is not proof of identity, an unlocked phone is enough for that.
//   - Accounts created with Google have no password. Every password control
//     here is behind `hasPassword` and offers the email route instead.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Same address the privacy policy names as the controller contact.
const CONTACT = 'bas.vannieuwenhuyse123@gmail.com';
const SHARE_URL = 'https://carta-europetravel.com';

// The five general answers, then the four questions that only make sense once
// you have an account. This is the only FAQ surface in the app.
const FAQ_KEYS = [
  ['account.faq1Q', 'account.faq1A'],
  ['account.faq2Q', 'account.faq2A'],
  ['account.faq3Q', 'account.faq3A'],
  ['account.faq4Q', 'account.faq4A'],
  ['account.faq5Q', 'account.faq5A'],
  ['account.faq6Q', 'account.faq6A'],
  ['account.faq7Q', 'account.faq7A'],
  ['account.faq8Q', 'account.faq8A'],
  ['account.faq9Q', 'account.faq9A'],
];

/** Initials for the avatar disc. Two letters from a name, one from an email,
 *  because a coloured circle with nothing in it reads as a broken image. */
function monogram(name, email) {
  const trimmed = (name || '').trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    const first = parts[0][0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }
  return (email || '?').trim().charAt(0).toUpperCase();
}

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

/** One row of the hub menu: icon, label, chevron. A real button, 52px tall. */
function MenuRow({ icon, label, onClick }) {
  return (
    <button type="button" className="account-menu-row" onClick={onClick}>
      <span className="account-menu-icon">{icon}</span>
      <span className="account-menu-label">{label}</span>
      <ChevronRightIcon size={16} className="account-menu-chev" />
    </button>
  );
}

export function AccountPanel({ onClose, onOpenAuth }) {
  const {
    user, hasPassword, signOut, updatePassword, reauthenticate,
    updateProfile, sendPasswordReset, deleteAccount, configured,
  } = useAuth();
  const { t, lang, setLang, languages } = useI18n();
  const entitlement = useEntitlement();
  const panelRef = useRef(null);
  const [view, setView] = useState('home'); // 'home' | 'profile' | 'faq' | 'feedback' | 'data'
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

  const [openFaq, setOpenFaq] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  // Re-seed the form when the account itself changes (sign out and back in as
  // somebody else). Keyed on the values rather than the user object, so an
  // ordinary token refresh does not wipe what is half typed.
  useEffect(() => {
    setName(storedName);
    setEmail(storedEmail);
    setProfileError('');
    setProfileNotice('');
  }, [storedName, storedEmail]);

  // A subview keeps the hub's scroll position otherwise, and "page two opens
  // halfway down" reads as a rendering bug.
  useEffect(() => {
    panelRef.current?.scrollTo?.(0, 0);
  }, [view]);

  // Signing out while on the profile spoke leaves a form for nobody.
  useEffect(() => {
    if (!user && view === 'profile') setView('home');
  }, [user, view]);

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

  // The native share sheet where there is one, the clipboard where there
  // isn't. A dismissed sheet is a decision, not a failure, so it stays silent.
  const handleShare = async () => {
    const text = t('account.shareText');
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Carta', text, url: SHARE_URL });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${SHARE_URL}`);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2500);
    } catch {
      /* No share sheet and no clipboard access: nothing sane to do. */
    }
  };

  // Feedback goes by email rather than into a database nobody reads: the
  // mailto keeps the sender's address attached so they can get an answer.
  const handleSendFeedback = () => {
    const subject = encodeURIComponent(t('account.feedbackSubject'));
    const body = encodeURIComponent(feedbackText.trim());
    window.location.href = `mailto:${CONTACT}?subject=${subject}&body=${body}`;
  };

  const tier = TIERS[entitlement.tier] || TIERS.free;
  const upgrade = TIERS.trip;
  const locale = { en: 'en-GB', nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT' }[lang] || 'en-GB';

  const heading = view === 'profile' ? t('account.profileDetails')
    : view === 'faq' ? t('account.menuFaq')
    : view === 'feedback' ? t('account.feedbackTitle')
    : view === 'data' ? t('account.menuData')
    : user ? (storedName || storedEmail) : t('account.preferences');

  return (
    <div className="panel open account-panel" ref={panelRef}>
      {/* The close button lives INSIDE the sticky header. As a child of the
          scrolling panel it was positioned against the content box, so it slid
          out of sight the moment anybody scrolled and the panel had no visible
          way out at the bottom, which is where the delete section is. */}
      <div className="panel-header">
        <button className="panel-close" onClick={onClose} aria-label={t('account.close')}>x</button>
        {view === 'home' ? (
          <div className="panel-tag">{t('account.tag')}</div>
        ) : (
          <button type="button" className="account-back" onClick={() => setView('home')}>
            <ArrowLeftIcon size={13} /> {t('account.tag')}
          </button>
        )}
        <h2 className="panel-city account-heading">{heading}</h2>
      </div>

      {view === 'home' && (
        <>
          {/* Who you are, as a door rather than a form: the editable fields
              live one level down, so the hub stays a place you can read in
              five seconds. */}
          <div className="panel-section">
            {user ? (
              <button type="button" className="account-profile-card" onClick={() => setView('profile')}>
                <span className="account-hub-avatar" aria-hidden="true">{monogram(storedName, storedEmail)}</span>
                <span className="account-profile-meta">
                  <b>{storedName || storedEmail}</b>
                  <span>{storedName ? storedEmail : t('account.profileRowHint')}</span>
                </span>
                <ChevronRightIcon size={16} className="account-menu-chev" />
              </button>
            ) : configured ? (
              <div className="account-signin-card">
                <span className="account-hub-avatar account-hub-avatar-guest" aria-hidden="true"><PersonIcon size={20} /></span>
                <p className="account-section-hint">{t('account.signInPrompt')}</p>
                <button className="auth-submit account-wide-btn" onClick={onOpenAuth}>{t('account.signIn')}</button>
              </div>
            ) : null}
          </div>

          {/* What they hold today. A pass is a finite thing that runs out, so
              this states the expiry rather than a status word: "Trip Pass"
              alone tells somebody nothing about whether it still works. Below
              it, what the next pass would add, in the same plain numbers the
              pricing table uses. */}
          {user && (
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
          )}

          {/* Word of mouth is the whole marketing budget. The banner earns its
              tint by being the one thing here that is an invitation rather
              than plumbing. */}
          <div className="panel-section">
            <div className="account-invite">
              <b className="account-invite-title">{t('account.inviteTitle')}</b>
              <p className="account-invite-body">{t('account.inviteBody')}</p>
              <button type="button" className="account-invite-btn" onClick={handleShare}>
                {shareCopied ? <CheckIcon size={15} /> : <ShareIcon size={15} />}
                {shareCopied ? t('account.inviteCopied') : t('account.inviteBtn')}
              </button>
            </div>
          </div>

          {/* App language, moved here from the top bar: switching it is a
              once-per-person action, so it lives with the other settings
              instead of spending header width. Works signed out. */}
          <div className="panel-section">
            <div className="section-title">{t('account.language')}</div>
            <div className="account-lang-grid" role="listbox" aria-label={t('account.language')}>
              {languages.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={`account-lang-opt ${l.code === lang ? 'on' : ''}`}
                  onClick={() => setLang(l.code)}
                  role="option"
                  aria-selected={l.code === lang}
                >
                  <CountryFlag country={l.flag} size={15} />
                  <span className="account-lang-label">{l.label}</span>
                  {l.code === lang && <CheckIcon size={13} />}
                </button>
              ))}
            </div>
          </div>

          {/* Help, in the order people need it: say something, look something
              up, read the fine print. All three work signed out. */}
          <div className="panel-section">
            <div className="account-menu">
              <MenuRow icon={<FeedbackIcon size={17} />} label={t('account.menuFeedback')} onClick={() => setView('feedback')} />
              <MenuRow icon={<QuestionIcon size={17} />} label={t('account.menuFaq')} onClick={() => setView('faq')} />
              <MenuRow icon={<ShieldIcon size={17} />} label={t('account.privacyPolicy')} onClick={() => setPrivacyOpen(true)} />
              <MenuRow icon={<InfoIcon size={17} />} label={t('account.menuData')} onClick={() => setView('data')} />
            </div>
          </div>
        </>
      )}

      {view === 'profile' && user && (
        <>
          <div className="panel-section account-profile-head">
            <span className="account-hub-avatar account-hub-avatar-lg" aria-hidden="true">{monogram(storedName, storedEmail)}</span>
          </div>

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
        </>
      )}

      {view === 'faq' && (
        <div className="panel-section">
          <p className="account-section-hint">{t('account.faqHint')}</p>
          <div className="account-faq">
            {FAQ_KEYS.map(([qKey, aKey], i) => (
              <div key={qKey} className={`account-faq-item${openFaq === i ? ' open' : ''}`}>
                <button
                  type="button"
                  className="account-faq-q"
                  aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{t(qKey)}</span>
                  <ChevronDownIcon size={15} className="account-faq-chev" />
                </button>
                {openFaq === i && <p className="account-faq-a">{t(aKey)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data credits. Every source whose license asks for a visible credit,
          from src/data/attribution.js, which is derived from
          docs/tos/data_licenses.md. This used to sit in the front page's
          footer; the front page is gone, so the credits live here, where the
          privacy policy already is. A hairline list rather than cards: the
          licenses ask for legibility, not for decoration. */}
      {view === 'data' && (
        <div className="panel-section">
          <p className="account-section-hint">{t('account.dataHint')}</p>
          <ul className="account-credits">
            {ATTRIBUTIONS.map((a) => (
              <li key={a.source}>{a.credit}</li>
            ))}
          </ul>
        </div>
      )}

      {view === 'feedback' && (
        <div className="panel-section">
          <p className="account-section-hint">{t('account.feedbackHint')}</p>
          <div className="auth-field">
            <label className="auth-label" htmlFor="acct-feedback">{t('account.feedbackLabel')}</label>
            <textarea
              id="acct-feedback"
              className="account-feedback-input"
              rows={6}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder={t('account.feedbackPlaceholder')}
            />
          </div>
          <button
            className="auth-submit account-wide-btn"
            disabled={!feedbackText.trim()}
            onClick={handleSendFeedback}
          >
            {t('account.feedbackSend')}
          </button>
          <p className="auth-hint account-feedback-note">{t('account.feedbackNote', { email: CONTACT })}</p>
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
