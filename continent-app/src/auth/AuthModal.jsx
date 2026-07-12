import React, { useState } from 'react';
import Logo from '../Logo.jsx';
import { useAuth } from './AuthContext.jsx';

/**
 * Sign in / create account / forgot password, in one overlay. Mirrors the
 * ComparePanel overlay+modal pattern so it feels native to the rest of the app.
 */
export function AuthModal({ onClose, initialMode = 'signin' }) {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState(initialMode); // signin | signup | forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const reset = () => { setError(''); setNotice(''); };

  const switchMode = (next) => {
    reset();
    setPassword('');
    setConfirmPassword('');
    setMode(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    reset();

    if (mode === 'forgot') {
      if (!email) { setError('Enter your email address.'); return; }
      setLoading(true);
      try {
        await sendPasswordReset(email);
        setNotice(`If an account exists for ${email}, a reset link is on its way.`);
      } catch (err) {
        setError(err.message || 'Something went wrong. Try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email || !password) { setError('Enter your email and password.'); return; }
    if (mode === 'signup') {
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { needsEmailConfirmation } = await signUp(email, password);
        if (needsEmailConfirmation) {
          setNotice(`Almost there - we sent a confirmation link to ${email}.`);
        } else {
          onClose();
        }
      } else {
        await signIn(email, password);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    signin: 'Welcome back',
    signup: 'Create your account',
    forgot: 'Reset your password',
  };
  const subs = {
    signin: 'Sign in to save trips and sync your settings.',
    signup: 'Save trips, keep your preferences, pick up where you left off.',
    forgot: "We'll email you a link to set a new password.",
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close auth-close" onClick={onClose} aria-label="Close">x</button>

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
              Sign in
            </button>
            <button
              className={mode === 'signup' ? 'seg-on' : ''}
              onClick={() => switchMode('signup')}
              type="button"
            >
              Create account
            </button>
          </div>
        )}

        <h2 className="auth-title">{titles[mode]}</h2>
        <p className="auth-sub">{subs[mode]}</p>

        {notice ? (
          <div className="auth-notice">
            {notice}
            <button type="button" className="auth-link" onClick={() => switchMode('signin')}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </label>

            {mode !== 'forgot' && (
              <label className="auth-field">
                <span className="auth-label">Password</span>
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
                <span className="auth-label">Confirm password</span>
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
                Forgot password?
              </button>
            )}

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading
                ? 'Please wait…'
                : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </button>

            {mode === 'forgot' && (
              <button type="button" className="auth-link auth-back" onClick={() => switchMode('signin')}>
                Back to sign in
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
