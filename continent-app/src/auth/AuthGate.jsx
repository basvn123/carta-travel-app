import React, { useState } from 'react';
import { BrandMark, BrandWordmark } from '../components/BrandMarks.jsx';
import { Button } from '../components/ui/Button.jsx';
import { GoogleButton } from './GoogleButton.jsx';
import { PrivacyPolicy } from '../components/PrivacyPolicy.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * Full-screen entry gate shown on load whenever there's no active session and
 * the visitor hasn't already chosen to continue as a guest (App.jsx tracks
 * that choice in localStorage). Mirrors ResetPasswordScreen's solid-overlay
 * takeover so it reads as part of the same auth flow, not a separate page.
 *
 * House style (account lane, 2026-11): the wordmark slot (blaze and name),
 * one primary (Sign in), Create account as the secondary, the guest and
 * privacy links quiet. Same four doors, same handlers.
 */
export function AuthGate({ onSignIn, onSignUp, onGuest }) {
  const { t } = useI18n();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  return (
    <div className="auth-overlay auth-overlay-solid">
      <div className="auth-modal auth-gate hs-dialog-in">
        <div className="auth-brand auth-brand-center">
          <BrandMark className="auth-brand-mark" />
          <span className="auth-brand-name"><BrandWordmark /></span>
        </div>

        <h2 className="auth-title auth-gate-title">{t('gate.title')}</h2>

        <div className="auth-gate-actions">
          <Button variant="primary" block className="auth-go" onClick={onSignIn}>
            {t('gate.signIn')}
          </Button>
          <Button variant="secondary" block className="auth-go auth-go-ghost" onClick={onSignUp}>
            {t('gate.signUp')}
          </Button>
          <GoogleButton />
        </div>

        <Button variant="quiet" className="auth-link auth-gate-guest" onClick={onGuest}>
          {t('gate.guest')}
        </Button>

        <Button variant="quiet" size="sm" className="auth-link auth-gate-privacy" onClick={() => setPrivacyOpen(true)}>
          {t('account.privacyPolicy')}
        </Button>
      </div>
      {privacyOpen && <PrivacyPolicy onClose={() => setPrivacyOpen(false)} />}
    </div>
  );
}
