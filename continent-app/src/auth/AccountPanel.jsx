import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import {
  ArrowLeftIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, EyeIcon,
  EyeOffIcon, FeedbackIcon, FriendsIcon, HomeIcon, InfoIcon, LockIcon, PencilIcon,
  PersonIcon, QuestionIcon, PiggyIcon, ShareIcon, ShieldIcon, SignOutIcon, SparkIcon,
  TrashIcon,
} from '../components/Icons.jsx';
import { PrivacyPolicy } from '../components/PrivacyPolicy.jsx';
import { ATTRIBUTIONS } from '../data/attribution.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { PassModal } from '../components/PassModal.jsx';
import { useEntitlement } from '../hooks/useEntitlement.js';
import { TIERS, daysLeft, canUpgrade, formatPrice } from '../lib/pricing.js';
import {
  MIN_PASSWORD_LENGTH, passwordStrength, checkPasswordRules, passwordMeetsRules,
} from '../lib/passwordStrength.js';
import { useI18n } from '../i18n/index.jsx';
import {
  fetchMyProfile, saveMyProfile, normaliseHandle, handleProblem, HANDLE_MAX,
} from './profiles.js';
import { FriendsSpoke } from './FriendsSpoke.jsx';
import { useIsAdmin } from '../hooks/useIsAdmin.js';
import { matchProfile, PROFILE_LABEL_KEYS } from '../browse/LifestylePanel.jsx';
import { sendFeedback } from '../lib/feedback.js';

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

// The FAQ, in four groups. Fourteen flat rows is a wall; grouped, a reader
// scanning for "why did the price change" never reads past the heading that
// is not theirs. Order runs outward-in: what the product is, then what its
// numbers mean, then planning, then the account, because the questions a
// first-time visitor has are the ones the earlier groups answer.
//
// Answers that quote a figure interpolate it (FAQ_VARS below) rather than
// spelling it out, so a pass price or a catalogue size can never drift away
// from the value the rest of the app renders.
const FAQ_GROUPS = [
  {
    labelKey: 'account.faqGroup1',
    items: [['account.faq1Q', 'account.faq1A'], ['account.faq2Q', 'account.faq2A'],
      ['account.faq3Q', 'account.faq3A'], ['account.faq4Q', 'account.faq4A']],
  },
  {
    labelKey: 'account.faqGroup2',
    items: [['account.faq5Q', 'account.faq5A'], ['account.faq6Q', 'account.faq6A'],
      ['account.faq7Q', 'account.faq7A']],
  },
  {
    labelKey: 'account.faqGroup3',
    items: [['account.faq8Q', 'account.faq8A'], ['account.faq9Q', 'account.faq9A'],
      ['account.faq10Q', 'account.faq10A']],
  },
  {
    labelKey: 'account.faqGroup4',
    items: [['account.faq11Q', 'account.faq11A'], ['account.faq12Q', 'account.faq12A'],
      ['account.faq13Q', 'account.faq13A'], ['account.faq14Q', 'account.faq14A']],
  },
];

/** Every figure the answers quote, read from the same sources the product
 *  renders elsewhere: the loaded catalogue and lib/pricing.js. A count that
 *  cannot be read yet falls back to the shipped catalogue size rather than
 *  rendering "{n}" at the traveller. */
function faqVars(destinations) {
  const n = Array.isArray(destinations)
    ? destinations.length
    : (destinations && typeof destinations === 'object' ? Object.keys(destinations).length : 0);
  return {
    n: (n || 3038).toLocaleString('en-GB'),
    freePlans: TIERS.free.aiPlans,
    tripPlans: TIERS.trip.aiPlans,
    tripGround: TIERS.trip.grounded,
    tripPrice: formatPrice(TIERS.trip.priceCents),
    yearPlans: TIERS.year.aiPlans,
    yearGround: TIERS.year.grounded,
    yearPrice: formatPrice(TIERS.year.priceCents),
  };
}

/** Initials for the avatar disc. Two letters from a name, one from an email,
 *  because a coloured circle with nothing in it reads as a broken image. */
// The avatar shelf. Deliberately short: a grid of every emoji is a keyboard
// rather than a choice, and these have to read at 20px inside a 64px circle.
const AVATAR_EMOJI = [
  '\u{1F9F3}', '\u{2708}\u{FE0F}', '\u{1F5FA}\u{FE0F}', '\u{1F3D4}\u{FE0F}', '\u{1F3D6}\u{FE0F}', '\u{1F686}',
  '\u{1F6F6}', '\u{1F3D5}\u{FE0F}', '\u{1F9ED}', '\u{1F320}', '\u{2615}', '\u{1F42C}',
];

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

/**
 * A field's verdict, sitting at the end of its label line.
 *
 * The profile form asks for three things that can each be wrong on their own,
 * and a single error at the foot of the form makes you work out which. A mark
 * per field answers that before you press anything. It stays away until the
 * field has something in it or has been touched, so an untouched form is not
 * a column of red.
 */
function FieldMark({ show, ok, okLabel, badLabel }) {
  if (!show) return null;
  return (
    <span className={`auth-mark${ok ? ' is-ok' : ' is-bad'}`} title={ok ? okLabel : badLabel}>
      {ok ? <CheckIcon size={11} /> : <CloseIcon size={11} />}
      <span className="sr-only">{ok ? okLabel : badLabel}</span>
    </span>
  );
}

/** Label plus, when there is one, the field's verdict at the far end. */
function FieldLabel({ htmlFor, children, mark }) {
  return (
    <div className="auth-label-row">
      <label className="auth-label" htmlFor={htmlFor}>{children}</label>
      {mark}
    </div>
  );
}

/**
 * Password input with a reveal toggle, and the one place a password field's
 * error is allowed to appear: directly under the field it belongs to.
 *
 * Typing a long passphrase blind on a phone is how people end up locked out of
 * accounts they still own, hence the reveal. `error` and `hint` are wired
 * through aria-describedby rather than left as loose text, so a screen reader
 * hears "current password, invalid, that current password isn't right" instead
 * of a sentence stranded somewhere below the button.
 */
function PasswordField({
  id, label, value, onChange, autoComplete, placeholder, required = false, error = '', hint = null,
  mark = null,
}) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');
  return (
    <div className={`auth-field${error ? ' has-error' : ''}${mark ? ' has-mark' : ''}`}>
      <label className="auth-label" htmlFor={id}>{label}</label>
      <div className="pw-input-wrap">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
        />
        {mark}
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
      {error && <p className="auth-field-error" id={errorId} role="alert">{error}</p>}
      {hint && <div className="auth-field-hint" id={hintId}>{hint}</div>}
    </div>
  );
}

/**
 * What the new password still needs, ticked off as it is typed.
 *
 * Two readings of the same secret, kept side by side on purpose. The checklist
 * is the floor the form enforces and it is learnable: four rules, each either
 * met or not. The meter underneath is the honest measurement, and it is what
 * tells somebody that a four-word phrase clearing every rule is far better
 * than an eight-character mangle that also clears them. Neither is enough on
 * its own, which is why the button gates on the first and nobody is nagged
 * about the second.
 *
 * It renders nothing until there is something to check, so the closed form is
 * three fields and a button rather than a page of conditions.
 */
function PasswordChecklist({ password }) {
  const { t } = useI18n();
  const strength = useMemo(() => passwordStrength(password), [password]);
  const rules = useMemo(() => checkPasswordRules(password), [password]);
  if (!password) return null;
  const labels = {
    len: t('account.reqLength', { n: MIN_PASSWORD_LENGTH }),
    upper: t('account.reqUpper'),
    number: t('account.reqNumber'),
    symbol: t('account.reqSymbol'),
  };
  return (
    <div className="pw-gauge">
      <ul className="pw-reqs">
        {rules.map((r) => (
          <li key={r.key} className={`pw-req${r.met ? ' met' : ''}`}>
            {r.met ? <CheckIcon size={13} /> : <span className="pw-req-dot" />}
            {labels[r.key]}
          </li>
        ))}
      </ul>
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
    </div>
  );
}

/** One row of the hub menu: icon, label, chevron. A real button, 52px tall. */
function MenuRow({ icon, label, value, onClick }) {
  return (
    <button type="button" className="account-nav account-menu-row" onClick={onClick}>
      <span className="account-menu-icon">{icon}</span>
      <span className="account-menu-label">{label}</span>
      {value && <span className="account-menu-value">{value}</span>}
      <ChevronRightIcon size={16} className="account-menu-chev" />
    </button>
  );
}

export function AccountPanel({
  onClose, onOpenAuth, initialView = 'home', onViewChange, pendingFriendHandle,
  destinations, onOpenAdmin, onOpenLifestyle, onOpenSaved, onOpenGuides,
  stayTier = 'home', lifestyle,
}) {
  const {
    user, hasPassword, signOut, signOutOtherDevices, updatePassword, reauthenticate,
    updateProfile, sendPasswordReset, deleteAccount, configured,
  } = useAuth();
  const { t, lang, setLang, languages } = useI18n();
  const entitlement = useEntitlement();
  // Whether the staff door shows at all. A hint, not a gate: every admin RPC
  // re-checks membership on the server.
  const { isAdmin } = useIsAdmin();
  const panelRef = useRef(null);
  const [view, setView] = useState(initialView); // 'home' | 'profile' | 'friends' | 'faq' | 'feedback' | 'data'
  const [passOpen, setPassOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const storedName = user?.user_metadata?.full_name?.trim() || '';
  const storedEmail = user?.email || '';

  // What the lifestyle row states without being opened: the bed and the
  // habits, the two answers that move every price in the app. A comma, never
  // a bullet, because this app has no middot separators.
  const lifestyleProfile = matchProfile(lifestyle || {});
  const lifestyleSummary = [
    t(`stay.${stayTier || 'home'}`),
    lifestyleProfile ? t(PROFILE_LABEL_KEYS[lifestyleProfile]) : t('lifestyle.custom'),
  ].join(', ');

  const [name, setName] = useState(storedName);
  const [email, setEmail] = useState(storedEmail);
  // The handle lives in public.profiles, not in the auth user, so it loads
  // separately and saves separately. storedHandle is what the account actually
  // holds; `handle` is what is in the field.
  const [storedHandle, setStoredHandle] = useState('');
  // The avatar the profile carries. Emoji, not a photograph: migration 010
  // rules out uploads on purpose, because a picture of a person is the one
  // thing in this panel that would need moderating.
  const [avatarEmoji, setAvatarEmoji] = useState('');
  const [storedAvatar, setStoredAvatar] = useState('');
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Errors that belong to one field sit under that field; pwError is only for
  // what the form as a whole failed at, which in practice means the network.
  const [pwFieldError, setPwFieldError] = useState({});
  const [pwError, setPwError] = useState('');
  const [pwNotice, setPwNotice] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  // Opt-in, and off by default: signing out the other devices is the right
  // thing to offer here and the wrong thing to do to somebody who only wanted
  // a new password.
  const [signOutOthers, setSignOutOthers] = useState(false);
  // The reset link says what it is about to do before it does it. Mailing
  // somebody a password reset they did not quite mean to ask for is a small
  // fright, and the panel already uses this arm-then-confirm shape to delete.
  const [forgotArmed, setForgotArmed] = useState(false);

  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // The open question is keyed by its i18n key, not its index: with the
  // answers grouped, an index is only unique within one group.
  const [openFaq, setOpenFaq] = useState(null);
  const faqFigures = useMemo(() => faqVars(destinations), [destinations]);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackKind, setFeedbackKind] = useState('other');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackErr, setFeedbackErr] = useState('');
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

  // The profile row is seeded by a trigger on signup, so it exists for every
  // account. A project that has not run migration 010 yet simply has no
  // handle to show, which is why a failure here is silent rather than an
  // error: it is not something the account holder can act on.
  useEffect(() => {
    if (!user) { setStoredHandle(''); setHandle(''); setAvatarEmoji(''); setStoredAvatar(''); return undefined; }
    let live = true;
    fetchMyProfile(user.id)
      .then((row) => {
        if (!live || !row) return;
        setStoredHandle(row.handle || '');
        setHandle(row.handle || '');
        // fetchMyProfile hands back the row as Postgres names it, so this is
        // avatar_emoji rather than the camelCase findByHandle returns.
        setAvatarEmoji(row.avatar_emoji || '');
        setStoredAvatar(row.avatar_emoji || '');
      })
      .catch((err) => console.warn('[account] could not read your profile:', err?.message || err));
    return () => { live = false; };
  }, [user]);

  // The header's Friends button lights up only while that spoke is showing,
  // so navigating back to the hub inside the panel unlights it. One effect
  // rather than a callback on every setView, which would drift.
  useEffect(() => { onViewChange?.(view); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // A subview keeps the hub's scroll position otherwise, and "page two opens
  // halfway down" reads as a rendering bug.
  useEffect(() => {
    panelRef.current?.scrollTo?.(0, 0);
  }, [view]);

  // Signing out while on the profile spoke leaves a form for nobody.
  useEffect(() => {
    if (!user && (view === 'profile' || view === 'friends')) setView('home');
  }, [user, view]);

  const emailChanged = email.trim().toLowerCase() !== storedEmail.toLowerCase();
  const handleChanged = !!storedHandle && handle !== storedHandle;
  const avatarChanged = avatarEmoji !== storedAvatar;
  const nameChanged = name.trim() !== storedName;
  const profileDirty = nameChanged || emailChanged || handleChanged || avatarChanged;

  // What each field's mark reports. A mark is only shown once the field has
  // something in it or has been edited, so opening the panel does not look
  // like a list of complaints.
  const nameOk = !!name.trim();
  const emailOk = EMAIL_RE.test(email.trim());
  const handleOk = !handleProblem(handle);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileNotice('');
    const nextName = name.trim();
    const nextEmail = email.trim();
    if (!nextName) { setProfileError(t('account.errNameEmpty')); return; }
    if (!EMAIL_RE.test(nextEmail)) { setProfileError(t('account.errEmailInvalid')); return; }
    if (handleChanged) {
      const problem = handleProblem(handle);
      if (problem) { setProfileError(t(problem)); return; }
    }
    setProfileBusy(true);
    try {
      // The handle goes first: it is the one field that can be refused by
      // somebody else's choice, and failing after the email change had already
      // been sent would leave the account half saved.
      if (handleChanged || avatarChanged) {
        try {
          await saveMyProfile(user.id, {
            ...(handleChanged ? { handle } : {}),
            ...(avatarChanged ? { avatarEmoji } : {}),
          });
          setStoredHandle(handle);
          setStoredAvatar(avatarEmoji);
        } catch (err) {
          // Taken, and that is all anybody is told. Who holds it is not the
          // asker's business, and answering would make the lookup a directory.
          setProfileError(t(err.code === 'HANDLE_TAKEN' ? 'profile.errHandleTaken' : 'profile.errHandleChars'));
          setProfileBusy(false);
          return;
        }
      }
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

  // Live state of the form, the same booleans the checklist draws and the
  // submit button gates on. One source, so the button can never be pressable
  // over a rule the list is still showing as unmet.
  const pwRulesMet = passwordMeetsRules(newPassword);
  const pwMatches = !!confirmPassword && newPassword === confirmPassword;
  const pwReady = (!hasPassword || !!currentPassword) && pwRulesMet && pwMatches;

  // Whether what is in the handle field right now would be refused. Drives the
  // one hint the field shows; the specific complaint still comes back from the
  // save, where taken-by-somebody-else can also be the answer.
  const handleUnfit = !!storedHandle && !!handleProblem(handle);

  const clearPwFieldError = (key) => setPwFieldError((cur) => (cur[key] ? { ...cur, [key]: '' } : cur));

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    // A second submit while the first is in flight would re-authenticate and
    // re-write the password against a session that is already moving.
    if (pwLoading) return;
    setPwError('');
    setPwNotice('');
    setPwFieldError({});
    if (hasPassword && !currentPassword) {
      setPwFieldError({ current: t('account.errCurrentPasswordMissing') });
      return;
    }
    if (!pwRulesMet) {
      setPwFieldError({ next: t('account.errPasswordRules') });
      return;
    }
    if (!pwMatches) {
      setPwFieldError({ confirm: t('account.errPasswordMismatch') });
      return;
    }
    if (hasPassword && newPassword === currentPassword) {
      setPwFieldError({ next: t('account.errPasswordSame') });
      return;
    }
    setPwLoading(true);
    try {
      // Prove ownership before changing the credential, so a borrowed session
      // cannot lock the real owner out of their own trips.
      if (hasPassword) {
        try {
          await reauthenticate(currentPassword);
        } catch {
          setPwFieldError({ current: t('account.errCurrentPassword') });
          setPwLoading(false);
          return;
        }
      }
      await updatePassword(newPassword);
      // The password is changed either way. If the sweep of the other devices
      // fails, say so instead of letting a green banner imply a laptop was
      // signed out when it was not.
      let sweptOthers = false;
      let sweepFailed = false;
      if (signOutOthers) {
        try {
          await signOutOtherDevices();
          sweptOthers = true;
        } catch {
          sweepFailed = true;
        }
      }
      setPwNotice(sweptOthers ? t('account.passwordUpdatedOthers') : t('account.passwordUpdated'));
      if (sweepFailed) setPwError(t('account.errSignOutOthers'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSignOutOthers(false);
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
    if (pwLoading) return;
    setPwError('');
    setPwNotice('');
    setPwFieldError({});
    setPwLoading(true);
    try {
      await sendPasswordReset(storedEmail);
      setForgotArmed(false);
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

  // Feedback goes to the database, where the admin panel reads it. It used
  // to be a mailto:, which did nothing at all on a device with no mail client
  // configured and left no record when it failed. The mailto survives as the
  // fallback for exactly that case: if the write is refused, the message the
  // person already typed is not lost, it just travels the old way.
  const mailtoFeedback = () => {
    const subject = encodeURIComponent(t('account.feedbackSubject'));
    const body = encodeURIComponent(feedbackText.trim());
    window.location.href = `mailto:${CONTACT}?subject=${subject}&body=${body}`;
  };

  const handleSendFeedback = async () => {
    if (!feedbackText.trim() || feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackErr('');
    try {
      await sendFeedback({ message: feedbackText.trim(), kind: feedbackKind });
      setFeedbackSent(true);
      setFeedbackText('');
    } catch (e) {
      if (e?.code === 'too_many') {
        setFeedbackErr(t('account.feedbackTooMany'));
      } else {
        mailtoFeedback();
      }
    }
    setFeedbackBusy(false);
  };

  const tier = TIERS[entitlement.tier] || TIERS.free;
  const upgrade = TIERS.trip;
  const locale = { en: 'en-GB', nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT' }[lang] || 'en-GB';

  // The hub used to title itself with your own name, and then the card
  // directly under it said the same name again with the email beneath. Two
  // lines of the same fact, and the serif one pushed the card a screen-inch
  // down from the row carrying Passes. The card is the better of the two, so
  // signed in the hub goes straight to it. Every spoke keeps its title.
  const heading = view === 'profile' ? t('account.profileDetails')
    : view === 'friends' ? t('friends.title')
    : view === 'faq' ? t('account.menuFaq')
    : view === 'feedback' ? t('account.feedbackTitle')
    : view === 'data' ? t('account.menuData')
    : user ? null : t('account.preferences');

  // The panel's spokes as one list, drawn twice: as the hub's menu rows on a
  // phone, and as the desktop rail that stands where Destinations and Explore
  // stand their filters. Two arrangements of one set of doors cannot drift
  // apart while the source only holds one of them. `go` is what the row does;
  // `view` is what makes it read as the page you are on.
  const NAV = [
    { key: 'home', group: 'account', view: 'home', Icon: HomeIcon, label: t('account.menuOverview'), go: () => setView('home') },
    user && { key: 'profile', group: 'account', view: 'profile', Icon: PersonIcon, label: t('account.profileDetails'), go: () => setView('profile') },
    user && { key: 'friends', group: 'account', view: 'friends', Icon: FriendsIcon, label: t('friends.title'), go: () => setView('friends') },
    user && isAdmin && { key: 'admin', group: 'account', Icon: LockIcon, label: t('account.menuAdmin'), go: () => { onClose?.(); onOpenAdmin?.(); } },
    { key: 'feedback', group: 'help', view: 'feedback', Icon: FeedbackIcon, label: t('account.menuFeedback'), go: () => setView('feedback') },
    { key: 'faq', group: 'help', view: 'faq', Icon: QuestionIcon, label: t('account.menuFaq'), go: () => setView('faq') },
    { key: 'privacy', group: 'help', Icon: ShieldIcon, label: t('account.privacyPolicy'), go: () => setPrivacyOpen(true) },
    { key: 'data', group: 'help', view: 'data', Icon: InfoIcon, label: t('account.menuData'), go: () => setView('data') },
  ].filter(Boolean);

  const renderNav = (group, cls) => NAV.filter((r) => r.group === group).map(
    ({ key, view: v, Icon, label, go }) => (
      <button
        key={key}
        type="button"
        className={`account-nav ${cls} ${v && view === v ? 'on' : ''}`}
        aria-current={v && view === v ? 'page' : undefined}
        onClick={go}
      >
        <Icon size={16} />
        <span>{label}</span>
      </button>
    ),
  );

  return (
    <div className="account-shell">
      {/* Desktop-only left panel (CSS hides it under 769px). It carries the
          navigation the hub's help menu carries on a phone, which is why that
          menu folds away at the same width: one set of doors, never two. */}
      <aside className="side-panel account-side" aria-label={t('account.tag')}>
        <div className="side-block">
          <p className="side-label">{t('side.account')}</p>
          <div className="side-nav">{renderNav('account', 'side-navrow')}</div>
        </div>
        <div className="side-block">
          <p className="side-label">{t('side.help')}</p>
          <div className="side-nav">{renderNav('help', 'side-navrow')}</div>
        </div>
      </aside>

    <div className="panel open account-panel" ref={panelRef}>
      {/* The close button lives INSIDE the sticky header. As a child of the
          scrolling panel it was positioned against the content box, so it slid
          out of sight the moment anybody scrolled and the panel had no visible
          way out at the bottom, which is where the delete section is. */}
      <div className={`panel-header${heading ? '' : ' account-header-bare'}`}>
        <button className="panel-close" onClick={onClose} aria-label={t('account.close')}>x</button>
        {view === 'home' ? (
          <div className="panel-tag">{t('account.tag')}</div>
        ) : (
          <button type="button" className="account-back" onClick={() => setView('home')}>
            <ArrowLeftIcon size={13} /> {t('account.tag')}
          </button>
        )}
        {heading && <h2 className="panel-city account-heading">{heading}</h2>}
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

          {/* How this person travels, the setting behind every euro figure
              the app prints. It used to be reachable only from the two browse
              tabs, which made it read like a filter; it is a preference, and
              preferences live here too. Works signed out. */}
          {onOpenLifestyle && (
            <div className="panel-section">
              <div className="account-menu">
                <MenuRow
                  icon={<PiggyIcon size={17} />}
                  label={t('filter.lifestyle')}
                  value={lifestyleSummary}
                  onClick={() => { onClose?.(); onOpenLifestyle(); }}
                />
              </div>
            </div>
          )}

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
          <div className="panel-section account-help-section">
            <div className="account-menu account-menu-help">
              {/* The staff door. Rendered only for accounts on the admin
                  list; for everybody else this row does not exist. It opens
                  the back office as a full page rather than a spoke: a table
                  of every account is not a thing you read in 440px. */}
              {user && isAdmin && (
                <MenuRow
                  icon={<LockIcon size={17} />}
                  label={t('account.menuAdmin')}
                  onClick={() => { onClose?.(); onOpenAdmin?.(); }}
                />
              )}
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
            <span className="account-hub-avatar account-hub-avatar-lg" aria-hidden="true">
              {avatarEmoji || monogram(storedName, storedEmail)}
            </span>
            {/* Emoji, not an upload. Migration 010 rules photographs out on
                purpose: a picture of a person is the one thing on this panel
                that would need moderating, and friends see this avatar. */}
            {storedHandle && (
              <button
                type="button"
                className="account-avatar-edit"
                onClick={() => setAvatarOpen((v) => !v)}
                aria-expanded={avatarOpen}
              >
                <PencilIcon size={12} />
                {t('profile.editAvatar')}
              </button>
            )}
            {avatarOpen && (
              <div className="account-avatar-picker" role="group" aria-label={t('profile.editAvatar')}>
                {AVATAR_EMOJI.map((e) => (
                  <button
                    type="button"
                    key={e}
                    className={`account-avatar-opt${e === avatarEmoji ? ' on' : ''}`}
                    onClick={() => setAvatarEmoji(e === avatarEmoji ? '' : e)}
                    aria-pressed={e === avatarEmoji}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="panel-section">
            <div className="section-title section-title-iconed"><PersonIcon size={12} /> {t('account.profileTitle')}</div>
            <form className="auth-form auth-form-inline" onSubmit={handleProfileSave}>
              <div className="auth-field">
                <FieldLabel
                  htmlFor="acct-name"
                  mark={(
                    <FieldMark
                      show={!!name || nameChanged}
                      ok={nameOk}
                      okLabel={t('profile.markOk')}
                      badLabel={t('account.errNameEmpty')}
                    />
                  )}
                >
                  {t('account.name')}
                </FieldLabel>
                <input
                  id="acct-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {storedHandle && (
                <div className="auth-field">
                  <FieldLabel
                    htmlFor="acct-handle"
                    mark={(
                      <FieldMark
                        show={!!handle || handleChanged}
                        ok={handleOk}
                        okLabel={t('profile.markOk')}
                        badLabel={t('profile.markHandleBad')}
                      />
                    )}
                  >
                    {t('profile.handle')}
                  </FieldLabel>
                  <div className="acct-handle-row">
                    <span className="acct-handle-at" aria-hidden="true">@</span>
                    <input
                      id="acct-handle"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck="false"
                      maxLength={HANDLE_MAX}
                      value={handle}
                      onChange={(e) => setHandle(normaliseHandle(e.target.value))}
                      aria-describedby={handleUnfit ? 'acct-handle-hint' : undefined}
                    />
                  </div>
                  {/* The rule appears when it is being broken, and not before.
                      A handle that already fits does not need telling what a
                      handle is; one that does not fit needs telling exactly
                      this, at the moment it stops fitting. */}
                  {handleUnfit && (
                    <div className="auth-hint acct-handle-hint" id="acct-handle-hint" role="status">
                      {t('profile.handleHint')}
                    </div>
                  )}
                </div>
              )}
              <div className="auth-field">
                <FieldLabel
                  htmlFor="acct-email"
                  mark={(
                    <FieldMark
                      show={!!email || emailChanged}
                      ok={emailOk}
                      okLabel={t('profile.markOk')}
                      badLabel={t('account.errEmailInvalid')}
                    />
                  )}
                >
                  {t('account.email')}
                </FieldLabel>
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
              <button type="submit" className="auth-submit" disabled={!profileDirty || profileBusy}>
                {profileBusy ? t('account.pleaseWait') : t('account.saveProfile')}
              </button>
            </form>
          </div>

          <div className="panel-section">
            <div className="section-title section-title-iconed">
              <LockIcon size={12} /> {t('account.securityTitle')}
            </div>
            {/* Success is announced once, dismissibly, and the fields empty
                behind it. A banner that cannot be closed becomes furniture on
                the next visit to the panel. */}
            {pwNotice && (
              <div className="auth-banner" role="status">
                <CheckIcon size={14} />
                <span className="auth-banner-text">{pwNotice}</span>
                <button
                  type="button"
                  className="auth-banner-x"
                  onClick={() => setPwNotice('')}
                  aria-label={t('account.dismissNotice')}
                >
                  <CloseIcon size={13} />
                </button>
              </div>
            )}
            {hasPassword ? (
              /* noValidate: every rule here is checked live and reported in the
                 panel's own voice, and the browser's own bubble would talk over
                 it in the browser's language rather than the reader's.
                 `required` stays, for the semantics and the screen reader. */
              <form className="auth-form auth-form-inline" onSubmit={handlePasswordChange} noValidate>
                <PasswordField
                  id="acct-current-pw"
                  label={t('account.currentPassword')}
                  value={currentPassword}
                  onChange={(v) => { setCurrentPassword(v); clearPwFieldError('current'); }}
                  autoComplete="current-password"
                  placeholder={t('account.currentPasswordPlaceholder')}
                  required
                  error={pwFieldError.current || ''}
                />
                {!forgotArmed ? (
                  <button
                    type="button"
                    className="auth-link auth-forgot-inline"
                    onClick={() => setForgotArmed(true)}
                    disabled={pwLoading}
                  >
                    {t('account.forgotPassword')}
                  </button>
                ) : (
                  <div className="auth-forgot-confirm">
                    <p className="auth-forgot-text">{t('account.forgotConfirm', { email: storedEmail })}</p>
                    <div className="auth-forgot-actions">
                      <button type="button" className="book-btn secondary" onClick={() => setForgotArmed(false)}>
                        {t('account.forgotCancel')}
                      </button>
                      <button type="button" className="book-btn" onClick={handleSendReset} disabled={pwLoading}>
                        {pwLoading ? t('account.pleaseWait') : t('account.forgotSend')}
                      </button>
                    </div>
                  </div>
                )}
                <PasswordField
                  id="acct-new-pw"
                  label={t('account.newPassword')}
                  value={newPassword}
                  onChange={(v) => { setNewPassword(v); clearPwFieldError('next'); }}
                  autoComplete="new-password"
                  placeholder={t('account.newPasswordPlaceholder', { n: MIN_PASSWORD_LENGTH })}
                  required
                  error={pwFieldError.next || ''}
                  hint={newPassword ? <PasswordChecklist password={newPassword} /> : null}
                />
                <PasswordField
                  id="acct-confirm-pw"
                  label={t('account.confirmNewPassword')}
                  value={confirmPassword}
                  onChange={(v) => { setConfirmPassword(v); clearPwFieldError('confirm'); }}
                  autoComplete="new-password"
                  placeholder={t('account.confirmNewPasswordPlaceholder')}
                  required
                  error={pwFieldError.confirm || ''}
                  mark={confirmPassword ? (
                    <FieldMark
                      show
                      ok={pwMatches}
                      okLabel={t('account.reqMatch')}
                      badLabel={t('account.errPasswordMismatch')}
                    />
                  ) : null}
                  // The tick alone carries the good news; only the bad news
                  // needs a sentence.
                  hint={confirmPassword && !pwMatches ? (
                    <p className="pw-match">{t('account.errPasswordMismatch')}</p>
                  ) : null}
                />
                <label className="auth-check">
                  <input
                    type="checkbox"
                    checked={signOutOthers}
                    onChange={(e) => setSignOutOthers(e.target.checked)}
                  />
                  <span>{t('account.signOutOthers')}</span>
                </label>
                {pwError && <div className="auth-error">{pwError}</div>}
                {/* Disabled until the form could actually succeed, and while it
                    is in flight, which is the half that stops a second submit
                    re-authenticating against a session already being replaced. */}
                <button
                  type="submit"
                  className="auth-submit"
                  disabled={pwLoading || !pwReady}
                  aria-busy={pwLoading || undefined}
                >
                  {pwLoading ? t('account.pleaseWait') : t('account.updatePassword')}
                </button>
              </form>
            ) : (
              <>
                <p className="account-section-hint">{t('account.noPasswordHint')}</p>
                {pwError && <div className="auth-error">{pwError}</div>}
                <button
                  className="book-btn secondary account-wide-btn"
                  onClick={handleSendReset}
                  disabled={pwLoading}
                  aria-busy={pwLoading || undefined}
                >
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
            {/* No explainer. Signing out is the one control here that nobody
                needs told what it does, and the reassurance that saved trips
                survive it only raises a doubt it then has to answer. */}
            <button className="book-btn secondary account-signout account-wide-btn" onClick={signOut}>
              {t('account.signOut')}
            </button>
          </div>

          <div className="panel-section">
            <div className="section-title section-title-iconed account-danger-title"><TrashIcon size={12} /> {t('account.dangerTitle')}</div>
            <div className="account-danger">
              {/* Closed, this is one red button and nothing else. The sentence
                  about what deletion costs is not a standing notice on a panel
                  people open to change their name: it is the answer to having
                  pressed the button, and it appears when the question is
                  actually being asked. */}
              {!deleteArmed ? (
                <button className="book-btn account-delete-arm account-wide-btn" onClick={() => setDeleteArmed(true)}>
                  {t('account.deleteBtn')}
                </button>
              ) : (
                <>
                  <p className="account-danger-text">{t('account.deleteHint')}</p>
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

      {view === 'friends' && user && (
        <FriendsSpoke
          userId={user.id}
          pendingHandle={pendingFriendHandle}
          destinations={destinations}
          onOpenSaved={onOpenSaved}
          onOpenGuides={onOpenGuides}
        />
      )}

      {view === 'faq' && (
        <div className="panel-section">
          <p className="account-section-hint">{t('account.faqHint')}</p>
          {FAQ_GROUPS.map((group) => (
            <div key={group.labelKey} className="account-faq-group">
              <h3 className="account-faq-grouplabel">{t(group.labelKey)}</h3>
              <div className="account-faq">
                {group.items.map(([qKey, aKey]) => (
                  <div key={qKey} className={`account-faq-item${openFaq === qKey ? ' open' : ''}`}>
                    <button
                      type="button"
                      className="account-faq-q"
                      aria-expanded={openFaq === qKey}
                      onClick={() => setOpenFaq(openFaq === qKey ? null : qKey)}
                    >
                      <span>{t(qKey)}</span>
                      <ChevronDownIcon size={15} className="account-faq-chev" />
                    </button>
                    {openFaq === qKey && <p className="account-faq-a">{t(aKey, faqFigures)}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* The FAQ can only ever answer the questions we thought of, so it
              ends by pointing at the one route that handles the rest. */}
          <div className="account-faq-foot">
            <p className="account-section-hint">{t('account.faqMore')}</p>
            <button type="button" className="account-wide-btn" onClick={() => setView('feedback')}>
              <FeedbackIcon size={16} /> {t('account.faqMoreBtn')}
            </button>
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
          {feedbackSent ? (
            <div className="account-feedback-done">
              <CheckIcon size={18} />
              <p>{t('account.feedbackThanks')}</p>
              <button
                type="button"
                className="account-wide-btn admin-btn-secondary"
                onClick={() => setFeedbackSent(false)}
              >
                {t('account.feedbackAgain')}
              </button>
            </div>
          ) : (
            <>
              <p className="account-section-hint">{t('account.feedbackHint')}</p>
              {/* What kind of message this is, so the inbox can be triaged
                  without reading every one of them first. */}
              <div className="admin-tone" role="radiogroup" aria-label={t('account.feedbackKind')}>
                {['bug', 'idea', 'other'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={feedbackKind === k}
                    className={`admin-tone-opt ${feedbackKind === k ? 'on' : ''}`}
                    onClick={() => setFeedbackKind(k)}
                  >
                    {t(`account.feedbackKind.${k}`)}
                  </button>
                ))}
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="acct-feedback">{t('account.feedbackLabel')}</label>
                <textarea
                  id="acct-feedback"
                  className="account-feedback-input"
                  rows={6}
                  maxLength={4000}
                  value={feedbackText}
                  onChange={(e) => { setFeedbackText(e.target.value); setFeedbackErr(''); }}
                  placeholder={t('account.feedbackPlaceholder')}
                />
              </div>
              {feedbackErr && <p className="auth-error">{feedbackErr}</p>}
              <button
                className="auth-submit account-wide-btn"
                disabled={!feedbackText.trim() || feedbackBusy}
                onClick={handleSendFeedback}
              >
                {feedbackBusy ? t('account.pleaseWait') : t('account.feedbackSend')}
              </button>
              <p className="auth-hint account-feedback-note">{t('account.feedbackNote', { email: CONTACT })}</p>
            </>
          )}
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
    </div>
  );
}
