import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './AuthContext.jsx';
import { authErrorText } from './authErrors.js';
import {
  ArrowLeftIcon, BedIcon, CheckIcon, CloseIcon, DownloadIcon, EyeIcon, EyeOffIcon,
  FeedbackIcon, FriendsIcon, GlobeIcon, HomeIcon, LinkIcon, LockIcon, MapPinIcon, PencilIcon,
  PersonIcon, PlaneIcon, QuestionIcon, ReceiptIcon, ShareIcon, ShieldIcon, SignOutIcon,
  SparkIcon, TicketIcon, TrashIcon,
} from '../components/Icons.jsx';

// The explainer page (scripts/explainer/numbers.mjs), a static page outside
// the app, built as about/numbers.html and served at this clean path.
const NUMBERS_HREF = '/about/numbers';
import { PrivacyPolicy } from '../components/PrivacyPolicy.jsx';
import { Imprint } from '../components/Imprint.jsx';
import { TermsOfService } from '../components/TermsOfService.jsx';
import { CookiesPage } from '../components/CookiesPage.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { TIERS } from '../lib/pricing.js';
import { openBillingPortal, cancelYearly, resumeYearly } from '../lib/billing.js';
import {
  MIN_PASSWORD_LENGTH, passwordStrength, checkPasswordRules, passwordMeetsRules,
} from '../lib/passwordStrength.js';
import { useI18n } from '../i18n/index.jsx';
import { tabHref } from '../lib/urlState.js';
import {
  fetchMyProfile, saveMyProfile, normaliseHandle, handleProblem, HANDLE_MAX,
} from './profiles.js';
import { PasswordField } from './PasswordField.jsx';
import { useIsAdmin } from '../hooks/useIsAdmin.js';
import { FaqView } from './account/FaqView.jsx';
import { FeedbackView } from './account/FeedbackView.jsx';
import { PlanView, CancelView } from './account/PlanView.jsx';
import { Button, Chip } from '../components/ui/index.js';
import { SiteFooter } from '../components/SiteFooter.jsx';
import { GoogleButton } from './GoogleButton.jsx';
import { useTogether } from '../together/useTogether.js';
import { DEFAULT_VISIBILITY } from './friendVisibility.js';
import { Group, Row, fmtDate, listValue, plainClick } from './account/parts.jsx';
import { useAccountFacts } from './account/useAccountFacts.js';
import { useTravelValues } from './account/travelValues.js';
import { TravelView, PrefsView } from './account/TravelView.jsx';
import { AiView } from './account/AiView.jsx';
import {
  IS_ACCOUNT_MOCK, ACCOUNT_MOCK_GUEST, MOCK_USER, MOCK_PROFILE, mockEntitlement,
} from './account/accountMock.js';
import '../styles/91-account.css';

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
const SHARE_URL = 'https://carta-europetravel.com';

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

// PasswordField moved to ./PasswordField.jsx (T390) so the sign-in modal and
// the reset screen share the account's field, reveal toggle included.

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

/**
 * Account (T933 to T936, the owner-approved spec "Account: who you are, what
 * you pay, what Carta knows"). One page in the family of My trips and
 * Together: from 900 px a sticky left rail (Overview, the seven sections,
 * Sign out) and one pane; on a phone the Overview is the page, grouped rows
 * that open each section with a back link, one level deep. Every row is a
 * label, its current value and one action; no captions under rows.
 *
 * Every section has its own address (`?tab=account&view=`, ACCOUNT_VIEWS in
 * lib/urlState.js); the old `yourdata` opens Your data, `friends` opens
 * Together (App), `profile` is the identity card's editor.
 */
const VIEW_ALIAS = { yourdata: 'data', friends: 'together' };
// The sections a guest may open; anything else lands on the Overview.
const GUEST_VIEWS = new Set(['home', 'travel', 'prefs', 'help', 'faq', 'feedback']);
// What each view returns to: the rail marks its parent, and on a desktop a
// view under a section carries a back link to it.
const PARENT = { cancel: 'plan', ai: 'data', faq: 'help', feedback: 'help', profile: 'home' };
const normalView = (v) => VIEW_ALIAS[v] || v || 'home';

export function AccountPanel({
  onClose, onOpenAuth, initialView = 'home', onViewChange,
  onOpenAdmin, onOpenLifestyle, onOpenHome, onOpenTogether,
  destinations, costs, favorites,
}) {
  const auth = useAuth();
  // The ?accountmock seam stands in for a signed-in account (T933).
  const mockUser = IS_ACCOUNT_MOCK && !ACCOUNT_MOCK_GUEST ? MOCK_USER : null;
  const user = IS_ACCOUNT_MOCK ? mockUser : auth.user;
  const hasPassword = IS_ACCOUNT_MOCK ? true : auth.hasPassword;
  const configured = auth.configured || ACCOUNT_MOCK_GUEST;
  const {
    signOut, signOutOtherDevices, updatePassword, reauthenticate,
    updateProfile, sendPasswordReset, deleteAccount, exportUserData,
  } = auth;
  const { t, lang, languages } = useI18n();
  // One ai_status read for the whole app, owned by PaywallProvider, so the
  // balance shown here cannot disagree with the balance a gate enforced.
  const paywall = usePaywall();
  const [mockEnt, setMockEnt] = useState(() => (mockUser ? mockEntitlement() : null));
  const entitlement = mockEnt || paywall.entitlement;
  // Whether the staff door shows at all. A hint, not a gate: every admin RPC
  // re-checks membership on the server.
  const { isAdmin } = useIsAdmin();
  const facts = useAccountFacts({ user, destinations, favorites });
  const panelRef = useRef(null);
  const headRef = useRef(null);
  const [view, setView] = useState(() => normalView(initialView));
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [imprintOpen, setImprintOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [cookiesOpen, setCookiesOpen] = useState(false);

  const storedName = user?.user_metadata?.full_name?.trim() || '';
  const storedEmail = user?.email || '';

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

  // T936: the password form opens in place under its row.
  const [pwOpen, setPwOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutErr, setSignOutErr] = useState('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // The data export carries the same arm-then-confirm shape as deletion, and
  // the same re-auth, because the file it produces is the whole account in
  // one place: a session left open on an unlocked phone should not be enough
  // to walk off with it. It is not in the danger zone, though, because
  // downloading your own data is not dangerous and filing it under a red
  // heading would make a right look like a threat.
  const [exportArmed, setExportArmed] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportEmail, setExportEmail] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportDone, setExportDone] = useState(false);

  // The open question is keyed by its i18n key, not its index: with the
  // answers grouped, an index is only unique within one group.
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
    if (IS_ACCOUNT_MOCK) {
      setStoredHandle(MOCK_PROFILE.handle); setHandle(MOCK_PROFILE.handle);
      setAvatarEmoji(MOCK_PROFILE.avatarEmoji); setStoredAvatar(MOCK_PROFILE.avatarEmoji);
      return undefined;
    }
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
  useEffect(() => { onViewChange?.(view); }, [view, onViewChange]);
  // Back and Forward step through the sections: App hands the address's
  // view back in, and the page follows it.
  useEffect(() => { setView(normalView(initialView)); }, [initialView]);

  // A subview keeps the hub's scroll position otherwise, and "page two opens
  // halfway down" reads as a rendering bug.
  // The heading takes focus on every step (carta-design "Navigation").
  const firstView = useRef(true);
  useEffect(() => {
    panelRef.current?.scrollTo?.(0, 0);
    if (firstView.current) { firstView.current = false; return; }
    headRef.current?.focus?.({ preventScroll: true });
  }, [view]);

  // Signing out while on the profile spoke leaves a form for nobody.
  useEffect(() => {
    if (!user && !GUEST_VIEWS.has(view)) setView('home');
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
      setProfileError(authErrorText(err, t, 'account.errGeneric'));
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
      setPwError(authErrorText(err, t, 'account.errGeneric'));
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
      setPwError(authErrorText(err, t, 'account.errGeneric'));
    } finally {
      setPwLoading(false);
    }
  };

  /**
   * GDPR Article 20: hand the traveller their own data as a JSON file.
   *
   * The gate is deliberately the same one deletion uses, down to the
   * Google-only fallback of typing the address, so there is one story about
   * proving who you are in this panel rather than two.
   *
   * The download is a Blob and an object URL rather than a data: URI, because
   * a large trip archive would overflow what a URI can carry, and the object
   * URL is revoked as soon as the click has been dispatched so the file does
   * not sit in memory for the life of the tab.
   */
  const handleExportData = async () => {
    setExportError('');
    setExportDone(false);
    if (hasPassword && !exportPassword) { setExportError(t('account.errCurrentPasswordMissing')); return; }
    if (!hasPassword && exportEmail.trim().toLowerCase() !== storedEmail.toLowerCase()) {
      setExportError(t('account.errDeleteEmail'));
      return;
    }
    setExportBusy(true);
    try {
      if (hasPassword) {
        try {
          await reauthenticate(exportPassword);
        } catch {
          setExportError(t('account.errCurrentPassword'));
          setExportBusy(false);
          return;
        }
      }
      const data = await exportUserData();
      // Indented, because a person exercising a data right should be able to
      // open the file and read it. Minifying it would save bytes nobody is
      // counting and cost the one thing the file is for.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carta-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportDone(true);
      setExportPassword('');
      setExportEmail('');
      setExportArmed(false);
    } catch (err) {
      // Most likely export_user_data() is not installed yet. Say so rather
      // than failing silently on a compliance path.
      setExportError(authErrorText(err, t, 'account.errGeneric'));
    } finally {
      setExportBusy(false);
    }
  };

  const disarmExport = () => {
    setExportArmed(false);
    setExportPassword('');
    setExportEmail('');
    setExportError('');
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
      // T936: a yearly plan that would renew is cancelled first, so the
      // card is never charged for an account that is gone (delete_user()
      // erases the rows but not the Stripe subscription). If that fails,
      // nothing is deleted and the traveller is told.
      const sub = entitlement.subscription;
      if (sub?.live && !sub.cancelling) {
        const res = await planActions.cancel();
        if (!res?.ok) {
          setDeleteError(t('account.planFailed'));
          setDeleteBusy(false);
          return;
        }
      }
      await deleteAccount();
      onClose();
    } catch (err) {
      // Most likely the delete_user() RPC isn't installed yet; keep the user
      // informed rather than failing silently on a compliance-critical path.
      setDeleteError(authErrorText(err, t, 'account.errGeneric'));
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

  const locale = (languages.find((l) => l.code === lang) || languages[0]).bcp47;
  const travel = useTravelValues(t);
  const hrefOf = (v) => tabHref('account', undefined, { view: v });
  const go = (v) => setView(v);
  const signedIn = !!user;
  const langLabel = (languages.find((l) => l.code === lang) || languages[0]).label;
  const providers = Array.isArray(user?.identities) && user.identities.length
    ? user.identities.map((i) => i.provider) : (user?.app_metadata?.providers || []);
  // T946: the seam flips Google in memory; a real account reads its identities.
  const [mockGoogle, setMockGoogle] = useState(null);
  const google = mockGoogle ?? providers.includes('google');
  const otherSignIn = providers.some((p) => p !== 'google');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleErr, setGoogleErr] = useState('');
  const googleErrText = (e) => {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    if (code === 'manual_linking_disabled' || /manual linking/i.test(msg)) return t('ac2.linkOff');
    if (code === 'identity_already_exists' || /already linked|already exists/i.test(msg)) return t('ac2.linkTaken');
    if (code === 'single_identity_not_deletable') return t('ac2.unlinkLast');
    return t('account.errGeneric');
  };
  const toggleGoogle = async () => {
    setGoogleErr('');
    if (IS_ACCOUNT_MOCK) { setMockGoogle(!google); return; }
    setGoogleBusy(true);
    try {
      if (google) await auth.unlinkGoogle();
      else await auth.linkGoogle();
    } catch (e) {
      setGoogleErr(googleErrText(e));
    } finally {
      setGoogleBusy(false);
    }
  };

  // The plan in one line: its name and when it renews or ends.
  const tierKey = !signedIn ? 'free' : (TIERS[entitlement.tier] ? entitlement.tier : 'free');
  const sub = entitlement.subscription;
  const planWhen = !signedIn || !entitlement.known ? ''
    : tierKey === 'year' && sub?.live && !sub.cancelling ? t('account.planRenews', { date: fmtDate(sub.renewsAt || entitlement.expiresAt, locale) })
      : tierKey === 'year' && sub?.cancelling ? t('account.planEnds', { date: fmtDate(sub.renewsAt || entitlement.expiresAt, locale) })
        : tierKey !== 'free' && entitlement.expiresAt ? t('ac.until', { date: fmtDate(entitlement.expiresAt, locale) })
          : '';
  const plansLine = signedIn && entitlement.known && entitlement.plansCap > 0
    ? t('ac.leftOf', { left: entitlement.plansLeft, cap: entitlement.plansCap }) : '';

  const tg = useTogether();
  const visibility = tg.signedIn ? tg.visibility : DEFAULT_VISIBILITY;
  const seeValue = listValue([
    visibility.showCountries && t('tg.seeCountries'),
    visibility.showSaves && t('tg.seeSaves'),
    visibility.showTips && t('tg.seeTips'),
  ], lang);
  const keepsValue = listValue([
    facts.trips != null && t(facts.trips === 1 ? 'ac.tripsOne' : 'ac.tripsMany', { n: facts.trips }),
    facts.saves != null && t(facts.saves === 1 ? 'ac.savesOne' : 'ac.savesMany', { n: facts.saves }),
  ], lang);

  // The sections in rail order. Signed out: Your travel, Preferences, Help.
  const SECTIONS = [
    { v: 'travel', Icon: PlaneIcon, label: t('ac.travel') },
    signedIn && { v: 'plan', Icon: TicketIcon, label: t('ac.plan') },
    { v: 'prefs', Icon: GlobeIcon, label: t('account.preferences') },
    signedIn && { v: 'together', Icon: FriendsIcon, label: t('tg.title') },
    signedIn && { v: 'security', Icon: LockIcon, label: t('account.menuSecurity') },
    signedIn && { v: 'data', Icon: ShieldIcon, label: t('account.dataTitle') },
    { v: 'help', Icon: QuestionIcon, label: t('side.help') },
  ].filter(Boolean);
  const railOn = PARENT[view] === 'home' ? 'home' : (PARENT[view] || view);
  const titleOf = (v) => (v === 'home' ? t('account.tag') : SECTIONS.find((x) => x.v === v)?.label || t('account.tag'));

  // The plan's controls: lib/billing.js, or the seam's stand-ins, which
  // change the fixture the way the webhook would change the row.
  const [planSaid, setPlanSaid] = useState('');
  const keepPlan = useCallback(() => setView('plan'), []);
  const mockSub = (patch) => {
    setMockEnt((m) => ({ ...m, subscription: { ...m.subscription, ...patch } }));
    return Promise.resolve({ ok: true, mock: true });
  };
  const planActions = mockEnt ? {
    cancel: () => mockSub({ cancelling: true }),
    resume: () => mockSub({ cancelling: false }),
    portal: () => Promise.resolve({ ok: true, mock: true }),
  } : { cancel: cancelYearly, resume: resumeYearly, portal: openBillingPortal };

  // Signing out keeps Account open on its signed-out Overview.
  const doSignOut = () => { setView('home'); signOut(); };
  // Every device, this one too (Supabase's global scope).
  const signOutEverywhere = async () => {
    setSignOutErr('');
    setSignOutBusy(true);
    try {
      await auth.signOutEverywhere();
      setView('home');
    } catch {
      setSignOutErr(t('account.errGeneric'));
    } finally {
      setSignOutBusy(false);
    }
  };
  // What deleting does to the pass, said inside the delete confirm.
  const passNote = !entitlement.known ? ''
    : entitlement.tier === 'year' && sub?.live && !sub.cancelling ? t('ac.deleteEndsYear')
      : entitlement.tier === 'trip' ? t('ac.deleteEndsTrip') : '';

  const railLink = (v, Icon, label) => (
    <a
      key={v}
      className="ac-rail-a"
      href={hrefOf(v)}
      aria-current={railOn === v ? 'page' : undefined}
      onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); go(v); }}
    >
      <Icon size={20} />
      <span>{label}</span>
    </a>
  );

  const rail = (
    <nav className="ac-rail" aria-label={t('account.tag')}>
      {railLink('home', PersonIcon, t('account.menuOverview'))}
      {SECTIONS.map((x) => railLink(x.v, x.Icon, x.label))}
      {signedIn && (
        <>
          <hr className="ac-rail-hr" />
          <Button variant="quiet" className="ac-rail-out" iconStart={<SignOutIcon size={20} />} onClick={doSignOut}>
            {t('account.signOut')}
          </Button>
        </>
      )}
    </nav>
  );

  const legal = (
    <div className="ac-foot">
      <Button variant="quiet" size="sm" onClick={() => setPrivacyOpen(true)}>{t('account.privacyPolicy')}</Button>
      <Button variant="quiet" size="sm" onClick={() => setTermsOpen(true)}>{t('account.terms')}</Button>
      <Button variant="quiet" size="sm" onClick={() => setImprintOpen(true)}>{t('account.imprint')}</Button>
      <Button variant="quiet" size="sm" onClick={() => setCookiesOpen(true)}>{t('ac2.cookies')}</Button>
    </div>
  );

  const helpRows = (
    <>
      <Row icon={QuestionIcon} label={t('account.menuFaq')} href={hrefOf('faq')} onClick={() => go('faq')} />
      <Row icon={ReceiptIcon} label={t('account.numbers')} href={NUMBERS_HREF} external />
      <Row icon={FeedbackIcon} label={t('account.menuFeedback')} href={hrefOf('feedback')} onClick={() => go('feedback')} />
      <Row icon={ShareIcon} label={t('account.inviteBtn')} value={shareCopied ? t('account.inviteCopied') : null} onClick={handleShare} />
      {onOpenHome && (
        <Row icon={HomeIcon} label={t('nav.howCartaWorks')} href={tabHref('home')} onClick={() => onOpenHome()} className="ac-phone-only" />
      )}
      {!signedIn && paywall.openPricingPage && (
        <Row icon={TicketIcon} label={t('ac.plansPrices')} href={tabHref('pricing')} onClick={() => paywall.openPricingPage()} />
      )}
      {signedIn && isAdmin && (
        <Row icon={LockIcon} label={t('account.menuAdmin')} onClick={() => { onClose?.(); onOpenAdmin?.(); }} />
      )}
    </>
  );

  const travelRows = travel ? (
    <>
      <Row icon={MapPinIcon} label={t('ac.home')} value={travel.home} href={hrefOf('travel')} onClick={() => go('travel')} />
      <Row icon={FriendsIcon} label={t('ac.travellers')} value={travel.people} href={hrefOf('travel')} onClick={() => go('travel')} />
      <Row icon={BedIcon} label={t('ac.stay')} value={`${travel.bed}, ${travel.vibe}`} href={hrefOf('travel')} onClick={() => go('travel')} />
      {travel.party > 1 && (
        <Row icon={ReceiptIcon} label={t('party.view')} value={travel.priceView} href={hrefOf('travel')} onClick={() => go('travel')} />
      )}
    </>
  ) : null;

  // The identity card: face, name, handle, plan; then three counts.
  const nums = [
    facts.trips != null && { k: 'trips', n: facts.trips, label: t('ac.nTrips') },
    facts.countries != null && { k: 'countries', n: facts.countries, label: t('ac.nCountries') },
    facts.friends != null && { k: 'friends', n: facts.friends, label: t('ac.nFriends') },
  ].filter(Boolean);
  const identity = signedIn && (
    <a
      className="ac-me"
      href={hrefOf('profile')}
      onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); go('profile'); }}
      aria-label={t('ac.editProfileAria', { name: storedName || storedEmail })}
    >
      <span className="ac-face" aria-hidden="true">{avatarEmoji || monogram(storedName, storedEmail)}</span>
      <span className="ac-me-tx">
        <b>{storedName || storedEmail}</b>
        {storedHandle ? <span>@{storedHandle}</span> : storedName ? <span>{storedEmail}</span> : null}
      </span>
      {entitlement.known && (
        <Chip kind="status" tone="neutral" className="ac-me-plan">{t(TIERS[tierKey].labelKey)}</Chip>
      )}
      {nums.length > 0 && (
        <dl className="ac-nums">
          {nums.map((x) => (
            <div key={x.k}>
              <dt>{x.label}</dt>
              <dd>{x.n}</dd>
            </div>
          ))}
        </dl>
      )}
    </a>
  );

  const overview = (
    <>
      <h1 className="ac-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('account.tag')}</h1>
      {identity}
      {!signedIn && configured && (
        <section className="ac-signin" aria-labelledby="ac-signin-h">
          <h2 className="ac-signin-h" id="ac-signin-h">{t('ac.signInTitle')}</h2>
          <div className="ac-signin-btns">
            <GoogleButton />
            <Button variant="primary" onClick={onOpenAuth}>{t('ac.signInEmail')}</Button>
          </div>
        </section>
      )}
      <Group id="ac-g-travel" title={t('ac.travel')}>{travelRows}</Group>
      {signedIn && (
        <Group id="ac-g-plan" title={t('ac.plan')}>
          <Row icon={TicketIcon} label={t(TIERS[tierKey].labelKey)} value={planWhen} href={hrefOf('plan')} onClick={() => go('plan')} />
          {plansLine && <Row icon={SparkIcon} label={t('ac.meterPlans')} value={plansLine} href={hrefOf('plan')} onClick={() => go('plan')} />}
        </Group>
      )}
      <Group id="ac-g-prefs" title={t('account.preferences')}>
        <Row icon={GlobeIcon} label={t('account.language')} value={langLabel} href={hrefOf('prefs')} onClick={() => go('prefs')} />
        <Row icon={ReceiptIcon} label={t('ac.currency')} value={t('ac.currencyEur')} href={hrefOf('prefs')} onClick={() => go('prefs')} />
      </Group>
      {signedIn && (
        <Group id="ac-g-tg" title={t('tg.title')}>
          {storedHandle && <Row icon={PersonIcon} label={t('profile.handle')} value={`@${storedHandle}`} href={hrefOf('together')} onClick={() => go('together')} />}
          <Row icon={EyeIcon} label={t('tg.friendsSee')} value={seeValue} href={hrefOf('together')} onClick={() => go('together')} />
        </Group>
      )}
      {signedIn && (
        <Group id="ac-g-sec" title={t('account.menuSecurity')}>
          <Row icon={LockIcon} label={t('account.email')} value={storedEmail} href={hrefOf('security')} onClick={() => go('security')} />
          <Row icon={LinkIcon} label={t('ac.google')} value={t(google ? 'ac.connected' : 'ac.notConnected')} href={hrefOf('security')} onClick={() => go('security')} />
        </Group>
      )}
      {signedIn && (
        <Group id="ac-g-data" title={t('account.dataTitle')}>
          <Row icon={ShieldIcon} label={t('ac.keeps')} value={keepsValue} href={hrefOf('data')} onClick={() => go('data')} />
          <Row icon={DownloadIcon} label={t('account.exportBtn')} href={hrefOf('data')} onClick={() => go('data')} />
        </Group>
      )}
      <Group id="ac-g-help" title={t('side.help')}>{helpRows}</Group>
      {signedIn && (
        <Button className="ac-signout" iconStart={<SignOutIcon size={20} />} onClick={doSignOut}>{t('account.signOut')}</Button>
      )}
      {legal}
    </>
  );

  // A section's head: the back link (on a phone always to the Overview; on
  // a desktop only under a section, to it), then the one h1.
  const parent = PARENT[view] || 'home';
  const head = (title) => (
    <div className="ac-head">
      <a
        className="ac-back ac-back-phone"
        href={hrefOf('home')}
        onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); go('home'); }}
      >
        <ArrowLeftIcon size={16} />
        {t('account.tag')}
      </a>
      {parent !== 'home' && (
        <a
          className="ac-back ac-back-desk"
          href={hrefOf(parent)}
          onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); go(parent); }}
        >
          <ArrowLeftIcon size={16} />
          {titleOf(parent)}
        </a>
      )}
      <h1 className="ac-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{title}</h1>
    </div>
  );

  const profileForm = (
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
              {profileError && <div className="auth-error" role="alert">{profileError}</div>}
              {profileNotice && <div className="auth-notice auth-notice-inline">{profileNotice}</div>}
              <button type="submit" className="auth-submit" disabled={!profileDirty || profileBusy}>
                {profileBusy ? t('account.pleaseWait') : t('account.saveProfile')}
              </button>
            </form>
          </div>

    </>
  );

  const securityForm = (
    <>
          <div className="panel-section ac-inline">
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
                {pwError && <div className="auth-error" role="alert">{pwError}</div>}
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
                {pwError && <div className="auth-error" role="alert">{pwError}</div>}
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

    </>
  );

  // Your data's two confirms, each opened in place under its row (T936).
  const exportForm = (
    <div className="panel-section ac-inline">
              <>
                <p className="account-section-hint">{t('account.exportConfirmHint')}</p>
                {hasPassword ? (
                  <PasswordField
                    id="acct-export-pw"
                    label={t('account.deleteConfirmPassword')}
                    value={exportPassword}
                    onChange={setExportPassword}
                    autoComplete="current-password"
                    placeholder={t('account.currentPasswordPlaceholder')}
                  />
                ) : (
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="acct-export-email">
                      {t('account.deleteConfirmEmail', { email: storedEmail })}
                    </label>
                    <input
                      id="acct-export-email"
                      type="text"
                      autoComplete="off"
                      value={exportEmail}
                      onChange={(e) => setExportEmail(e.target.value)}
                    />
                  </div>
                )}
                {exportError && <div className="auth-error" role="alert">{exportError}</div>}
                <div className="account-delete-actions">
                  <button className="book-btn secondary" onClick={disarmExport}>
                    {t('account.exportCancel')}
                  </button>
                  <button className="book-btn" onClick={handleExportData} disabled={exportBusy}>
                    {exportBusy ? t('account.pleaseWait') : t('account.exportConfirm')}
                  </button>
                </div>
              </>
    </div>
  );
  const exportDoneLine = (
    <>
                {exportDone && (
                  <div className="auth-banner" role="status">
                    <CheckIcon size={14} />
                    <span className="auth-banner-text">{t('account.exportDone')}</span>
                    <button
                      type="button"
                      className="auth-banner-x"
                      onClick={() => setExportDone(false)}
                      aria-label={t('account.dismissNotice')}
                    >
                      <CloseIcon size={13} />
                    </button>
                  </div>
                )}
    </>
  );
  const deleteForm = (
    <div className="panel-section ac-inline account-danger">
                <>
                  <p className="account-danger-text">{t('account.deleteHint')}</p>
                  {/* Deleting the account also ends what the pass would do
                      next: a yearly plan is cancelled first (handleDeleteAccount),
                      a Trip Pass simply ends with the account. */}
                  {passNote && <p className="account-danger-text">{passNote}</p>}
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
                  {deleteError && <div className="auth-error" role="alert">{deleteError}</div>}
                  <div className="account-delete-actions">
                    <button className="book-btn secondary" onClick={disarmDelete}>
                      {t('account.deleteKeep')}
                    </button>
                    <button className="book-btn account-delete-btn" onClick={handleDeleteAccount} disabled={deleteBusy}>
                      {deleteBusy ? t('account.pleaseWait') : t('account.deleteForever')}
                    </button>
                  </div>
                </>
    </div>
  );

  let pane = null;
  if (view === 'home') pane = overview;

  if (view === 'travel') {
    pane = (
      <TravelView
        head={head(t('ac.travel'))}
        destinations={destinations}
        costs={costs}
        preferId={facts.nextTripDest}
        onOpenLifestyle={onOpenLifestyle}
      />
    );
  }

  if (view === 'prefs') pane = <PrefsView head={head(t('account.preferences'))} userId={user?.id || null} />;

  if (view === 'plan' && signedIn) {
    pane = (
      <PlanView
        head={head(t('ac.plan'))}
        entitlement={entitlement}
        actions={planActions}
        said={planSaid}
        setSaid={setPlanSaid}
        onGoCancel={() => go('cancel')}
        onChangePlan={() => paywall.openPrices('browse')}
        onPricingPage={paywall.openPricingPage}
      />
    );
  }

  if (view === 'cancel' && signedIn) {
    pane = (
      <CancelView
        head={head(t('account.planCancel'))}
        entitlement={entitlement}
        actions={planActions}
        onKeep={keepPlan}
        onDone={(line) => { setPlanSaid(line); go('plan'); }}
      />
    );
  }

  if (view === 'together' && signedIn) {
    pane = (
      <>
        {head(t('tg.title'))}
        <Group id="ac-tg">
          {storedHandle && (
            <Row icon={PersonIcon} label={t('profile.handle')} value={`@${storedHandle}`} href={hrefOf('profile')} onClick={() => go('profile')} />
          )}
          <Row icon={EyeIcon} label={t('tg.friendsSee')} value={seeValue} href={tabHref('together', undefined, { view: 'privacy' })} onClick={() => onOpenTogether?.('privacy')} />
        </Group>
        <Button className="ac-signout" iconStart={<FriendsIcon size={20} />} onClick={() => onOpenTogether?.('home')}>{t('ac.openTogether')}</Button>
      </>
    );
  }

  if (view === 'help') {
    pane = (
      <>
        {head(t('side.help'))}
        <Group id="ac-help">{helpRows}</Group>
        {legal}
      </>
    );
  }

  if (view === 'faq') pane = <>{head(t('account.menuFaq'))}<FaqView onFeedback={() => go('feedback')} /></>;
  if (view === 'feedback') pane = <>{head(t('account.feedbackTitle'))}<FeedbackView /></>;

  if (view === 'profile' && user) {
    pane = (
      <>
        {head(t('account.profileDetails'))}
        {profileForm}
      </>
    );
  }

  if (view === 'security' && user) {
    pane = (
      <>
        {head(t('account.menuSecurity'))}
        <Group id="ac-sec">
          <Row icon={LockIcon} label={t('account.email')} value={storedEmail} href={hrefOf('profile')} onClick={() => go('profile')} />
          <Row
            icon={LockIcon}
            label={t('ac.password')}
            value={hasPassword ? t('ac.change') : t('ac.notSet')}
            expanded={pwOpen}
            onClick={() => setPwOpen((o) => !o)}
          />
          {(pwOpen || pwNotice) && securityForm}
          <Row icon={LinkIcon} label={t('ac.google')} value={t(google ? 'ac.connected' : 'ac.notConnected')} className="ac-act-row">
            {(!google || otherSignIn) && (
              <Button variant="quiet" size="sm" loading={googleBusy} onClick={toggleGoogle}
                aria-label={t(google ? 'ac2.disconnectGoogle' : 'ac2.connectGoogle')}>
                {t(google ? 'ac2.disconnect' : 'ac2.connect')}
              </Button>
            )}
          </Row>
        </Group>
        {googleErr && <div className="auth-error" role="alert">{googleErr}</div>}
        {signOutErr && <div className="auth-error" role="alert">{signOutErr}</div>}
        <Button className="ac-signout" iconStart={<SignOutIcon size={20} />} loading={signOutBusy} onClick={signOutEverywhere}>
          {t('ac.signOutAll')}
        </Button>
      </>
    );
  }

  if (view === 'data' && user) {
    const know = [
      ['trips', facts.trips, 'ac.nTrips'], ['saves', facts.saves, 'ac.nSaves'], ['photos', facts.photos, 'ac.nPhotos'],
      ['days', facts.dayPlans, 'ac.nDayPlans'], ['friends', facts.friends, 'ac.nFriends'], ['chats', facts.chats, 'ac.nChats'],
    ].filter(([, n]) => n != null);
    pane = (
      <>
        {head(t('account.dataTitle'))}
        {know.length > 0 && (
          <dl className="ac-know" aria-label={t('ac.keeps')}>
            {know.map(([k, n, label]) => (
              <div key={k}><dt>{t(label)}</dt><dd>{n}</dd></div>
            ))}
          </dl>
        )}
        <Group id="ac-data">
          <Row
            icon={DownloadIcon}
            label={t('account.exportBtn')}
            expanded={exportArmed}
            onClick={() => { if (exportArmed) disarmExport(); else { setExportArmed(true); setExportDone(false); } }}
          />
          {exportArmed && exportForm}
          {exportDone && <div className="panel-section ac-inline">{exportDoneLine}</div>}
          <Row icon={SparkIcon} label={t('ac.ai')} href={hrefOf('ai')} onClick={() => go('ai')} />
          <Row icon={ShieldIcon} label={t('account.privacyPolicy')} onClick={() => setPrivacyOpen(true)} />
          <Row icon={EyeOffIcon} label={t('ac2.cookies')} onClick={() => setCookiesOpen(true)} />
        </Group>
        <Group id="ac-del">
          <Row
            icon={TrashIcon}
            label={t('account.deleteBtn')}
            danger
            expanded={deleteArmed}
            onClick={() => { if (deleteArmed) disarmDelete(); else setDeleteArmed(true); }}
          />
          {deleteArmed && deleteForm}
        </Group>
      </>
    );
  }

  if (view === 'ai' && user) pane = <AiView head={head(t('ac.ai'))} />;

  return (
    <div className="saved-shell account-shell">
      <div className="panel open account-panel saved-trips-panel ac-panel" ref={panelRef}>
        <div className={`ac-page${view === 'home' ? ' is-home' : ''}`}>
          {rail}
          <div className="ac-pane">{pane}</div>
        </div>
        {/* The legal texts render at document.body, not inside the panel:
            the panel's transform would pin a fixed overlay to its own box. */}
        {privacyOpen && createPortal(<PrivacyPolicy onClose={() => setPrivacyOpen(false)} />, document.body)}
        {imprintOpen && createPortal(<Imprint onClose={() => setImprintOpen(false)} />, document.body)}
        {termsOpen && createPortal(<TermsOfService onClose={() => setTermsOpen(false)} />, document.body)}
        {cookiesOpen && createPortal(<CookiesPage onClose={() => setCookiesOpen(false)} />, document.body)}
        <SiteFooter />
      </div>
    </div>
  );
}
