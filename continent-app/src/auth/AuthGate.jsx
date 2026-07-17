import React from 'react';
import Logo from '../components/Logo.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * Full-screen entry gate shown on load whenever there's no active session and
 * the visitor hasn't already chosen to continue as a guest (App.jsx tracks
 * that choice in localStorage). Mirrors ResetPasswordScreen's solid-overlay
 * takeover so it reads as part of the same auth flow, not a separate page.
 */
export function AuthGate({ onSignIn, onSignUp, onGuest }) {
  const { t } = useI18n();
  return (
    <div className="auth-overlay auth-overlay-solid">
      <div className="auth-modal auth-gate">
        <div className="auth-brand auth-brand-center">
          <Logo size={34} />
          <span className="auth-brand-name">Carta</span>
        </div>

        <h2 className="auth-title auth-gate-title">{t('gate.title')}</h2>
        <p className="auth-sub auth-gate-sub">
          {t('gate.sub')}
        </p>

        <div className="auth-gate-actions">
          <button type="button" className="auth-submit" onClick={onSignIn}>
            {t('gate.signIn')}
          </button>
          <button type="button" className="auth-submit auth-submit-ghost" onClick={onSignUp}>
            {t('gate.signUp')}
          </button>
        </div>

        <button type="button" className="auth-link auth-gate-guest" onClick={onGuest}>
          {t('gate.guest')}
        </button>
      </div>
    </div>
  );
}
