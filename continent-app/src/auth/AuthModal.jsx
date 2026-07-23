import React, { useState } from 'react';
import Logo from '../components/Logo.jsx';
import { useAuth } from './AuthContext.jsx';
import { GoogleButton } from './GoogleButton.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * Sign in / create account / forgot password, in one overlay. Mirrors the
 * ComparePanel overlay+modal pattern so it feels native to the rest of the app.
 */
export function AuthModal({ onClose, initialMode = 'signin' }) {
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
        setError(err.message || t('auth.errGeneric'));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email || !password) { setError(t('auth.errEnterEmailPassword')); return; }
    if (mode === 'signup') {
      if (!fullName.trim()) { setError(t('auth.errEnterName')); return; }
      if (password.length < 6) { setError(t('auth.errPasswordShort')); return; }
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
      setError(err.message || t('auth.errGeneric'));
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
    signin: t('auth.subSignin'),
    signup: t('auth.subSignup'),
    forgot: t('auth.subForgot'),
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close auth-close" onClick={onClose} aria-label={t('auth.close')}>x</button>

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

        <h2 className="auth-title">{titles[mode]}</h2>
        <p className="auth-sub">{subs[mode]}</p>

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

            {mode !== 'forgot' && (
              <label className="auth-field">
                <span className="auth-label">{t('auth.password')}</span>
                <input
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
            )}

            {mode === 'signup' && (
              <label className="auth-field">
                <span className="auth-label">{t('auth.confirmPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
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

            {error && <div className="auth-error">{error}</div>}

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
