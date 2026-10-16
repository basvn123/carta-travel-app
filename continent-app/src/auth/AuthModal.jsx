import React, { useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import Logo from '../components/Logo.jsx';
import { useAuth } from './AuthContext.jsx';
import { authErrorText } from './authErrors.js';
import { GoogleButton } from './GoogleButton.jsx';
import { PasswordField } from './PasswordField.jsx';
import { CloseIcon } from '../components/Icons.jsx';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordStrength.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * Sign in / create account / forgot password, in one overlay. Mirrors the
 * ComparePanel overlay+modal pattern so it feels native to the rest of the app.
 */
export function AuthModal({ onClose, initialMode = 'signin' }) {
  // A dialog for the keyboard and a screen reader too (T186): focus moves in,
  // Tab stays inside, Escape closes it and focus goes back to the opener.
  const cardRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap(cardRef, onClose, { initialFocusRef: closeRef });
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState(initialMode); // signin | signup | forgot
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const reset = () => { setError(''); setNotice(''); };

  const switchMode = (next) => {
    reset();
    setFullName('');
    setPassword('');
    setConfirmPassword('');
    setMode(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    reset();

    if (mode === 'forgot') {
      if (!email) { setError(t('auth.errEnterEmail')); return; }
      setLoading(true);
      try {
        await sendPasswordReset(email);
        setNotice(t('auth.noticeResetSent', { email }));
      } catch (err) {
        setError(authErrorText(err, t, 'auth.errGeneric'));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email || !password) { setError(t('auth.errEnterEmailPassword')); return; }
    if (mode === 'signup') {
      if (!fullName.trim()) { setError(t('auth.errEnterName')); return; }
      if (password.length < MIN_PASSWORD_LENGTH) { setError(t('auth.errPasswordShort', { n: MIN_PASSWORD_LENGTH })); return; }
      if (password !== confirmPassword) { setError(t('auth.errPasswordMismatch')); return; }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { needsEmailConfirmation } = await signUp(email, password, fullName.trim());
        if (needsEmailConfirmation) {
          setNotice(t('auth.noticeConfirmSent', { email }));
        } else {
          onClose();
        }
      } else {
        await signIn(email, password);
        onClose();
      }
    } catch (err) {
      setError(authErrorText(err, t, 'auth.errGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    signin: t('auth.titleSignin'),
    signup: t('auth.titleSignup'),
    forgot: t('auth.titleForgot'),
  };
  const subs = {
    // Signing in and creating an account need no caption (owner, T461):
    // the title and the fields say it. Resetting keeps its one line, because
    // it says what will happen next.
    signin: '',
    signup: '',
    forgot: t('auth.subForgot'),
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} className="panel-close auth-close" onClick={onClose} aria-label={t('auth.close')}>
          <CloseIcon size={16} />
        </button>

        <div className="auth-brand">
          <Logo size={26} />
          <span className="auth-brand-name">Carta</span>
        </div>

        {mode !== 'forgot' && (
          <div className="segmented auth-tabs">
            <button
              className={mode === 'signin' ? 'seg-on' : ''}
              onClick={() => switchMode('signin')}
              type="button"
            >
              {t('auth.signIn')}
            </button>
            <button
              className={mode === 'signup' ? 'seg-on' : ''}
              onClick={() => switchMode('signup')}
              type="button"
            >
              {t('auth.createAccount')}
            </button>
          </div>
        )}

        <h2 className="auth-title" id="auth-modal-title">{titles[mode]}</h2>
        {subs[mode] && <p className="auth-sub">{subs[mode]}</p>}

        {mode !== 'forgot' && !notice && (
          <>
            <GoogleButton />
            <div className="auth-divider"><span>{t('auth.orWithEmail')}</span></div>
          </>
        )}

        {notice ? (
          <div className="auth-notice">
            {notice}
            <button type="button" className="auth-link" onClick={() => switchMode('signin')}>
              {t('auth.backToSignIn')}
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label className="auth-field">
                <span className="auth-label">{t('auth.fullName')}</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('auth.fullNamePlaceholder')}
                  autoFocus
                />
              </label>
            )}

            <label className="auth-field">
              <span className="auth-label">{t('auth.email')}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus={mode !== 'signup'}
              />
            </label>

            {/* The account's own password field (T390, brief V3-11): a
                reveal toggle, and no placeholder of eight dots, which read as
                a field already filled in. */}
            {mode !== 'forgot' && (
              <PasswordField
                id="auth-password"
                label={t('auth.password')}
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            )}

            {mode === 'signup' && (
              <PasswordField
                id="auth-password-confirm"
                label={t('auth.confirmPassword')}
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
            )}

            {mode === 'signin' && (
              <button
                type="button"
                className="auth-link auth-forgot"
                onClick={() => switchMode('forgot')}
              >
                {t('auth.forgotPassword')}
              </button>
            )}

            {error && <div className="auth-error" role="alert">{error}</div>}

            {/* The modal's one primary, in the accent like every other
                submit on the account surface (69-v6-account.css). */}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading
                ? t('auth.pleaseWait')
                : mode === 'signin' ? t('auth.signIn') : mode === 'signup' ? t('auth.createAccount') : t('auth.sendResetLink')}
            </button>

            {mode === 'forgot' && (
              <button type="button" className="auth-link auth-back" onClick={() => switchMode('signin')}>
                {t('auth.backToSignIn')}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
